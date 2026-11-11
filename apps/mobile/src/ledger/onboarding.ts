// 開帳指令與建議查詢。index.ts 負責共用佇列與 SQLite 交易；不另建月結算法。
import type { Queryable } from '../db/driver.ts';
import { isValidDate, shiftMonth, taipeiDate } from '../calc/dates.ts';
import { BUDGET_ACTOR, BudgetRuleError } from '../calc/budgetEngine.ts';
import { readStoredDocument, writeState } from './financeDocument.ts';
import { executeBudgetCommand } from './budgetCommands.ts';
import { DEFAULT_OPENING_BUDGETS, type Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';

export type OpeningBudgetKind = 'reserve' | 'fixed' | 'actual';
export interface OpeningBudgetRow {
  categoryId: number;
  name: string;
  kind: OpeningBudgetKind;
  amount: number;
  averageExpense: number | null;
  incomeRatio: number | null;
}
export interface OpeningBudgetSuggestions {
  source: 'history' | 'income';
  /** 最近三個已完整結束的日曆月份，歷史不足時從第一個有交易的月份開始。空月仍算零。 */
  months: string[];
  rows: OpeningBudgetRow[];
}
export interface OnboardingStatus {
  completed: boolean;
  openingDate: string | null;
  currentMonth: string;
  previousMonth: string;
  openingDeployed: number;
}
export interface CompleteOnboardingInput {
  openingDate: string;
  openingDeployed: number;
  accounts: { id: number; openingBalance: number }[];
  budgets: { categoryId: number; kind: OpeningBudgetKind; amount: number }[];
}
export interface OnboardingLedger {
  getOnboardingStatus(): Promise<OnboardingStatus>;
  getOpeningBudgetSuggestions(options?: { monthlyIncome?: number }): Promise<OpeningBudgetSuggestions>;
  /** 開帳前由使用者明確建立分類，允許歷史 CSV 使用；匯入本身仍不自動建立分類。 */
  addOpeningCategory(input: { name: string; flow: Flow }): Promise<{ id: number }>;
  /** 同一交易保存日期、各帳戶餘額、期初投入額、基準及逐項確認後的預算。 */
  completeOnboarding(input: CompleteOnboardingInput): Promise<void>;
}

function safe(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new LedgerError('invalid_amount', '金額超出可安全計算的整數範圍。');
  return result;
}
function integer(value: number, message: string, nonnegative = false) {
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0)) throw new LedgerError('invalid_amount', message);
}

