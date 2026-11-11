// 貸款設定從開放月份生效；已結月份讀自己的快照，不重算或覆寫舊本金。
import type { Database, Queryable } from '../db/driver.ts';
import { isValidMonth } from '../calc/dates.ts';
import { BudgetRuleError, effectiveRevision, openMonth } from '../calc/budgetEngine.ts';
import type { BudgetState } from '../calc/budgetTypes.ts';
import { addLoanAmounts as sum, calculateLoanReserve } from '../calc/loanReserve.ts';
import { readStoredDocument, writeState } from './financeDocument.ts';
import { ensureExpenseCategory } from './categoryLifecycle.ts';
import { hasLoanTables } from './loanMigration.ts';

export interface LoanInput {
  name: string;
  totalAmount: number;
  monthlyPayment: number;
  remainingPrincipal: number;
  expectedEndMonth: string;
}
export interface LoanWriteRequest extends LoanInput { version: number; hasEntitlement: boolean; reason: string }
export interface LoanView {
  id: number;
  categoryId: number | null;
  name: string;
  totalAmount: number | null;
  monthlyPayment: number;
  remainingPrincipal: number | null;
  expectedEndMonth: string | null;
  reserve: number;
  needsSetup: boolean;
}
export interface LoansLedger {
  listLoans(month?: string): Promise<LoanView[]>;
  listLoanRevisions(id: number): Promise<LoanRevision[]>;
  createLoan(input: LoanWriteRequest): Promise<{ id: number }>;
  updateLoan(id: number, input: LoanWriteRequest): Promise<void>;
}
export interface LoanRevision extends Omit<LoanView, 'id' | 'categoryId' | 'reserve' | 'needsSetup' | 'monthlyPayment'> {
  /** null 表示舊學費設定沿用當月上限版本。 */
  monthlyPayment: number | null;
  id: number;
  loanId: number;
  month: string;
  reason: string;
  time: string;
}
interface LoanRow extends Omit<LoanView, 'reserve' | 'needsSetup' | 'monthlyPayment'> { month: string; legacy: number; monthlyPayment: number | null }

export async function loanViews(q: Queryable, month: string, state?: BudgetState): Promise<LoanView[]> {
  if (!isValidMonth(month)) throw new BudgetRuleError('argument', '月份格式不正確，請用 YYYY-MM。');
  if (!await hasLoanTables(q)) return [];
  state ??= (await readStoredDocument(q)).state;
  const rows = await q.all<LoanRow>(`SELECT l.id, l.category_id AS categoryId, l.legacy,
    t.month, t.name, t.total_amount AS totalAmount, t.monthly_payment AS monthlyPayment,
    t.remaining_principal AS remainingPrincipal, t.expected_end_month AS expectedEndMonth
    FROM loans l JOIN loan_terms t ON t.loan_id = l.id
    WHERE t.id = (SELECT v.id FROM loan_terms v WHERE v.loan_id = l.id AND v.month <= ? ORDER BY v.month DESC, v.id DESC LIMIT 1)
    ORDER BY l.id`, [month]);
  const active = new Set(state.months.filter((m) => m.month <= month).map((m) => m.id));
  const snapshots = (await q.all<{ close_id: string; loan_id: number; month: string; snapshot: string }>(
    'SELECT close_id, loan_id, month, snapshot FROM loan_closes ORDER BY month')).filter((s) => active.has(s.close_id));
  return rows.map(({ month: termMonth, legacy, ...row }) => {
    const history = snapshots.filter((s) => s.loan_id === row.id);
    const exact = history.find((s) => s.month === month);
    if (exact) {
      const { contribution: _contribution, payment: _payment, ...view } = JSON.parse(exact.snapshot) as LoanClose;
      return view;
    }
    const previous = history.at(-1);
    const latest = state!.months.filter((m) => m.month <= month).sort((a, b) => a.month.localeCompare(b.month)).at(-1);
    const otherReserve = latest ? snapshots.filter((s) => s.close_id === latest.id && s.loan_id !== row.id)
      .reduce((n, s) => sum(n, (JSON.parse(s.snapshot) as LoanClose).reserve), 0) : 0;
    return { ...row,
      monthlyPayment: row.monthlyPayment ?? effectiveRevision(state!, month)?.tuition ?? 0,
      remainingPrincipal: row.remainingPrincipal === null ? null : sum(row.remainingPrincipal,
        -history.filter((s) => s.month >= termMonth).reduce((n, s) => sum(n, (JSON.parse(s.snapshot) as LoanClose).payment), 0)),
      reserve: previous ? (JSON.parse(previous.snapshot) as LoanView).reserve : legacy ? sum(latest?.tuition ?? 0, -otherReserve) : 0,
      needsSetup: row.remainingPrincipal === null };
  });
}

interface LoanClose extends LoanView { contribution: number; payment: number }

export async function prepareLoanClose(q: Queryable, state: BudgetState, month: string) {
  const loans = await loanViews(q, month, state);
  const rows: LoanClose[] = [];
  for (const loan of loans) {
    const payments = loan.categoryId === null ? [] : await q.all<{ amount: number }>(
      "SELECT amount FROM transactions WHERE category_id = ? AND flow = 'expense' AND substr(date, 1, 7) = ?", [loan.categoryId, month]);
    const payment = payments.reduce((n, p) => sum(n, p.amount), 0);
    rows.push({ ...loan, ...calculateLoanReserve(loan, payment) });
  }
  return { rows, totals: rows.length ? { contribution: rows.reduce((n, l) => sum(n, l.contribution), 0),
    payment: rows.reduce((n, l) => sum(n, l.payment), 0) } : undefined };
}

