// 月結精靈只組織流程；所有月結數字仍由既有預算引擎計算。
import type { Queryable } from '../db/driver.ts';
import { isValidMonth, taipeiDate } from '../calc/dates.ts';
import { applyBudgetCommand, BUDGET_ACTOR, BudgetRuleError } from '../calc/budgetEngine.ts';
import type { BudgetState, MonthClose } from '../calc/budgetTypes.ts';
import { readStoredDocument } from './financeDocument.ts';
import { assertMonthlyCloseAccess, budgetFallbackMonth, executeBudgetCommand, monthExpenses } from './budgetCommands.ts';
import { budgetMonth, budgetStatus, type BudgetMonthView } from './budgetViews.ts';
import { LedgerError } from './errors.ts';

export interface MonthlyCloseRow {
  categoryId: string;
  name: string;
  kind: string;
  cap: number | null;
  spent: number;
  /** 上限減實支；只有儲備類會把此值累積至儲備。 */
  change: number | null;
  balance: number | null;
}
export interface MonthlyClosePreview {
  month: string;
  version: number;
  income: number;
  previewToken: string;
  summary: BudgetMonthView;
  rows: MonthlyCloseRow[];
}
export interface MonthlyCloseRequest { month: string; hasEntitlement: boolean }
export interface CompleteMonthlyCloseRequest extends MonthlyCloseRequest {
  version: number;
  operationId: string;
  previewToken: string;
}
export interface MonthlyCloseSnapshot {
  summary: BudgetMonthView;
  /** 原始月結計算，後來的挪用、更正與補入儲備不改寫它。 */
  calculation: Pick<MonthClose, 'income' | 'surplus' | 'rawSpare' | 'tuition' | 'balances' | 'changes' | 'expenses'> & {
    capSnapshot: MonthClose['revision'];
  };
  time: string;
  actor: string;
}

function validateMonth(month: string): void {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
}

function calculationRows(state: BudgetState, raw: MonthClose, summary: BudgetMonthView): MonthlyCloseRow[] {
  return (raw.revision?.limits ?? []).map((limit) => {
    const definition = state.categories.find((c) => c.id === limit.categoryId)!;
    const spent = raw.expenses[limit.categoryId] ?? 0;
    const cap = definition.kind === 'actual' ? null : limit.amount;
    return { categoryId: limit.categoryId, name: definition.name, kind: definition.kind, cap, spent,
      change: cap === null ? null : cap - spent,
      balance: definition.kind === 'reserve' ? summary.reserves.find((r) => r.categoryId === limit.categoryId)?.balance ?? 0 : null };
  });
}

// 包含使用者看過的原始計算與調整後結果；同版本文件被取代也不能沿用舊預覽。
function previewToken(version: number, raw: MonthClose, summary: BudgetMonthView, rows: MonthlyCloseRow[]): string {
  return JSON.stringify([version, raw.month, raw.income, raw.surplus, raw.rawSpare, raw.tuition,
    raw.balances, raw.changes, raw.expenses,
    raw.revision && [raw.revision.limits, raw.revision.mapping, raw.revision.tuition],
    summary.spare, summary.tuition, summary.reserve, summary.total, rows]);
}

export interface MonthlyCloseDraft {
  month: string;
  version: number;
  income: number;
  latestMonth: string | null;
  canClose: boolean;
}

async function monthIncome(q: Queryable, month: string): Promise<number> {
  const row = await q.get<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE flow = 'income' AND substr(date, 1, 7) = ?", [month],
  );
  return row?.total ?? 0;
}

export async function monthlyCloseDraft(q: Queryable, now: Date): Promise<MonthlyCloseDraft> {
  const { state } = await readStoredDocument(q);
  const status = budgetStatus(state, await budgetFallbackMonth(q, now));
  return { month: status.openMonth, version: status.version, latestMonth: status.latestMonth,
    income: await monthIncome(q, status.openMonth), canClose: status.openMonth < taipeiDate(now).slice(0, 7) };
}

