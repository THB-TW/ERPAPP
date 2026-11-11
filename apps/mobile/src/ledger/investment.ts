import type { Database, Queryable } from '../db/driver.ts';
import { isValidDate, isValidMonth, shiftMonth } from '../calc/dates.ts';
import { computeInvestment, type InvestmentAssetClass, type InvestmentHolding, type InvestmentPosition, type InvestmentTransaction, type InvestmentValuation } from '../calc/investment.ts';
import { inputDecimal, safeInteger } from '../calc/investmentDecimal.ts';
import { assertAccountUsable } from './accounts.ts';
import { assertDateOpen } from './monthLock.ts';
import { LedgerError } from './errors.ts';
import { readStoredDocument } from './financeDocument.ts';
import { budgetMonths } from './budgetViews.ts';

export type { InvestmentAssetClass, InvestmentHolding, InvestmentPosition, InvestmentTransaction, InvestmentValuation } from '../calc/investment.ts';
export interface InvestmentAccess { hasEntitlement: boolean }
export interface InvestmentOpening { asOfMonth: string; netDeployed: number }
export interface NewInvestmentHolding { assetClass: InvestmentAssetClass; symbol?: string | null; name: string }
export type NewInvestmentTransaction = Omit<InvestmentTransaction, 'id' | 'quantity' | 'accountId' | 'note'> & { quantity?: string | null; accountId?: number | null; note?: string };
export type NewInvestmentValuation = Omit<InvestmentValuation, 'id' | 'unitPrice' | 'marketValue'> & { unitPrice?: string | null; marketValue?: number | null };
export interface InvestmentPortfolio { positions: InvestmentPosition[]; netDeployed: number; bookTotal: number; nonInvestment: number; allocationTotal: number }
export interface InvestmentsLedger {
  addInvestmentHolding(input: NewInvestmentHolding, access: InvestmentAccess): Promise<{ id: number }>;
  addInvestmentTransaction(input: NewInvestmentTransaction, access: InvestmentAccess): Promise<{ id: number }>;
  addInvestmentValuation(input: NewInvestmentValuation, access: InvestmentAccess): Promise<{ id: number }>;
  setInvestmentOpening(input: InvestmentOpening, access: InvestmentAccess): Promise<void>;
  getInvestmentOpening(): Promise<InvestmentOpening | null>;
  getInvestmentPortfolio(asOf?: string): Promise<InvestmentPortfolio>;
  getNetDeployed(asOf?: string): Promise<number>;
  listInvestmentTransactions(holdingId?: number): Promise<InvestmentTransaction[]>;
  listInvestmentValuations(holdingId?: number): Promise<InvestmentValuation[]>;
}
function bad(message: string): never { throw new LedgerError('invalid_investment', message); }
function calculation<T>(task: () => T): T {
  try { return task(); } catch (e) { if (e instanceof Error) bad(e.message); throw e; }
}
function accessAllowed(access: InvestmentAccess) {
  if (access?.hasEntitlement !== true) bad('需要有效的付費權益才能新增或修改投資。');
}
function amount(value: number, allowNegative = false, allowZero = false) {
  if (!Number.isSafeInteger(value) || (!allowNegative && (allowZero ? value < 0 : value <= 0))) bad('投資金額必須是有效的新台幣整數。');
}
function day(value: string) { if (!isValidDate(value)) bad('投資日期格式不正確，請用 YYYY-MM-DD。'); }
export function investmentTime(value: string): bigint {
  // 舊 DATETIME2 沒有時區，保留原字串，按台北時間解讀；不能依手機當下時區決定。
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})?$/.test(value) || !isValidDate(value.slice(0, 10))) bad('市值快照時間格式不正確。');
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) bad('市值快照時間格式不正確。');
  const withoutFraction = value.replace(/\.\d+/, '');
  const result = Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(withoutFraction) ? withoutFraction : `${withoutFraction}+08:00`);
  if (!Number.isFinite(result)) bad('市值快照時間格式不正確。');
  return BigInt(result) * 10000n + BigInt((value.match(/\.(\d+)/)?.[1] ?? '').padEnd(7, '0'));
}
export async function investmentHoldings(q: Queryable): Promise<InvestmentHolding[]> {
  const rows = await q.all<Omit<InvestmentHolding, 'active'> & { active: number }>('SELECT id, asset_class AS assetClass, symbol, name, active FROM investment_holdings ORDER BY asset_class, symbol, id');
  return rows.map((h) => ({ ...h, active: h.active === 1 }));
}
async function holding(q: Queryable, id: number): Promise<InvestmentHolding> {
  return (await investmentHoldings(q)).find((h) => h.id === id) ?? bad('找不到這個投資標的。');
}
export async function listInvestmentTransactions(q: Queryable, holdingId?: number): Promise<InvestmentTransaction[]> {
  if (holdingId !== undefined) await holding(q, holdingId);
  return q.all<InvestmentTransaction>(`SELECT id, holding_id AS holdingId, date, tx_type AS txType, amount, quantity, fund_source AS fundSource, account_id AS accountId, note FROM investment_transactions ${holdingId === undefined ? '' : 'WHERE holding_id = ?'} ORDER BY date, id`, holdingId === undefined ? [] : [holdingId]);
}
export async function listInvestmentValuations(q: Queryable, holdingId?: number): Promise<InvestmentValuation[]> {
  if (holdingId !== undefined) await holding(q, holdingId);
  return (await q.all<InvestmentValuation>(`SELECT id, holding_id AS holdingId, as_of AS asOf, unit_price AS unitPrice, market_value AS marketValue FROM investment_valuations ${holdingId === undefined ? '' : 'WHERE holding_id = ?'}`, holdingId === undefined ? [] : [holdingId]))
    .sort((a, b) => { const x = investmentTime(a.asOf); const y = investmentTime(b.asOf); return x === y ? a.id - b.id : x < y ? -1 : 1; });
}
export async function investmentOpening(q: Queryable): Promise<InvestmentOpening | null> {
  const saved = await q.get<InvestmentOpening>('SELECT as_of_month AS asOfMonth, net_deployed AS netDeployed FROM investment_opening WHERE id = 1');
  if (saved) return saved;
  // 票 18 既有帳本把期初投入額存在設定。沒有投資模組的明確期初時才採用，
  // 讓新舊開帳與備份還原都能核對；只轉接讀取，不改舊資料或重複累加兩個宣告值。
  const opening = await q.get<{ date: string; deployed: string }>(
    `SELECT d.value AS date, n.value AS deployed FROM settings d JOIN settings n ON n.key = 'opening_deployed'
      WHERE d.key = 'opening_date'`);
  if (!opening) return null;
  if (!isValidDate(opening.date) || !opening.date.endsWith('-01')) bad('開帳日必須是有效月份的 1 號。');
  const netDeployed = Number(opening.deployed);
  amount(netDeployed, true, true);
  return { asOfMonth: shiftMonth(opening.date.slice(0, 7), -1), netDeployed };
}
export async function netDeployed(q: Queryable, asOf: string): Promise<number> {
  day(asOf);
  const opening = await investmentOpening(q);
  // 月字串比較保留 C# 的「期初次月起」；即使查更早月份仍加期初宣告值。
  const txs = await listInvestmentTransactions(q);
  const net = txs.filter((t) => t.fundSource === 'internal' && t.date <= asOf && (!opening || t.date.slice(0, 7) > opening.asOfMonth))
    .reduce((sum, t) => sum + (t.txType === 'buy' ? BigInt(t.amount) : t.txType === 'sell' ? -BigInt(t.amount) : 0n), BigInt(opening?.netDeployed ?? 0));
  return calculation(() => safeInteger(net));
}
export async function investmentPositions(q: Queryable, asOf?: string): Promise<InvestmentPosition[]> {
  if (asOf !== undefined) day(asOf);
  const holdings = await investmentHoldings(q);
  const txs = await listInvestmentTransactions(q);
  const vals = await listInvestmentValuations(q);
  const upper = asOf === undefined ? null : investmentTime(`${asOf}T23:59:59.9999999+08:00`);
  return holdings.map((h) => calculation(() => computeInvestment(h, txs.filter((t) => t.holdingId === h.id && (asOf === undefined || t.date <= asOf)),
    vals.filter((v) => v.holdingId === h.id && (upper === null || investmentTime(v.asOf) <= upper)).at(-1))));
}