/** 貸款有自己的提撥與扣款，不再計入一般預算的照實支或未歸屬清單。 */
export async function loanCategoryNames(q: Queryable, month: string): Promise<Set<string>> {
  if (!await hasLoanTables(q)) return new Set();
  const rows = await q.all<{ name: string }>(`SELECT c.name FROM loans l JOIN categories c ON c.id = l.category_id
    WHERE l.created_month <= ?`, [month]);
  return new Set(rows.map((r) => r.name));
}

export async function saveLoanClose(q: Queryable, closeId: string, month: string, rows: LoanClose[]) {
  for (const loan of rows) await q.run('INSERT INTO loan_closes (close_id, loan_id, month, snapshot) VALUES (?, ?, ?, ?)',
    [closeId, loan.id, month, JSON.stringify(loan)]);
}

function validate(input: LoanWriteRequest): string {
  if (input.hasEntitlement !== true) throw new BudgetRuleError('operation', '需要有效的付費權益才能修改貸款／分期。');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 50) throw new BudgetRuleError('argument', '請填寫 1～50 字的貸款名稱。');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 1 || input.reason.trim().length > 300) {
    throw new BudgetRuleError('argument', '請填寫 1～300 字的原因。');
  }
  if (![input.totalAmount, input.monthlyPayment, input.remainingPrincipal].every(Number.isSafeInteger)
    || input.totalAmount <= 0 || input.monthlyPayment <= 0 || input.monthlyPayment > 1_000_000 || input.remainingPrincipal < 0 || input.remainingPrincipal > input.totalAmount) {
    throw new BudgetRuleError('argument', '總額與每月繳款須為正整數；剩餘本金須介於 0 與總額之間。');
  }
  if (!isValidMonth(input.expectedEndMonth)) throw new BudgetRuleError('argument', '預計結清月份請用 YYYY-MM。');
  return name;
}

async function saveLoan(q: Queryable, id: number | null, input: LoanWriteRequest, fallback: string, now: Date) {
  const name = validate(input);
  const { exists, state } = await readStoredDocument(q);
  if (input.version !== state.version) throw new BudgetRuleError('operation', '資料已更新，請重新載入後再試。');
  const month = openMonth(state, fallback);
  const old = id === null ? undefined : (await loanViews(q, month)).find((l) => l.id === id);
  if (id !== null && !old) throw new BudgetRuleError('argument', '找不到這筆貸款。');
  const otherLoan = await q.get('SELECT 1 FROM loan_terms WHERE name = ? COLLATE NOCASE AND loan_id <> ?', [name, id ?? -1]);
  const budgetNames = [...state.categories.map((c) => c.name), ...state.revisions.flatMap((r) => Object.keys(r.mapping))];
  if (otherLoan || budgetNames.some((used) => used.toUpperCase() === name.toUpperCase())) {
    throw new BudgetRuleError('argument', '這個名稱已用於貸款或預算用途，請使用不重複的名稱。');
  }
  const clash = await q.get<{ id: number }>('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [name]);
  if (clash && clash.id !== old?.categoryId) throw new BudgetRuleError('argument', '這個名稱已用於其他分類，請使用不重複的名稱。');
  let categoryId = old?.categoryId ?? null;
  if (categoryId === null) categoryId = await ensureExpenseCategory(q, name, month);
  else await q.run('UPDATE categories SET name = ? WHERE id = ?', [name, categoryId]);
  if (id === null) {
    id = (await q.run('INSERT INTO loans (category_id, created_month, legacy) VALUES (?, ?, 0)', [categoryId, month])).lastInsertRowId;
  } else await q.run('UPDATE loans SET category_id = ? WHERE id = ?', [categoryId, id]);
  await q.run(`INSERT INTO loan_terms (loan_id, month, name, total_amount, monthly_payment, remaining_principal, expected_end_month, reason, time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, month, name, input.totalAmount, input.monthlyPayment, input.remainingPrincipal, input.expectedEndMonth, input.reason.trim(), now.toISOString()]);
  await writeState(q, exists, state.version, { ...state, version: sum(state.version, 1) });
  return { id };
}

export function loanCommands(db: Database, serial: <T>(task: () => Promise<T>) => Promise<T>, fallback: () => Promise<string>, now: () => Date): LoansLedger {
  return {
    listLoans: (month) => serial(async () => {
      const { state } = await readStoredDocument(db);
      return loanViews(db, month ?? openMonth(state, await fallback()));
    }),
    listLoanRevisions: (id) => serial(() => db.all<LoanRevision>(`SELECT id, loan_id AS loanId, month, name,
      total_amount AS totalAmount, monthly_payment AS monthlyPayment, remaining_principal AS remainingPrincipal,
      expected_end_month AS expectedEndMonth, reason, time FROM loan_terms WHERE loan_id = ? ORDER BY id`, [id])),
    createLoan: (input) => serial(async () => {
      const month = await fallback();
      return db.transaction((tx) => saveLoan(tx, null, input, month, now()));
    }),
    updateLoan: (id, input) => serial(async () => {
      const month = await fallback();
      await db.transaction((tx) => saveLoan(tx, id, input, month, now()));
    }),
  };
}
