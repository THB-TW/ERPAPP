// 明細（票 09）的查詢：某月某收支別的分類彙總與占比、某分類當月的交易。
// 只讀 transactions（收入與支出）。轉帳（票 08）不是交易、沒有分類，不在這張表裡，所以不計入。
import { effectiveRevision, mappedBudgetCategory } from '../calc/budgetEngine.ts';
import { readState } from './financeDocument.ts';
import type { Queryable } from '../db/driver.ts';
import { isValidMonth } from '../calc/dates.ts';
import { allocateShares } from '../calc/shares.ts';
import type { Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { selectTransactions, type DayTransaction } from './transactions.ts';

export interface CategoryShare {
  categoryId: number;
  categoryName: string;
  /** 分類圖示（沒設定為 null）。 */
  categoryIcon: string | null;
  /** 所選月份的有效支出歸屬；收入與未歸屬為 null。 */
  budgetCategory: { id: string; name: string } | null;
  amount: number;
  count: number;
  /** 占該月該收支別合計的千分比（最大餘數法）；全部分類加起來一定是 1000。畫面顯示成一位小數的百分比。 */
  permille: number;
}

export interface MonthBreakdown {
  month: string;
  flow: Flow;
  /** 該月該收支別的合計。 */
  total: number;
  /** 該月另一個收支別的合計（看支出時是收入合計，反之亦然）。 */
  otherFlowTotal: number;
  /** 只含當月有帳的分類，依金額由大到小；金額相同依分類的排列順序。 */
  categories: CategoryShare[];
}

const MONTH_MESSAGE = '月份格式不正確，請用 YYYY-MM。';

export async function monthBreakdown(q: Queryable, month: string, flow: Flow): Promise<MonthBreakdown> {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
  if (flow !== 'expense' && flow !== 'income') {
    throw new LedgerError('invalid_flow', '收支別只能是「支出」或「收入」。');
  }
  const rows = await q.all<Omit<CategoryShare, 'permille' | 'budgetCategory'>>(
    `SELECT c.id AS categoryId, c.name AS categoryName, c.icon AS categoryIcon, SUM(t.amount) AS amount, COUNT(*) AS count
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.flow = ? AND substr(t.date, 1, 7) = ?
      GROUP BY c.id ORDER BY amount DESC, c.sort_order, c.id`,
    [flow, month],
  );
  const other = await q.get<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE flow <> ? AND substr(date, 1, 7) = ?',
    [flow, month],
  );
  const state = flow === 'expense' && rows.length > 0 ? await readState(q) : null;
  const closed = state?.months.find(m => m.month === month);
  const revision = closed ? closed.revision : state && effectiveRevision(state, month);
  const budgetCategory = (name: string) => {
    if (!state || !revision) return null;
    const id = mappedBudgetCategory(revision, name);
    const definition = state.categories.find(c => c.id === id);
    return definition ? { id: definition.id, name: definition.name } : null;
  };
  const permilles = allocateShares(rows.map((r) => r.amount), 1000);
  return {
    month,
    flow,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    otherFlowTotal: other?.total ?? 0,
    categories: rows.map((r, i) => ({ ...r, permille: permilles[i], budgetCategory: budgetCategory(r.categoryName) })),
  };
}

/** 某分類在該月的交易，日期新的在前（同一天依輸入順序）。 */
export async function categoryMonthTransactions(q: Queryable, month: string, categoryId: number): Promise<DayTransaction[]> {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
  return selectTransactions(q, 'substr(t.date, 1, 7) = ? AND t.category_id = ?', [month, categoryId], 't.date DESC, t.id');
}

/** 明細的另一個看法：依成員或依帳戶彙總（2026-11-25）。分類視角仍用 monthBreakdown。 */
export type ReportGrouping = 'member' | 'account';

export interface GroupShare {
  id: number;
  name: string;
  icon: string | null;
  /** 已停用的成員或帳戶照樣列出，畫面可標註。 */
  active: boolean;
  amount: number;
  count: number;
  /** 同 CategoryShare.permille：全部加起來一定是 1000。 */
  permille: number;
}

export interface MonthGroupBreakdown {
  month: string;
  flow: Flow;
  by: ReportGrouping;
  total: number;
  otherFlowTotal: number;
  /** 只含當月有帳的成員或帳戶，依金額由大到小；金額相同依排列順序。 */
  groups: GroupShare[];
}

const GROUP_TABLE: Record<ReportGrouping, { table: string; column: string }> = {
  member: { table: 'members', column: 'member_id' },
  account: { table: 'accounts', column: 'account_id' },
};

function checkGrouping(month: string, flow: Flow, by: ReportGrouping) {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
  if (flow !== 'expense' && flow !== 'income') throw new LedgerError('invalid_flow', '收支別只能是「支出」或「收入」。');
  if (!(by in GROUP_TABLE)) throw new LedgerError('invalid_grouping', '明細只能依分類、成員或帳戶查看。');
  return GROUP_TABLE[by];
}

/** 轉帳不是交易，不計入；與分類視角的合計相同。 */
export async function monthGroupBreakdown(q: Queryable, month: string, flow: Flow, by: ReportGrouping): Promise<MonthGroupBreakdown> {
  const { table, column } = checkGrouping(month, flow, by);
  const rows = await q.all<{ id: number; name: string; icon: string | null; active: number; amount: number; count: number }>(
    `SELECT g.id, g.name, g.icon, g.active, SUM(t.amount) AS amount, COUNT(*) AS count
       FROM transactions t JOIN ${table} g ON g.id = t.${column}
      WHERE t.flow = ? AND substr(t.date, 1, 7) = ?
      GROUP BY g.id ORDER BY amount DESC, g.sort_order, g.id`,
    [flow, month],
  );
  const other = await q.get<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE flow <> ? AND substr(date, 1, 7) = ?',
    [flow, month],
  );
  const permilles = allocateShares(rows.map((r) => r.amount), 1000);
  return {
    month, flow, by,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    otherFlowTotal: other?.total ?? 0,
    groups: rows.map((r, i) => ({ id: r.id, name: r.name, icon: r.icon, active: r.active === 1, amount: r.amount, count: r.count, permille: permilles[i] })),
  };
}

/** 某成員或帳戶在該月該收支別的交易，日期新的在前。 */
export async function groupMonthTransactions(q: Queryable, month: string, flow: Flow, by: ReportGrouping, id: number): Promise<DayTransaction[]> {
  const { column } = checkGrouping(month, flow, by);
  return selectTransactions(q, `substr(t.date, 1, 7) = ? AND t.flow = ? AND t.${column} = ?`, [month, flow, id], 't.date DESC, t.id');
}
