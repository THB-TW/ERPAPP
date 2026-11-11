import { LedgerError } from '../ledger/index.ts';

/** 新台幣整數顯示，例如 1234567 -> "1,234,567"。 */
export function formatAmount(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 千分比顯示成一位小數的百分比，例如 334 -> "33.4%"、1000 -> "100.0%"。 */
export function formatPermille(permille: number): string {
  return `${Math.floor(permille / 10)}.${permille % 10}%`;
}

/** 帳本服務拒絕的原因可直接顯示；其他錯誤（例如資料庫故障）一律顯示 fallback，不把原始訊息給使用者看。 */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof LedgerError ? error.message : fallback;
}

export function monthTitle(month: string): string {
  const [year, mon] = month.split('-');
  return `${year} 年 ${Number(mon)} 月`;
}

export function dayTitle(date: string): string {
  const [, mon, day] = date.split('-');
  return `${Number(mon)} 月 ${Number(day)} 日`;
}