export async function previewMonthlyClose(q: Queryable, input: MonthlyCloseRequest, now: Date): Promise<MonthlyClosePreview> {
  assertMonthlyCloseAccess(input.hasEntitlement);
  validateMonth(input.month);
  if (input.month >= taipeiDate(now).slice(0, 7)) {
    throw new BudgetRuleError('operation', '這個月還沒結束，要等下個月才能月結。');
  }
  const { state } = await readStoredDocument(q);
  const fallback = await budgetFallbackMonth(q, now);
  const income = await monthIncome(q, input.month);
  let sequence = 1;
  let operationId = '11111111-1111-4111-8111-111111111111';
  while (state.receipts.some((r) => r.id === operationId)) {
    operationId = `11111111-1111-4111-8111-${String(sequence++).padStart(12, '0')}`;
  }
  const after = applyBudgetCommand(state, { action: 'close', operationId,
    month: input.month, version: state.version, amount: income, reason: '月結' },
  { actor: BUDGET_ACTOR, time: now.toISOString(), openingMonth: fallback, expenses: await monthExpenses(q, input.month) });
  const raw = after.months.find((m) => m.month === input.month)!;
  const summary = budgetMonth(after, input.month, fallback)!;
  const rows = calculationRows(after, raw, summary);
  return { month: input.month, version: state.version, income, previewToken: previewToken(state.version, raw, summary, rows),
    summary, rows };
}

export async function completeMonthlyClose(q: Queryable, input: CompleteMonthlyCloseRequest, now: Date) {
  assertMonthlyCloseAccess(input.hasEntitlement);
  validateMonth(input.month);
  const { state } = await readStoredDocument(q);
  const operationId = typeof input.operationId === 'string' ? input.operationId.toLowerCase() : '';
  const receiptKey = `monthly_close_receipt:${operationId}`;
  let income: number;
  if (state.receipts.some((r) => r.id === operationId)) {
    // 成功後即使已撤銷或已有下個月份，重送仍只讀當次原始快照，不套用新交易。
    const original = state.closeHistory.find((m) => m.id === operationId);
    const receipt = await q.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [receiptKey]);
    if (!original || original.month !== input.month || receipt?.value !== input.previewToken) {
      throw new BudgetRuleError('operation', '操作識別碼已用於其他內容，請重新載入。');
    }
    income = original.income;
  } else {
    const preview = await previewMonthlyClose(q, input, now);
    if (preview.version !== input.version || preview.previewToken !== input.previewToken) {
      throw new BudgetRuleError('operation', '交易或預算已變更，請重新預覽後再完成月結。');
    }
    income = preview.income;
  }
  const { result } = await executeBudgetCommand(q, { action: 'close', operationId: input.operationId,
    version: input.version, month: input.month, amount: income, reason: '月結' }, now, false, input);
  if (!result.replayed) {
    // 與財務文件同一筆 SQLite 交易保存確認內容；不改財務文件格式或引擎收據規則。
    await q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [receiptKey, input.previewToken]);
  }
  return result;
}

export async function monthlyCloseSnapshot(q: Queryable, month: string, now: Date): Promise<MonthlyCloseSnapshot> {
  validateMonth(month);
  const { state } = await readStoredDocument(q);
  const summary = budgetMonth(state, month, await budgetFallbackMonth(q, now));
  if (!summary) throw new LedgerError('month_not_closed', `${month} 尚未月結。`);
  const raw = state.months.find((m) => m.month === month)!;
  return { summary, calculation: { income: raw.income, surplus: raw.surplus, rawSpare: raw.rawSpare,
    tuition: raw.tuition, balances: raw.balances, changes: raw.changes, expenses: raw.expenses, capSnapshot: raw.revision },
    time: raw.time, actor: raw.actor };
}
