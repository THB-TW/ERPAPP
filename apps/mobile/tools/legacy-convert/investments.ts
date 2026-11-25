// 舊投資欄位對應；精確小數保持字串，不經 Number 轉換。
import type { ExportValue, VerifiedExport } from '../../../../tools/lib/verify-export.mjs';
import type { LegacyImportData } from '../../src/ledger/index.ts';
import { findTable, resolver } from './legacyData.ts';
import { parseDate } from './plan.ts';
import { ConversionStopped } from './source.ts';

export interface RawInvestments {
  holdings: Record<string, ExportValue>[];
  transactions: Record<string, ExportValue>[];
  valuations: Record<string, ExportValue>[];
  openings: Record<string, ExportValue>[];
}
export function readInvestmentExport(verified: VerifiedExport): RawInvestments {
  const read = (name: string, columns: string[]) => {
    const table = findTable(verified, [name], '投資');
    const col = resolver(table);
    return table.rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[col(c)]])));
  };
  return {
    holdings: read('InvestmentHolding', ['Id', 'AssetClass', 'Symbol', 'Name', 'IsActive']),
    transactions: read('InvestmentTransaction', ['Id', 'HoldingId', 'Date', 'TxType', 'Quantity', 'Amount', 'FundSource', 'Note']),
    valuations: read('InvestmentValuation', ['Id', 'HoldingId', 'AsOf', 'UnitPrice', 'MarketValue']),
    openings: read('InvestmentOpening', ['Id', 'AsOfMonth', 'NetDeployed']),
  };
}
const integer = (v: ExportValue, what: string): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new ConversionStopped(`舊投資的${what}不是安全整數，已停止。`);
  return v;
};
const string = (v: ExportValue, what: string): string => {
  if (typeof v !== 'string') throw new ConversionStopped(`舊投資的${what}不是字串，已停止。`);
  return v;
};
const decimal = (v: ExportValue, what: string): string | null => {
  if (v === null) return null;
  const s = string(v, what);
  if (!/^\d+(\.\d{1,4})?$/.test(s) || s.split('.')[0].replace(/^0+/, '').length > 14) throw new ConversionStopped(`舊投資的${what}不是 DECIMAL(18,4)，已停止，不捨入來源。`);
  return s;
};
const terms = <T extends string>(v: ExportValue, map: Record<string, T>, what: string): T => {
  const found = typeof v === 'string' ? map[v] : undefined;
  if (!found) throw new ConversionStopped(`舊投資有不明${what}「${String(v)}」，已停止，不猜測。`);
  return found;
};

export function planInvestments(raw: RawInvestments): NonNullable<LegacyImportData['investments']> {
  if (raw.openings.length > 1) throw new ConversionStopped('舊投資有多筆期初投入宣告；雖然舊系統取第一筆，但搬遷不能悄悄丟列，請先確認。');
  return {
    holdings: raw.holdings.map((h) => ({
      id: integer(h.Id, '標的編號'), assetClass: terms(h.AssetClass, { 台股: 'stock', 虛擬貨幣: 'crypto' } as const, '標的種類'),
      symbol: h.Symbol === null ? null : string(h.Symbol, '台股代號'), name: string(h.Name, '標的名稱'),
      active: h.IsActive === true || h.IsActive === 1 ? true : h.IsActive === false || h.IsActive === 0 ? false : (() => { throw new ConversionStopped('舊投資的啟用狀態不正確。'); })(),
    })),
    transactions: raw.transactions.map((t) => {
      const date = parseDate(t.Date);
      if (!date) throw new ConversionStopped('舊投資交易日期不正確。');
      return { id: integer(t.Id, '交易編號'), holdingId: integer(t.HoldingId, '交易標的編號'), date,
        txType: terms(t.TxType, { 期初: 'opening', 買: 'buy', 賣: 'sell', 配息: 'dividend' } as const, '交易類型'),
        quantity: decimal(t.Quantity, '股數'), amount: integer(t.Amount, '交易金額'),
        fundSource: terms(t.FundSource, { 帳內: 'internal', 帳外: 'external' } as const, '資金來源'), account: null,
        note: t.Note === null ? '' : string(t.Note, '備註') };
    }),
    valuations: raw.valuations.map((v) => ({ id: integer(v.Id, '市值快照編號'), holdingId: integer(v.HoldingId, '市值快照標的編號'),
      asOf: string(v.AsOf, '市值時間'), unitPrice: decimal(v.UnitPrice, '每股股價'), marketValue: v.MarketValue === null ? null : integer(v.MarketValue, '市值') })),
    opening: raw.openings.length === 0 ? null : (() => {
      const row = raw.openings[0];
      const date = parseDate(row.AsOfMonth);
      if (!date || !date.endsWith('-01')) throw new ConversionStopped('舊投資期初月份不是某月1號。');
      return { asOfMonth: date.slice(0, 7), netDeployed: integer(row.NetDeployed, '期初投入額') };
    })(),
  };
}

/** 舊表沒有帳戶欄位；只為開帳日後的帳內買賣採用明確逐筆對應，歷史列維持 null。 */
export function assignInvestmentAccounts(
  source: NonNullable<LegacyImportData['investments']>, openingDate: string, accounts: readonly string[], mapping: Record<string, string> = {},
): NonNullable<LegacyImportData['investments']> {
  const assigned = new Map<number, string>();
  for (const [key, account] of Object.entries(mapping)) {
    if (!/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key))) throw new ConversionStopped(`投資帳戶對應的交易編號「${key}」不是正安全整數。`);
    const id = Number(key);
    const tx = source.transactions.find((t) => t.id === id);
    if (!tx) throw new ConversionStopped(`投資帳戶對應的交易 #${id} 不在來源裡。`);
    if (tx.date < openingDate || tx.fundSource !== 'internal' || !['buy', 'sell'].includes(tx.txType)) {
      throw new ConversionStopped(`投資交易 #${id} 不是開帳日後的帳內買賣，不應指定帳戶；歷史列維持沒有帳戶。`);
    }
    if (typeof account !== 'string' || !accounts.includes(account)) throw new ConversionStopped(`投資交易 #${id} 指定的帳戶「${String(account)}」不在舊帳帳戶清單裡。`);
    assigned.set(id, account);
  }
  const transactions = source.transactions.map((t) => {
    if (t.date < openingDate || t.fundSource !== 'internal' || !['buy', 'sell'].includes(t.txType)) return t;
    const account = assigned.get(t.id);
    if (account === undefined) throw new ConversionStopped(`投資交易 #${t.id}（${t.date}）為開帳日後的帳內買賣，舊表沒有帳戶；請加 --investment-account '${t.id}=帳戶完整名稱' 明確指定，不能猜測。`);
    return { ...t, account };
  });
  return { ...source, transactions };
}
