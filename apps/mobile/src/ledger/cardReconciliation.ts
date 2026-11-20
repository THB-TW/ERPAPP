// 沿用舊系統同日同額筆數規則；所屬卡為額外隔離邊界，店家不參與核對。
import type { Queryable } from '../db/driver.ts';
import { isValidMonth } from '../calc/dates.ts';
import { LedgerError } from './errors.ts';

export interface CardCount { accountId: number; account: string; transactionCount: number; statementCount: number }
export interface CardMismatch extends CardCount { date: string; amount: number }
export interface CardReconciliation {
  month: string;
  matched: boolean;
  hasCards: boolean;
  cards: CardCount[];
  mismatches: CardMismatch[];
}

export class CardStatementMismatchError extends Error {
  readonly reconciliation: CardReconciliation;
  constructor(result: CardReconciliation) {
    super('信用卡記帳與帳單筆數不符，請修正後再完成月結。');
    this.name = 'CardStatementMismatchError';
    this.reconciliation = result;
  }
}

export async function cardReconciliation(q: Queryable, month: string): Promise<CardReconciliation> {
  if (!isValidMonth(month)) throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
  const accounts = await q.all<{ id: number; name: string }>("SELECT id, name FROM accounts WHERE kind = 'credit_card' ORDER BY sort_order, id");
  const grouped = await q.all<{ accountId: number; date: string; amount: number; transactionCount: number; statementCount: number }>(`
    SELECT accountId, date, amount, SUM(transactionCount) AS transactionCount, SUM(statementCount) AS statementCount FROM (
      SELECT account_id AS accountId, date, amount, COUNT(*) AS transactionCount, 0 AS statementCount
        FROM transactions WHERE flow = 'expense' AND substr(date, 1, 7) = ? GROUP BY account_id, date, amount
      UNION ALL
      SELECT account_id AS accountId, date, amount, 0 AS transactionCount, COUNT(*) AS statementCount
        FROM card_statements WHERE substr(date, 1, 7) = ? GROUP BY account_id, date, amount
    ) GROUP BY accountId, date, amount ORDER BY accountId, date, amount`, [month, month]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const cardRows = grouped.filter((r) => names.has(r.accountId));
  const cards = accounts.map((a): CardCount => ({ accountId: a.id, account: a.name,
    transactionCount: cardRows.filter((r) => r.accountId === a.id).reduce((n, r) => n + r.transactionCount, 0),
    statementCount: cardRows.filter((r) => r.accountId === a.id).reduce((n, r) => n + r.statementCount, 0) }));
  const mismatches = cardRows.filter((r) => r.transactionCount !== r.statementCount)
    .map((r): CardMismatch => ({ ...r, account: names.get(r.accountId)! }));
  return { month, matched: mismatches.length === 0, hasCards: accounts.length > 0, cards, mismatches };
}

export async function assertCardReconciliation(q: Queryable, month: string): Promise<void> {
  const result = await cardReconciliation(q, month);
  if (!result.matched) throw new CardStatementMismatchError(result);
}
