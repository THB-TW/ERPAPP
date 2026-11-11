// 總資產核對沿用財務文件的 Checks；不改月結引擎、歷史月結或帳戶餘額。
import type { Queryable } from '../db/driver.ts';
import { daysInMonth, isValidDate, isValidMonth, taipeiDate } from '../calc/dates.ts';
import type { AccountKind } from './defaults.ts';
import { accountBalances } from './accounts.ts';
import { previewMonthlyClose } from './monthlyClose.ts';
import { LedgerError } from './errors.ts';
import { BudgetRuleError } from '../calc/budgetEngine.ts';
import { assertMonthlyCloseAccess } from './budgetCommands.ts';
import { readStoredDocument, writeState } from './financeDocument.ts';
import { investmentCashFlows } from './investmentCashFlows.ts';
import { netDeployed as investmentNetDeployed } from './investment.ts';

export interface AssetCheckRequest {
  month: string;
  hasEntitlement: boolean;
  asOf?: string;
  balances?: { accountId: number; balance: number }[];
}
export interface AssetCheckMovement {
  kind: 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'investment_buy' | 'investment_sell';
  id: number;
  date: string;
  amount: number;
  adjustment: number;
  description: string;
}
export interface AssetCheckAccount {
  accountId: number;
  name: string;
  kind: AccountKind;
  editable: boolean;
  appBalance: number;
  inputBalance: number;
  appMonthEndBalance: number;
  monthEndBalance: number;
  difference: number;
  rollback: number;
  movements: AssetCheckMovement[];
}
export interface AssetCheckPreview {
  month: string;
  asOf: string;
  minDate: string;
  maxDate: string;
  version: number;
  checkToken: string;
  accounts: AssetCheckAccount[];
  bookTotal: number;
  rawTotal: number;
  rollbackTotal: number;
  actualTotal: number;
  netDeployed: number;
  difference: number;
  canComplete: boolean;
}
export interface RecordAssetCheckRequest extends AssetCheckRequest {
  operationId: string;
  checkToken: string;
}
export interface AssetCheckRecord {
  kind: 'app_asset_check_v1';
  id: string;
  month: string;
  time: string;
  storedVersion: number;
  input: { asOf: string; balances: { accountId: number; balance: number }[] };
  result: AssetCheckPreview;
  requestFingerprint: string;
}

function isAssetCheck(value: unknown): value is AssetCheckRecord {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'app_asset_check_v1';
}
export async function listAssetChecks(q: Queryable, month?: string): Promise<AssetCheckRecord[]> {
  if (month !== undefined && !isValidMonth(month)) throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
  return (await readStoredDocument(q)).state.checks.filter(isAssetCheck).filter((c) => month === undefined || c.month === month);
}

export async function recordAssetCheck(q: Queryable, input: RecordAssetCheckRequest, now: Date): Promise<AssetCheckRecord> {
  assertMonthlyCloseAccess(input.hasEntitlement);
  if (typeof input.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId)
    || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(input.operationId)) {
    throw new BudgetRuleError('argument', '核對操作識別碼不正確。');
  }
  const id = input.operationId.toLowerCase();
  const { exists, state } = await readStoredDocument(q);
  const previous = state.checks.filter(isAssetCheck).find((c) => c.id === id);
  const asOf = input.asOf ?? previous?.input.asOf ?? taipeiDate(now);
  const balances = [...input.balances ?? []].map((b) => ({ accountId: b.accountId, balance: b.balance })).sort((a, b) => a.accountId - b.accountId);
  const fingerprint = JSON.stringify([input.month, asOf, balances, input.checkToken]);
  if (previous) {
    if (previous.requestFingerprint !== fingerprint) throw new BudgetRuleError('operation', '核對識別碼已用於不同內容，請重新載入。');
    return previous;
  }
  const result = await previewAssetCheck(q, { ...input, asOf, balances }, now);
  if (result.checkToken !== input.checkToken) throw new BudgetRuleError('operation', '帳戶或交易已變更，請重新核對。');
  const storedVersion = integer(BigInt(state.version) + 1n);
  const record: AssetCheckRecord = { kind: 'app_asset_check_v1', id, month: input.month, time: now.toISOString(), storedVersion,
    input: { asOf, balances }, result, requestFingerprint: fingerprint };
  await writeState(q, exists, state.version, { ...state, version: storedVersion, checks: [...state.checks, record] });
  return record;
}

function integer(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new LedgerError('invalid_amount', '核對金額超出可安全計算的整數範圍。');
  return result;
}

