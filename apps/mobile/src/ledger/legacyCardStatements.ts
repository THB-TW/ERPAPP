import type { Queryable } from '../db/driver.ts';
import { isValidDate } from '../calc/dates.ts';
import { LedgerError } from './errors.ts';

export interface LegacyCardStatement {
  date: string;
  merchant: string;
  amount: number;
  account: string;
}

/** 舊帳是原樣搬遷，不套用數量式去重或已結月份鎖定；任何壞列都拒絕整批。 */
export async function importLegacyCardStatements(tx: Queryable, rows: readonly LegacyCardStatement[]): Promise<void> {
  let total = 0;
  for (const [i, row] of rows.entries()) {
    const invalid = (message: string): never => {
      throw new LedgerError('invalid_legacy_import', `舊帳第 ${i + 1} 筆信用卡明細無法帶入：${message}`);
    };
    if (!isValidDate(row.date)) invalid('日期不正確。');
    if (typeof row.merchant !== 'string' || row.merchant.trim() === '') invalid('店家不可為空。');
    if (!Number.isSafeInteger(row.amount) || row.amount < 0) invalid('金額必須是非負的新台幣整數。');
    total += row.amount;
    if (!Number.isSafeInteger(total)) invalid('信用卡明細金額合計超過安全整數範圍，不能無誤保存。');
    const account = await tx.get<{ id: number; kind: string }>('SELECT id, kind FROM accounts WHERE name = ?', [row.account]);
    if (!account || account.kind !== 'credit_card') invalid('所屬帳戶不存在或不是信用卡。');
    await tx.run('INSERT INTO card_statements (date, merchant, amount, account_id) VALUES (?, ?, ?, ?)',
      [row.date, row.merchant, row.amount, account!.id]);
  }
}
