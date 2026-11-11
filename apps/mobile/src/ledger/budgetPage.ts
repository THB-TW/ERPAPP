// 預算頁的查詢；財務數字由 budgetViews 與既有預算引擎產生。
import type { Queryable } from '../db/driver.ts';
import { isValidMonth, taipeiDate } from '../calc/dates.ts';
import { readStoredDocument } from './financeDocument.ts';
import { budgetFallbackMonth } from './budgetCommands.ts';
import { budgetProgress } from './budgetViews.ts';
import { LedgerError } from './errors.ts';

export async function getBudgetProgress(q: Queryable, now: Date, month = taipeiDate(now).slice(0, 7)) {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
  const rows = await q.all<{ categoryId: number; name: string; spent: number }>(
    `SELECT c.id AS categoryId, c.name, SUM(t.amount) AS spent FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.flow = 'expense' AND substr(t.date, 1, 7) = ? GROUP BY c.id ORDER BY c.sort_order`, [month]);
  return budgetProgress((await readStoredDocument(q)).state, month, await budgetFallbackMonth(q, now), rows);
}
