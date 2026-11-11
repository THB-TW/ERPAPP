import type { AccountKind } from '../ledger/index.ts';

/** 新台幣整數顯示，例如 1234567 -> "1,234,567"。 */
export function formatAmount(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const accountKindLabels: Record<AccountKind, string> = {
  cash: '現金',
  bank: '銀行',
  credit_card: '信用卡',
  e_wallet: '電子支付',
};

export function monthTitle(month: string): string {
  const [year, mon] = month.split('-');
  return `${year} 年 ${Number(mon)} 月`;
}

export function dayTitle(date: string): string {
  const [, mon, day] = date.split('-');
  return `${Number(mon)} 月 ${Number(day)} 日`;
}