/** 完成時在同一筆交易重算；不能只相信畫面的按鈕狀態或舊的零差額。 */
export async function assertAssetCheckForClose(q: Queryable, month: string, id: string | undefined, now: Date): Promise<void> {
  const record = (await listAssetChecks(q, month)).find((c) => c.id === id);
  if (!record) throw new BudgetRuleError('operation', '請先保存本月的總資產核對紀錄。');
  if (!record.result.canComplete || record.result.difference !== 0) throw new BudgetRuleError('operation', '總資產仍有差額，不能完成月結。');
  const { state } = await readStoredDocument(q);
  if (state.version !== record.storedVersion) throw new BudgetRuleError('operation', '預算或核對已變更，請重新核對。');
  const fresh = await previewAssetCheck(q, { month, hasEntitlement: true, ...record.input }, now);
  if (!fresh.canComplete || fresh.checkToken !== record.result.checkToken) {
    throw new BudgetRuleError('operation', '帳戶或交易已變更，請重新核對後再完成月結。');
  }
}
function total(values: number[]): number {
  return integer(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

export async function previewAssetCheck(q: Queryable, input: AssetCheckRequest, now: Date): Promise<AssetCheckPreview> {
  if (!isValidMonth(input.month)) throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
  const minDate = `${input.month}-${daysInMonth(Number(input.month.slice(0, 4)), Number(input.month.slice(5))).toString().padStart(2, '0')}`;
  const maxDate = taipeiDate(now);
  const asOf = input.asOf ?? maxDate;
  if (!isValidDate(asOf) || asOf < minDate || asOf > maxDate) {
    throw new LedgerError('invalid_date', '餘額日期須介於結算月月底與今天之間。');
  }
  const monthly = await previewMonthlyClose(q, input, now);
  const balances = await accountBalances(q, asOf);
  const overrides = new Map<number, number>();
  for (const entry of input.balances ?? []) {
    const account = balances.find((a) => a.id === entry.accountId);
    if (!account) throw new LedgerError('unknown_account', '找不到這個帳戶。');
    if (overrides.has(entry.accountId)) throw new LedgerError('invalid_account', '同一帳戶不能輸入兩次餘額。');
    if (account.kind !== 'bank' && account.kind !== 'e_wallet') throw new LedgerError('invalid_account', '現金與信用卡餘額由 App 計算，不能手動修改。');
    if (!Number.isSafeInteger(entry.balance)) throw new LedgerError('invalid_amount', '實際餘額必須是新台幣整數。');
    overrides.set(entry.accountId, entry.balance);
  }
  const opening = (await q.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_date'"))?.value ?? '0001-01-01';
  const movements = new Map<number, AssetCheckMovement[]>(balances.map((a) => [a.id, []]));
  const transactions = await q.all<{ id: number; accountId: number; date: string; amount: number; flow: 'income' | 'expense'; description: string }>(
    `SELECT t.id, t.account_id AS accountId, t.date, t.amount, t.flow, c.name AS description
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.date > ? AND t.date <= ? AND t.date >= ? ORDER BY t.date, t.id`, [minDate, asOf, opening]);
  for (const t of transactions) movements.get(t.accountId)!.push({ kind: t.flow, id: t.id, date: t.date,
    amount: t.amount, adjustment: t.flow === 'income' ? -t.amount : t.amount, description: t.description });
  const transfers = await q.all<{ id: number; fromId: number; toId: number; date: string; amount: number; fromName: string; toName: string }>(
    `SELECT t.id, t.from_account_id AS fromId, t.to_account_id AS toId, t.date, t.amount, a.name AS fromName, b.name AS toName
       FROM transfers t JOIN accounts a ON a.id = t.from_account_id JOIN accounts b ON b.id = t.to_account_id
      WHERE t.date > ? AND t.date <= ? AND t.date >= ? ORDER BY t.date, t.id`, [minDate, asOf, opening]);
  for (const t of transfers) {
    movements.get(t.fromId)!.push({ kind: 'transfer_out', id: t.id, date: t.date, amount: t.amount, adjustment: t.amount, description: `轉至${t.toName}` });
    movements.get(t.toId)!.push({ kind: 'transfer_in', id: t.id, date: t.date, amount: t.amount, adjustment: -t.amount, description: `來自${t.fromName}` });
  }
  for (const t of await investmentCashFlows(q, opening, asOf)) {
    if (t.date <= minDate) continue;
    movements.get(t.accountId)!.push({ kind: t.txType === 'buy' ? 'investment_buy' : 'investment_sell', id: t.id, date: t.date,
      amount: t.amount, adjustment: t.txType === 'buy' ? t.amount : -t.amount, description: t.description });
  }
  const accounts = balances.map((a): AssetCheckAccount => {
    const rows = movements.get(a.id)!.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id || a.kind.localeCompare(b.kind));
    const rollback = total(rows.map((r) => r.adjustment));
    const inputBalance = overrides.get(a.id) ?? a.balance;
    const appMonthEndBalance = total([a.balance, rollback]);
    const monthEndBalance = total([inputBalance, rollback]);
    return { accountId: a.id, name: a.name, kind: a.kind, editable: a.kind === 'bank' || a.kind === 'e_wallet',
      appBalance: a.balance, inputBalance, appMonthEndBalance, monthEndBalance,
      difference: integer(BigInt(monthEndBalance) - BigInt(appMonthEndBalance)), rollback, movements: rows };
  });
  const netDeployed = await investmentNetDeployed(q, minDate);
  const rawTotal = total(accounts.map((a) => a.inputBalance));
  const rollbackTotal = total(accounts.map((a) => a.rollback));
  const actualTotal = total([...accounts.map((a) => a.monthEndBalance), netDeployed]);
  const bookTotal = monthly.summary.total;
  const difference = integer(BigInt(actualTotal) - BigInt(bookTotal));
  const checkToken = JSON.stringify([input.month, asOf, accounts, bookTotal, netDeployed]);
  return { month: input.month, asOf, minDate, maxDate, version: monthly.version, checkToken, accounts,
    bookTotal, rawTotal, rollbackTotal, actualTotal, netDeployed, difference, canComplete: difference === 0 };
}