export async function onboardingStatus(q: Queryable, now: Date): Promise<OnboardingStatus> {
  const openingDate = (await q.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_date'"))?.value ?? null;
  const currentMonth = taipeiDate(now).slice(0, 7);
  const openingDeployed = Number((await q.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_deployed'"))?.value ?? 0);
  // 舊帳／還原的帳本沒有新的完成標記，也必須跳過開帳，不能覆寫既有基準。
  return { completed: openingDate !== null || (await readStoredDocument(q)).state.months.length > 0,
    openingDate, currentMonth, previousMonth: shiftMonth(currentMonth, -1), openingDeployed };
}
async function assertUnopened(q: Queryable, now: Date) {
  if ((await onboardingStatus(q, now)).completed) throw new LedgerError('ledger_not_empty', '帳本已完成開帳，不能重新開帳。');
}

export async function openingBudgetSuggestions(q: Queryable, now: Date, options: { monthlyIncome?: number } = {}): Promise<OpeningBudgetSuggestions> {
  const monthlyIncome = options.monthlyIncome ?? 0;
  integer(monthlyIncome, '月收入必須是大於或等於 0 的整數。', true);
  const current = taipeiDate(now).slice(0, 7);
  const earliest = (await q.get<{ date: string | null }>('SELECT MIN(date) AS date FROM transactions WHERE date < ?', [`${current}-01`]))?.date?.slice(0, 7);
  const months: string[] = [];
  if (earliest) {
    for (let month = earliest > shiftMonth(current, -3) ? earliest : shiftMonth(current, -3); month < current; month = shiftMonth(month, 1)) months.push(month);
  }
  const totals = new Map<number, bigint>();
  if (months.length) {
    const expenses = await q.all<{ categoryId: number; amount: number }>(
      "SELECT category_id AS categoryId, amount FROM transactions WHERE flow = 'expense' AND date >= ? AND date < ?",
      [`${months[0]}-01`, `${current}-01`]);
    for (const expense of expenses) totals.set(expense.categoryId, (totals.get(expense.categoryId) ?? 0n) + BigInt(expense.amount));
  }
  const categories = await q.all<{ id: number; name: string }>("SELECT id, name FROM categories WHERE flow = 'expense' ORDER BY sort_order, id");
  return { source: months.length ? 'history' : 'income', months, rows: categories.map((c) => {
    const preset = DEFAULT_OPENING_BUDGETS.find((row) => row.name === c.name);
    const kind = preset?.kind ?? 'actual';
    const total = totals.get(c.id) ?? 0n;
    const divisor = BigInt(months.length || 1);
    // 平均後進位百元，以整數計算避免浮點誤差；沒有資料時按比例四捨五入到元。
    const suggested = months.length ? safe(((total + divisor * 100n - 1n) / (divisor * 100n)) * 100n)
      : safe((BigInt(monthlyIncome) * BigInt(preset?.incomePercent ?? 0) + 50n) / 100n);
    return { categoryId: c.id, name: c.name, kind, amount: kind === 'actual' ? 0 : suggested,
      averageExpense: months.length ? safe(total) / months.length : null,
      incomeRatio: preset ? preset.incomePercent / 100 : null };
  }) };
}

export async function addOpeningCategory(q: Queryable, now: Date, input: { name: string; flow: Flow }): Promise<{ id: number }> {
  await assertUnopened(q, now);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 30) throw new LedgerError('category_name_conflict', '分類名稱請填 1～30 字。');
  if (input.flow !== 'expense' && input.flow !== 'income') throw new LedgerError('invalid_flow', '收支別只能是支出或收入。');
  if (await q.get('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE', [name])) throw new LedgerError('category_name_conflict', '已有相同的分類名稱，請使用現有分類或改名。');
  const last = await q.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM categories');
  const added = await q.run('INSERT INTO categories (name, flow, sort_order) VALUES (?, ?, ?)', [name, input.flow, (last?.top ?? -1) + 1]);
  // 不設 category_start：CSV 可以包含開帳前歷史。預算歸屬在使用者確認建議時才建立。
  return { id: added.lastInsertRowId };
}

export async function completeOnboarding(q: Queryable, now: Date, input: CompleteOnboardingInput): Promise<void> {
  await assertUnopened(q, now);
  const current = taipeiDate(now).slice(0, 7);
  if (!isValidDate(input.openingDate) || ![`${current}-01`, `${shiftMonth(current, -1)}-01`].includes(input.openingDate)) {
    throw new LedgerError('invalid_date', '開帳日必須是本月或上個月的 1 號。');
  }
  integer(input.openingDeployed, '期初投入額必須是大於或等於 0 的整數。', true);
  const accounts = await q.all<{ id: number }>('SELECT id FROM accounts');
  if (input.accounts.length !== accounts.length || new Set(input.accounts.map((a) => a.id)).size !== accounts.length
    || input.accounts.some((a) => !accounts.some((known) => known.id === a.id))) {
    throw new LedgerError('unknown_account', '請重新讀取並確認每個帳戶的開帳餘額。');
  }
  const categories = await q.all<{ id: number; name: string }>("SELECT id, name FROM categories WHERE flow = 'expense' ORDER BY sort_order, id");
  if (input.budgets.length !== categories.length || new Set(input.budgets.map((b) => b.categoryId)).size !== categories.length
    || input.budgets.some((b) => !categories.some((c) => c.id === b.categoryId))) {
    throw new LedgerError('unknown_category', '請重新讀取並逐項確認所有支出分類的預算。');
  }
  let spare = BigInt(input.openingDeployed);
  for (const account of input.accounts) {
    integer(account.openingBalance, '各帳戶開帳餘額必須是整數；信用卡未繳金額請填負數。');
    spare += BigInt(account.openingBalance);
  }
  const baselineSpare = safe(spare);
  const { exists, state } = await readStoredDocument(q);
  const month = input.openingDate.slice(0, 7);
  // 不改寫晚於所選開帳月的既有草稿，避免之後沿用未經本次確認的上限。
  if (state.revisions.some((revision) => revision.month > month)) {
    throw new BudgetRuleError('operation', '已有較晚月份的預算草稿，請選本月開帳，以保留現有設定。');
  }
  // 同月既有未結草稿不丟棄；採納預算仍走票 10 的 add/edit 與完整上限版本驗證。
  state.months.push({ id: 'opening-baseline', month: shiftMonth(month, -1), income: 0, surplus: 0,
    rawSpare: baselineSpare, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
    migrated: false, legacyTotalDifference: 0, legacyBalanceAnchor: 0, actor: BUDGET_ACTOR, time: now.toISOString() });
  const previousVersion = state.version;
  state.version++;
  await writeState(q, exists, previousVersion, state);
  for (const account of input.accounts) await q.run('UPDATE accounts SET opening_balance = ? WHERE id = ?', [account.openingBalance, account.id]);
  await q.run("INSERT INTO settings (key, value) VALUES ('opening_date', ?)", [input.openingDate]);
  await q.run("INSERT INTO settings (key, value) VALUES ('opening_deployed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(input.openingDeployed)]);
  for (const category of categories) {
    const budget = input.budgets.find((b) => b.categoryId === category.id)!;
    // 每一項仍由既有引擎驗證組別與 0～1,000,000 上限；任何失敗都由外層交易回滾。
    if (budget.kind === 'actual' && budget.amount !== 0) throw new BudgetRuleError('argument', '照實支類別不設定上限。');
    const before = (await readStoredDocument(q)).state;
    const active = before.revisions.filter((r) => r.month <= month).at(-1)?.limits ?? [];
    const existing = before.categories.find((c) => c.name === category.name && active.some((l) => l.categoryId === c.id));
    const operationId = `00000018-0000-4000-8000-${String(category.id).padStart(12, '0')}`;
    await executeBudgetCommand(q, { action: existing ? 'edit' : 'add', operationId, version: before.version,
      month, reason: '開帳：逐項確認預算', name: category.name, kind: budget.kind, amount: budget.amount, ...(existing ? { from: existing.id } : {}) }, now);
  }
}
