// 明細（票 09）的查詢：某月某收支別的分類彙總與占比、某分類當月的交易。
// 只讀 transactions（收入與支出）。轉帳（票 08）不是交易、沒有分類，不在這張表裡，所以不計入。
import type { Queryable } from '../db/driver.ts';
import { isValidMonth } from '../calc/dates.ts';
import { allocateShares } from '../calc/shares.ts';
import type { Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { selectTransactions, type DayTransaction } from './transactions.ts';

export interface CategoryShare {
  categoryId: number;
  categoryName: string;
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
  const rows = await q.all<Omit<CategoryShare, 'permille'>>(
    `SELECT c.id AS categoryId, c.name AS categoryName, SUM(t.amount) AS amount, COUNT(*) AS count
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.flow = ? AND substr(t.date, 1, 7) = ?
      GROUP BY c.id ORDER BY amount DESC, c.sort_order, c.id`,
    [flow, month],
  );
  const other = await q.get<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE flow <> ? AND substr(date, 1, 7) = ?',
    [flow, month],
  );
  const permilles = allocateShares(rows.map((r) => r.amount), 1000);
  return {
    month,
    flow,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    otherFlowTotal: other?.total ?? 0,
    categories: rows.map((r, i) => ({ ...r, permille: permilles[i] })),
  };
}

/** 某分類在該月的交易，日期新的在前（同一天依輸入順序）。 */
export async function categoryMonthTransactions(q: Queryable, month: string, categoryId: number): Promise<DayTransaction[]> {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
  return selectTransactions(q, 'substr(t.date, 1, 7) = ? AND t.category_id = ?', [month, categoryId], 't.date DESC, t.id');
}
