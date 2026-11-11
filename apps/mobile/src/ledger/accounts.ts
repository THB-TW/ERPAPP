import type { Database, Queryable } from '../db/driver.ts';
import { isValidDate } from '../calc/dates.ts';
import { ACCOUNT_KINDS, type AccountKind } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { INVALID_DATE_MESSAGE } from './transactionRules.ts';

export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  /** 開帳日當天餘額；信用卡未繳金額為負。 */
  openingBalance: number;
  active: boolean;
}
export interface AccountBalance extends Account { balance: number }
export interface NewAccount { name: string; kind: AccountKind; openingBalance?: number }
export interface AccountChanges { name?: string; openingBalance?: number; active?: boolean }
export interface AccountsLedger {
  /** 包含停用帳戶；畫面的新增選單只列使用中帳戶。 */
  listAccounts(): Promise<Account[]>;
  addAccount(input: NewAccount): Promise<{ id: number }>;
  updateAccount(id: number, changes: AccountChanges): Promise<void>;
  /** 含截止日，預設今天。未設定全域開帳日時暫計全部交易；不可查開帳日前餘額。 */
  listAccountBalances(asOf?: string): Promise<AccountBalance[]>;
}
type Serial = <T>(task: () => Promise<T>) => Promise<T>;

async function listAccounts(q: Queryable): Promise<Account[]> {
  const rows = await q.all<Omit<Account, 'active'> & { active: number }>(
    'SELECT id, name, kind, opening_balance AS openingBalance, active FROM accounts ORDER BY sort_order, id',
  );
  return rows.map((a) => ({ ...a, active: a.active === 1 }));
}

async function knownAccount(q: Queryable, id: number): Promise<Account> {
  const row = (await listAccounts(q)).find((a) => a.id === id);
  if (!row) throw new LedgerError('unknown_account', '找不到這個帳戶。');
  return row;
}

/** 停用帳戶不能承接新交易；修改歷史時可保留該筆原本的帳戶。 */
export async function assertAccountUsable(q: Queryable, id: number, originalId?: number): Promise<void> {
  const row = await q.get<{ active: number }>('SELECT active FROM accounts WHERE id = ?', [id]);
  if (!row) throw new LedgerError('unknown_account', '找不到這個帳戶。');
  if (row.active !== 1 && id !== originalId) throw new LedgerError('account_inactive', '這個帳戶已停用，請選擇使用中的帳戶。');
}

async function validName(q: Queryable, value: string, exceptId?: number): Promise<string> {
  if (typeof value !== 'string' || !value.trim()) throw new LedgerError('invalid_account', '請輸入帳戶名稱。');
  const name = value.trim();
  const clash = await q.get<{ id: number }>('SELECT id FROM accounts WHERE name = ? COLLATE NOCASE', [name]);
  if (clash && clash.id !== exceptId) throw new LedgerError('account_name_conflict', '已經有同名帳戶，請使用其他名稱。');
  return name;
}
function validBalance(value: number): void {
  if (!Number.isSafeInteger(value)) throw new LedgerError('invalid_amount', '開帳餘額必須是整數（新台幣元），信用卡未繳金額請填負數。');
}

async function addAccount(tx: Queryable, input: NewAccount): Promise<{ id: number }> {
  const name = await validName(tx, input.name);
  if (!(ACCOUNT_KINDS as readonly string[]).includes(input.kind)) throw new LedgerError('invalid_account', '帳戶種類只能是現金、銀行、信用卡或電子支付。');
  const openingBalance = input.openingBalance ?? 0;
  validBalance(openingBalance);
  const last = await tx.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM accounts');
  const result = await tx.run('INSERT INTO accounts (name, kind, sort_order, opening_balance) VALUES (?, ?, ?, ?)', [name, input.kind, (last?.top ?? -1) + 1, openingBalance]);
  return { id: result.lastInsertRowId };
}

async function updateAccount(tx: Queryable, id: number, changes: AccountChanges): Promise<void> {
  const original = await knownAccount(tx, id);
  const name = changes.name === undefined ? original.name : await validName(tx, changes.name, id);
  const openingBalance = changes.openingBalance === undefined ? original.openingBalance : changes.openingBalance;
  validBalance(openingBalance);
  if (changes.active !== undefined && typeof changes.active !== 'boolean') throw new LedgerError('invalid_account', '帳戶狀態不正確。');
  const active = changes.active ?? original.active;
  await tx.run('UPDATE accounts SET name = ?, opening_balance = ?, active = ? WHERE id = ?', [name, openingBalance, active ? 1 : 0, id]);
}

async function accountBalances(q: Queryable, asOf: string): Promise<AccountBalance[]> {
  if (!isValidDate(asOf)) throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
  const opening = (await q.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_date'"))?.value ?? '0001-01-01';
  if (asOf < opening) throw new LedgerError('invalid_date', '餘額日期不能早於開帳日。');
  // 逐筆以 BigInt 加總，避免 SQL SUM 溢位或 JS 浮點捨入後誤報餘額。
  const totals = new Map<number, bigint>();
  for (const a of await listAccounts(q)) totals.set(a.id, BigInt(a.openingBalance));
  const transactions = await q.all<{ accountId: number; amount: number; flow: string }>(
    'SELECT account_id AS accountId, amount, flow FROM transactions WHERE date >= ? AND date <= ?', [opening, asOf],
  );
  for (const t of transactions) totals.set(t.accountId, totals.get(t.accountId)! + BigInt(t.amount) * (t.flow === 'income' ? 1n : -1n));
  const transfers = await q.all<{ fromId: number; toId: number; amount: number }>(
    'SELECT from_account_id AS fromId, to_account_id AS toId, amount FROM transfers WHERE date >= ? AND date <= ?', [opening, asOf],
  );
  for (const t of transfers) {
    totals.set(t.fromId, totals.get(t.fromId)! - BigInt(t.amount));
    totals.set(t.toId, totals.get(t.toId)! + BigInt(t.amount));
  }
  return (await listAccounts(q)).map((a) => {
    const balance = Number(totals.get(a.id)!);
    if (!Number.isSafeInteger(balance)) throw new LedgerError('invalid_amount', '帳戶餘額超出可安全計算的整數範圍。');
    return { ...a, balance };
  });
}

/** 接上帳本服務共用佇列，所有寫入均為單筆 SQLite 交易。 */
export function accountCommands(db: Database, serial: Serial, today: () => string): AccountsLedger {
  return {
    listAccounts: () => serial(() => listAccounts(db)),
    addAccount: (input) => serial(() => db.transaction((tx) => addAccount(tx, input))),
    updateAccount: (id, changes) => serial(() => db.transaction((tx) => updateAccount(tx, id, changes))),
    listAccountBalances: (asOf) => serial(() => accountBalances(db, asOf ?? today())),
  };
}
