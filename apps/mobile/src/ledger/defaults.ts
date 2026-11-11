// 預設分類與帳戶：程式內建的一張表，只有名稱與種類，不含任何個人資料。
// 這是「版本 1」遷移寫入的內容；遷移一旦發佈就不可改，之後要調整預設值請新增遷移。

export type AccountKind = 'cash' | 'bank' | 'credit_card' | 'e_wallet';
export type Flow = 'expense' | 'income';

export const DEFAULT_ACCOUNTS: readonly { name: string; kind: AccountKind }[] = [
  { name: '現金', kind: 'cash' },
  { name: '銀行', kind: 'bank' },
  { name: '信用卡', kind: 'credit_card' },
  { name: '電子支付', kind: 'e_wallet' },
];

export const DEFAULT_CATEGORIES: readonly { name: string; flow: Flow }[] = [
  { name: '飲食', flow: 'expense' },
  { name: '交通', flow: 'expense' },
  { name: '娛樂', flow: 'expense' },
  { name: '日常用品', flow: 'expense' },
  { name: '醫療保健', flow: 'expense' },
  { name: '服飾', flow: 'expense' },
  { name: '學習', flow: 'expense' },
  { name: '電話網路', flow: 'expense' },
  { name: '水電瓦斯', flow: 'expense' },
  { name: '其他', flow: 'expense' },
  { name: '薪資', flow: 'income' },
  { name: '其他收入', flow: 'income' },
];
