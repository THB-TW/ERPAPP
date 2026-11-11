// 已結月份鎖定：已結月份的交易不能新增、修改、刪除，匯入也拒收（規格「已結月份鎖定」）。
// 檢查只做在這一處；交易的新增、修改、刪除（transactions.ts）都呼叫它，之後的匯入指令也呼叫同一個函式。
// 「已結月份」＝財務文件 Months 裡有的月份（含期初基準月）；撤銷月結後該月又開放。
import type { Queryable } from '../db/driver.ts';
import { LedgerError } from './errors.ts';
import { monthOf } from '../calc/dates.ts';

/** 該月是否已結。直接用 SQLite 的 JSON 函式查文件，不必把整份文件讀進 JS。 */
export async function isMonthClosed(q: Queryable, month: string): Promise<boolean> {
  const row = await q.get(
    `SELECT 1 AS hit FROM finance_document, json_each(finance_document.document, '$.Months') AS m
      WHERE json_extract(m.value, '$.Month') = ? LIMIT 1`,
    [month],
  );
  return row !== null;
}

/** 日期落在已結月份就丟 LedgerError('month_closed')。date 必須已驗證過是 YYYY-MM-DD。 */
export async function assertDateOpen(q: Queryable, date: string): Promise<void> {
  const month = monthOf(date);
  if (await isMonthClosed(q, month)) {
    throw new LedgerError(
      'month_closed',
      `${date} 屬於已結月份 ${month}，須先撤銷月結才能新增、修改或刪除交易（或改用前期更正）。`,
    );
  }
}
