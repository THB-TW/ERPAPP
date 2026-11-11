// 交易的欄位規則：addTransaction 與舊帳整批帶入共用，錯誤碼與訊息一致。
// （已結月份鎖定只在 addTransaction 檢查，舊帳整批帶入的月份是以搬遷月份身分帶入，不受鎖定。）
import { isValidDate } from '../calc/dates.ts';
import type { Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';

export const INVALID_DATE_MESSAGE = '日期格式不正確，請用 YYYY-MM-DD 的有效日期。';

export function assertTransactionShape(input: { date: string; flow: string; amount: number }): void {
  if (!isValidDate(input.date)) throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
  if (input.flow !== 'expense' && input.flow !== 'income') {
    throw new LedgerError('invalid_flow', '收支別只能是「支出」或「收入」。');
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new LedgerError('invalid_amount', '金額必須是大於 0 的整數（新台幣元）。');
  }
}

/** category 為該分類的資料（找不到為 null／undefined）。 */
export function assertCategoryFlow(category: { flow: Flow } | null | undefined, flow: Flow): void {
  if (!category) throw new LedgerError('unknown_category', '找不到這個分類，請先到分類設定新增。');
  if (category.flow !== flow) {
    throw new LedgerError(
      'flow_mismatch',
      category.flow === 'income' ? '這是收入分類，不能記成支出。' : '這是支出分類，不能記成收入。',
    );
  }
}

export function assertAccountKnown(account: unknown): void {
  if (!account) throw new LedgerError('unknown_account', '找不到這個帳戶。');
}
