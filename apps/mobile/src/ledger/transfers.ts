import type { Database, Queryable } from '../db/driver.ts';
import { isValidDate } from '../calc/dates.ts';
import { LedgerError } from './errors.ts';
import { assertDateOpen } from './monthLock.ts';
import { INVALID_DATE_MESSAGE } from './transactionRules.ts';
import { assertAccountUsable } from './accounts.ts';

export interface NewTransfer { date: string; fromAccountId: number; toAccountId: number; amount: number; note?: string }
export interface TransferDetail extends NewTransfer { id: number; fromAccountName: string; toAccountName: string; note: string }
export interface TransfersLedger {
  addTransfer(input: NewTransfer): Promise<{ id: number }>;
  updateTransfer(id: number, input: NewTransfer): Promise<void>;
  deleteTransfer(id: number): Promise<void>;
  getTransfer(id: number): Promise<TransferDetail>;
  listTransfers(from: string, to: string): Promise<TransferDetail[]>;
}
const SELECT = `SELECT t.id, t.date, t.amount, t.note,
  t.from_account_id AS fromAccountId, a.name AS fromAccountName,
  t.to_account_id AS toAccountId, b.name AS toAccountName
  FROM transfers t JOIN accounts a ON a.id = t.from_account_id JOIN accounts b ON b.id = t.to_account_id`;

async function getTransfer(q: Queryable, id: number): Promise<TransferDetail> {
  const row = await q.get<TransferDetail>(`${SELECT} WHERE t.id = ?`, [id]);
  if (!row) throw new LedgerError('unknown_transfer', '找不到這筆轉帳，可能已被刪除。');
  return row;
}
async function validate(tx: Queryable, input: NewTransfer, original?: TransferDetail): Promise<void> {
  if (!isValidDate(input.date)) throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new LedgerError('invalid_amount', '轉帳金額必須是大於 0 的整數（新台幣元）。');
  if (input.fromAccountId === input.toAccountId) throw new LedgerError('invalid_transfer', '轉出與轉入帳戶不能相同。');
  await assertDateOpen(tx, input.date);
  await assertAccountUsable(tx, input.fromAccountId, original?.fromAccountId);
  await assertAccountUsable(tx, input.toAccountId, original?.toAccountId);
}
export function transferCommands(db: Database, serial: <T>(task: () => Promise<T>) => Promise<T>): TransfersLedger {
  return {
    addTransfer: (input) => serial(() => db.transaction(async (tx) => {
      await validate(tx, input);
      const result = await tx.run('INSERT INTO transfers (date, from_account_id, to_account_id, amount, note) VALUES (?, ?, ?, ?, ?)', [input.date, input.fromAccountId, input.toAccountId, input.amount, input.note ?? '']);
      return { id: result.lastInsertRowId };
    })),
    updateTransfer: (id, input) => serial(() => db.transaction(async (tx) => {
      const original = await getTransfer(tx, id);
      await assertDateOpen(tx, original.date);
      await validate(tx, input, original);
      await tx.run('UPDATE transfers SET date = ?, from_account_id = ?, to_account_id = ?, amount = ?, note = ? WHERE id = ?', [input.date, input.fromAccountId, input.toAccountId, input.amount, input.note ?? '', id]);
    })),
    deleteTransfer: (id) => serial(() => db.transaction(async (tx) => {
      await assertDateOpen(tx, (await getTransfer(tx, id)).date);
      await tx.run('DELETE FROM transfers WHERE id = ?', [id]);
    })),
    getTransfer: (id) => serial(() => getTransfer(db, id)),
    listTransfers: (from, to) => serial(() => {
      if (!isValidDate(from) || !isValidDate(to) || from > to) throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
      return db.all<TransferDetail>(`${SELECT} WHERE t.date >= ? AND t.date <= ? ORDER BY t.date, t.id`, [from, to]);
    }),
  };
}
