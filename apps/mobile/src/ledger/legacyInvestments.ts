// 舊投資原樣帶入：保留來源編號以固定同日順序，不猜測舊系統沒有保存的帳戶。
import type { Queryable } from '../db/driver.ts';
import { isValidDate, isValidMonth } from '../calc/dates.ts';
import { LedgerError } from './errors.ts';
import { investmentPositions, netDeployed } from './investment.ts';

export interface LegacyInvestments {
  holdings: { id: number; assetClass: 'stock' | 'crypto'; symbol: string | null; name: string; active: boolean }[];
  transactions: { id: number; holdingId: number; date: string; txType: 'opening' | 'buy' | 'sell' | 'dividend'; amount: number; quantity: string | null; fundSource: 'internal' | 'external'; account: string | null; note: string }[];
  valuations: { id: number; holdingId: number; asOf: string; unitPrice: string | null; marketValue: number | null }[];
  opening: { asOfMonth: string; netDeployed: number } | null;
}
const bad = (message: string): never => { throw new LedgerError('invalid_legacy_import', `舊投資無法帶入：${message}`); };
const id = (n: number) => Number.isSafeInteger(n) && n > 0;
const money = (n: number) => Number.isSafeInteger(n);
function decimal(s: string | null): boolean {
  if (typeof s !== 'string' || !/^\d+(\.\d{1,4})?$/.test(s)) return false;
  const [whole, fraction = ''] = s.split('.');
  return whole.replace(/^0+/, '').length <= 14 && (whole + fraction).replace(/^0+/, '').length <= 18;
}
function unique(rows: { id: number }[], what: string): void {
  const ids = new Set<number>();
  for (const row of rows) {
    if (!id(row.id) || ids.has(row.id)) bad(`${what}的編號不正確或重複。`);
    ids.add(row.id);
  }
}

/** 由 importLegacy 的同一筆 SQLite 交易呼叫；任一筆不合即整批還原。 */
export async function importLegacyInvestments(q: Queryable, input: LegacyInvestments | undefined, openingDate: string): Promise<void> {
  if (!input) return;
  unique(input.holdings, '標的'); unique(input.transactions, '交易'); unique(input.valuations, '市值快照');
  const holdingIds = new Set(input.holdings.map((h) => h.id));
  const symbols = new Set<string>();
  let crypto = false;
  for (const h of input.holdings) {
    if (!['stock', 'crypto'].includes(h.assetClass) || typeof h.name !== 'string' || !h.name.trim() || typeof h.active !== 'boolean') bad('標的種類、名稱或狀態不正確。');
    if (h.assetClass === 'stock') {
      if (typeof h.symbol !== 'string' || !h.symbol.trim() || symbols.has(h.symbol.toLowerCase())) bad('台股代號缺漏或重複。');
      symbols.add(h.symbol!.toLowerCase());
    } else {
      if (crypto || h.symbol !== null) bad('虛擬貨幣只能有一個桶，且不填股票代號。');
      crypto = true;
    }
    await q.run('INSERT INTO investment_holdings (id, asset_class, symbol, name, active) VALUES (?, ?, ?, ?, ?)', [h.id, h.assetClass, h.symbol, h.name, h.active ? 1 : 0]);
  }
  if (input.opening) {
    if (!isValidMonth(input.opening.asOfMonth) || !money(input.opening.netDeployed)) bad('期初月份或累計投入淨額不正確。');
    await q.run('INSERT INTO investment_opening (id, as_of_month, net_deployed) VALUES (1, ?, ?)', [input.opening.asOfMonth, input.opening.netDeployed]);
  }
  for (const t of input.transactions) {
    if (!holdingIds.has(t.holdingId) || !isValidDate(t.date) || !['opening', 'buy', 'sell', 'dividend'].includes(t.txType)
      || !['internal', 'external'].includes(t.fundSource) || !money(t.amount) || t.amount < 0 || (t.amount === 0 && t.txType !== 'opening')
      || (t.quantity !== null && !decimal(t.quantity)) || typeof t.note !== 'string') bad(`交易 #${t.id} 的欄位不正確。`);
    let accountId: number | null = null;
    if (t.account !== null) {
      const a = await q.get<{ id: number }>('SELECT id FROM accounts WHERE name = ?', [t.account]);
      if (!a) bad(`交易 #${t.id} 的帳戶不存在。`);
      accountId = a!.id;
    }
    if (t.fundSource === 'external' && accountId !== null) bad(`交易 #${t.id} 為帳外，不應指定帳戶。`);
    if (t.fundSource === 'internal' && (t.txType === 'buy' || t.txType === 'sell') && t.date >= openingDate && accountId === null) {
      bad(`交易 #${t.id} 在開帳日以後、但舊系統沒有保存帳戶；請先明確提供帳戶，不可猜測。`);
    }
    await q.run('INSERT INTO investment_transactions (id, holding_id, date, tx_type, amount, quantity, fund_source, account_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [t.id, t.holdingId, t.date, t.txType, t.amount, t.quantity, t.fundSource, accountId, t.note]);
  }
  for (const v of input.valuations) {
    const h = input.holdings.find((h) => h.id === v.holdingId);
    if (!h || typeof v.asOf !== 'string' || !isValidDate(v.asOf.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})?$/.test(v.asOf)
      || !Number.isFinite(Date.parse(v.asOf)) || (h.assetClass === 'stock' ? !decimal(v.unitPrice) || v.marketValue !== null
        : v.unitPrice !== null || v.marketValue === null || !money(v.marketValue) || v.marketValue < 0)) bad(`市值快照 #${v.id} 的欄位不正確。`);
    await q.run('INSERT INTO investment_valuations (id, holding_id, as_of, unit_price, market_value) VALUES (?, ?, ?, ?, ?)', [v.id, v.holdingId, v.asOf, v.unitPrice, v.marketValue]);
  }
  try { await investmentPositions(q); await netDeployed(q, '9999-12-31'); }
  catch (e) { bad(e instanceof Error ? e.message : String(e)); }
}
