// 交易指令（票 07）：新增、讀取單筆、修改、刪除。由帳本服務（index.ts）在資料庫交易內呼叫。
// 已結月份鎖定一律走 monthLock.assertDateOpen：修改要同時檢查原日期與新日期，刪除檢查原日期。
import type { Queryable, SqlValue } from '../db/driver.ts';
import type { Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { assertDateOpen } from './monthLock.ts';
import { assertCategoryFlow, assertTransactionShape } from './transactionRules.ts';
import { assertAccountUsable } from './accounts.ts';

export interface NewTransaction {
  date: string;
  categoryId: number;
  accountId: number;
  flow: Flow;
  amount: number;
  note?: string;
  /** 選填；未指定或 null 表示沒有成員。 */
  memberId?: number | null;
}

export interface DayTransaction {
  id: number;
  date: string;
  flow: Flow;
  amount: number;
  note: string;
  categoryId: number;
  categoryName: string;
  accountId: number;
  accountName: string;
  /** 沒有指定成員為 null。 */
  memberName: string | null;
}

/** 單筆交易（修改表單用）：列表欄位之外多帶成員編號，表單才能選回原本的成員。 */
export interface TransactionDetail extends DayTransaction {
  /** 沒有指定成員為 null。 */
  memberId: number | null;
}

const NOT_FOUND_MESSAGE = '找不到這筆交易，可能已被刪除。';

/** 欄位、分類、帳戶、成員的檢查（不含月份鎖定）。新增與修改共用。 */
async function assertValidInput(tx: Queryable, input: NewTransaction, originalAccountId?: number): Promise<void> {
  assertTransactionShape(input);
  const category = await tx.get<{ flow: Flow }>('SELECT flow FROM categories WHERE id = ?', [input.categoryId]);
  assertCategoryFlow(category, input.flow);
  await assertAccountUsable(tx, input.accountId, originalAccountId);
  if (input.memberId != null && !(await tx.get('SELECT id FROM members WHERE id = ?', [input.memberId]))) {
    throw new LedgerError('unknown_member', '找不到這位成員。');
  }
}

async function existingDate(tx: Queryable, id: number): Promise<string> {
  const row = await tx.get<{ date: string }>('SELECT date FROM transactions WHERE id = ?', [id]);
  if (!row) throw new LedgerError('unknown_transaction', NOT_FOUND_MESSAGE);
  return row.date;
}

export async function insertTransaction(tx: Queryable, input: NewTransaction): Promise<{ id: number }> {
  assertTransactionShape(input);
  await assertDateOpen(tx, input.date); // 已結月份鎖定
  await assertValidInput(tx, input);
  const result = await tx.run(
    'INSERT INTO transactions (date, category_id, account_id, flow, amount, note, member_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [input.date, input.categoryId, input.accountId, input.flow, input.amount, input.note ?? '', input.memberId ?? null],
  );
  return { id: result.lastInsertRowId };
}

export async function updateTransaction(tx: Queryable, id: number, input: NewTransaction): Promise<void> {
  const original = await existingDate(tx, id);
  await assertDateOpen(tx, original); // 原本在已結月份：不能改
  assertTransactionShape(input);
  await assertDateOpen(tx, input.date); // 改進已結月份：也不行
  const originalAccount = await tx.get<{ account_id: number }>('SELECT account_id FROM transactions WHERE id = ?', [id]);
  await assertValidInput(tx, input, originalAccount!.account_id);
  await tx.run(
    `UPDATE transactions SET date = ?, category_id = ?, account_id = ?, flow = ?, amount = ?, note = ?, member_id = ?
      WHERE id = ?`,
    [input.date, input.categoryId, input.accountId, input.flow, input.amount, input.note ?? '', input.memberId ?? null, id],
  );
}

export async function deleteTransaction(tx: Queryable, id: number): Promise<void> {
  await assertDateOpen(tx, await existingDate(tx, id));
  await tx.run('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function getTransaction(q: Queryable, id: number): Promise<TransactionDetail> {
  const row = await q.get<TransactionDetail>(
    `SELECT ${LIST_COLUMNS}, t.member_id AS memberId ${LIST_JOINS} WHERE t.id = ?`,
    [id],
  );
  if (!row) throw new LedgerError('unknown_transaction', NOT_FOUND_MESSAGE);
  return row;
}

/** 日期區間內（含兩端）的交易，依日期、編號排序。 */
export function transactionsBetween(q: Queryable, from: string, to: string): Promise<DayTransaction[]> {
  return selectTransactions(q, 't.date >= ? AND t.date <= ?', [from, to]);
}

const LIST_COLUMNS = `t.id, t.date, t.flow, t.amount, t.note,
            t.category_id AS categoryId, c.name AS categoryName,
            t.account_id AS accountId, a.name AS accountName,
            m.name AS memberName`;
const LIST_JOINS = `FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN members m ON m.id = t.member_id`;

/** 交易列的共用查詢（含分類、帳戶、成員名稱）。where 與 orderBy 是程式內寫死的 SQL 片段，值一律走 params。 */
export function selectTransactions(
  q: Queryable,
  where: string,
  params: SqlValue[],
  orderBy = 't.date, t.id',
): Promise<DayTransaction[]> {
  return q.all<DayTransaction>(`SELECT ${LIST_COLUMNS} ${LIST_JOINS} WHERE ${where} ORDER BY ${orderBy}`, params);
}