async function addHolding(q: Queryable, input: NewInvestmentHolding) {
  if (!['stock', 'crypto'].includes(input.assetClass)) bad('投資類別只能是台股或虛擬貨幣。');
  if (typeof input.name !== 'string' || !input.name.trim()) bad('請輸入投資標的名稱。');
  const symbol = input.assetClass === 'stock' ? input.symbol?.trim() : null;
  if (input.assetClass === 'stock' && !symbol) bad('台股必須填代號。');
  if ((await investmentHoldings(q)).some((h) => input.assetClass === 'crypto' ? h.assetClass === 'crypto' : h.symbol?.toLowerCase() === symbol!.toLowerCase())) bad(input.assetClass === 'crypto' ? '虛擬貨幣只能有一個標的。' : '已經有相同代號的台股，不能重複建立。');
  const result = await q.run('INSERT INTO investment_holdings (asset_class, symbol, name, active) VALUES (?, ?, ?, 1)', [input.assetClass, symbol ?? null, input.name.trim()]);
  return { id: result.lastInsertRowId };
}
async function addTransaction(q: Queryable, input: NewInvestmentTransaction) {
  const h = await holding(q, input.holdingId);
  if (!h.active) bad('這個投資標的已停用。');
  day(input.date); amount(input.amount, false, input.txType === 'opening');
  if (!['opening', 'buy', 'sell', 'dividend'].includes(input.txType)) bad('未知的投資交易類型。');
  if (!['internal', 'external'].includes(input.fundSource)) bad('投資資金來源不正確。');
  const quantity = h.assetClass === 'stock' && input.txType !== 'dividend' ? calculation(() => inputDecimal(input.quantity, '股數')) : null;
  const cashFlow = input.fundSource === 'internal' && ['buy', 'sell'].includes(input.txType);
  const accountId = cashFlow ? input.accountId : null;
  // 期初部位不動現金；允許補建開帳前的部位，帳內買賣仍遵守已結月份鎖定。
  if (input.txType !== 'opening') await assertDateOpen(q, input.date);
  if (cashFlow) {
    if (!Number.isSafeInteger(accountId)) bad('帳內買賣必須指定帳戶。');
    await assertAccountUsable(q, accountId!);
  }
  if (input.note !== undefined && typeof input.note !== 'string') bad('投資備註格式不正確。');
  const result = await q.run('INSERT INTO investment_transactions (holding_id,date,tx_type,amount,quantity,fund_source,account_id,note) VALUES (?,?,?,?,?,?,?,?)',
    [h.id, input.date, input.txType, input.amount, quantity, input.fundSource, accountId ?? null, input.note ?? '']);
  // 新增在最末編號，驗證順序即實際存檔順序；失敗整筆 SQLite 交易還原。
  const transactions = await listInvestmentTransactions(q, h.id);
  calculation(() => computeInvestment(h, transactions));
  await netDeployed(q, '9999-12-31');
  return { id: result.lastInsertRowId };
}
async function addValuation(q: Queryable, input: NewInvestmentValuation) {
  const h = await holding(q, input.holdingId); investmentTime(input.asOf);
  const unitPrice = h.assetClass === 'stock' ? calculation(() => inputDecimal(input.unitPrice, '股價')) : null;
  const marketValue = h.assetClass === 'crypto' ? input.marketValue : null;
  if (h.assetClass === 'crypto') amount(marketValue!, false, true);
  const result = await q.run('INSERT INTO investment_valuations (holding_id,as_of,unit_price,market_value) VALUES (?,?,?,?)', [h.id, input.asOf, unitPrice, marketValue ?? null]);
  await investmentPositions(q);
  return { id: result.lastInsertRowId };
}
async function investmentPortfolio(q: Queryable, date: string): Promise<InvestmentPortfolio> {
  day(date);
  const positions = await investmentPositions(q, date);
  const net = await netDeployed(q, date);
  const bookTotal = budgetMonths((await readStoredDocument(q)).state).filter((m) => m.month <= date.slice(0, 7)).at(-1)?.total ?? 0;
  const nonInvestment = calculation(() => safeInteger(BigInt(bookTotal) - BigInt(net)));
  return { positions, netDeployed: net, bookTotal, nonInvestment, allocationTotal: calculation(() => safeInteger(positions.filter((p) => p.active).reduce((sum, p) => sum + BigInt(p.marketValue), BigInt(nonInvestment)))) };
}
export function investmentCommands(db: Database, serial: <T>(task: () => Promise<T>) => Promise<T>, today: () => string): InvestmentsLedger {
  const write = <T>(access: InvestmentAccess, task: (q: Queryable) => Promise<T>): Promise<T> => serial(() => db.transaction(async (tx) => {
    accessAllowed(access);
    const result = await task(tx);
    // 個別部位、既有快照與整體合計都要可讀；超範圍時連同新增列一起還原。
    await investmentPortfolio(tx, today());
    await investmentPortfolio(tx, '9999-12-31');
    return result;
  }));
  return {
    addInvestmentHolding: (input, access) => write(access, (tx) => addHolding(tx, input)),
    addInvestmentTransaction: (input, access) => write(access, (tx) => addTransaction(tx, input)),
    addInvestmentValuation: (input, access) => write(access, (tx) => addValuation(tx, input)),
    setInvestmentOpening: (input, access) => write(access, async (tx) => {
      if (!isValidMonth(input.asOfMonth)) bad('期初月份格式不正確，請用 YYYY-MM。'); amount(input.netDeployed, true);
      await tx.run('INSERT INTO investment_opening (id,as_of_month,net_deployed) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET as_of_month=excluded.as_of_month, net_deployed=excluded.net_deployed', [input.asOfMonth, input.netDeployed]);
      await netDeployed(tx, '9999-12-31');
    }),
    getInvestmentOpening: () => serial(() => investmentOpening(db)),
    getNetDeployed: (asOf) => serial(() => netDeployed(db, asOf ?? today())),
    listInvestmentTransactions: (holdingId) => serial(() => listInvestmentTransactions(db, holdingId)),
    listInvestmentValuations: (holdingId) => serial(() => listInvestmentValuations(db, holdingId)),
    getInvestmentPortfolio: (asOf) => serial(() => investmentPortfolio(db, asOf ?? today())),
  };
}
