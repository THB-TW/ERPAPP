// 投資的獨立來源算法：不呼叫 App 的投資計算器，避免以同一算法自證。
import type { Ledger } from '../../src/ledger/index.ts';
import { daysInMonth } from '../../src/calc/dates.ts';
import { planInvestments, type RawInvestments } from '../legacy-convert/investments.ts';
import { ConversionStopped } from '../legacy-convert/source.ts';
import type { Difference } from './compare.ts';

export interface InvestmentComparison {
  asOf: string;
  sourceCount: number;
  appCount: number;
  sourceNetDeployed: number;
  appNetDeployed: number;
  rows: { name: string; sourceCost: number; appCost: number | null; sourceMarketValue: number; appMarketValue: number | null }[];
  differences: Difference[];
}
type Fraction = { n: bigint; d: bigint };
function fraction(n: bigint, d = 1n): Fraction {
  let a = n < 0n ? -n : n; let b = d;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return { n: n / (a || 1n), d: d / (a || 1n) };
}
// 依 C# decimal 的 96 位元係數與 28 位小數，各中間算術採最近偶數捨入。
// 這份 oracle 使用分數量化，獨立於 App 的係數／scale 運算。
function cs(value: Fraction): Fraction {
  const sign = value.n < 0n ? -1n : 1n;
  const absolute = value.n < 0n ? -value.n : value.n;
  for (let places = 28; places >= 0; places--) {
    const denominator = 10n ** BigInt(places);
    const expanded = absolute * denominator;
    const whole = expanded / value.d; const rest = expanded % value.d;
    const coefficient = whole + (rest * 2n > value.d || (rest * 2n === value.d && whole % 2n !== 0n) ? 1n : 0n);
    if (coefficient <= (1n << 96n) - 1n) return fraction(sign * coefficient, denominator);
  }
  throw new ConversionStopped('舊投資計算超過 C# decimal 範圍，已停止比對。');
}
const plus = (a: Fraction, b: Fraction) => cs(fraction(a.n * b.d + b.n * a.d, a.d * b.d));
function timestamp(value: string): bigint {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) throw new ConversionStopped('舊投資的市值快照時間格式不正確。');
  return BigInt(Date.parse(match[1] + (match[3] ?? '+08:00'))) * 10_000n + BigInt((match[2] ?? '').padEnd(7, '0'));
}

const scaled = (s: string): bigint => { const [whole, decimal = ''] = s.split('.'); return BigInt(whole + decimal.padEnd(4, '0')); };
function integer(n: bigint): number {
  const result = Number(n);
  if (!Number.isSafeInteger(result)) throw new ConversionStopped('舊投資的計算結果超過安全整數，已停止，不能以捨入值驗收。');
  return result;
}
function rounded(f: Fraction): number {
  const absolute = f.n < 0n ? -f.n : f.n;
  const result = (absolute * 2n + f.d) / (f.d * 2n);
  return integer(f.n < 0n ? -result : result);
}
const canonical = (s: string | null) => s === null ? null : s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace(/^0+(?=\d)/, '');

/** 比對資料原貌與獨立算出的成本／市值／累計投入淨額；停用標的同樣涵蓋。 */
export async function compareInvestments(ledger: Ledger, raw: RawInvestments, cutoffMonth: string): Promise<InvestmentComparison> {
  const source = planInvestments(raw);
  const asOf = `${cutoffMonth}-${String(daysInMonth(Number(cutoffMonth.slice(0, 4)), Number(cutoffMonth.slice(5)))).padStart(2, '0')}`;
  const portfolio = await ledger.getInvestmentPortfolio(asOf);
  const appAll = (await ledger.getInvestmentPortfolio('9999-12-31')).positions;
  const differences: Difference[] = [];
  const eq = (kind: string, field: string, expected: string | number, actual: string | number) => {
    if (expected !== actual) differences.push({ scope: '投資', kind, field, source: '來源投資表', expected, actual });
  };
  eq('投資總量', '投資標的數', source.holdings.length, appAll.length);
  const rows: InvestmentComparison['rows'] = [];
  for (const h of source.holdings) {
    const app = portfolio.positions.find((p) => p.holdingId === h.id);
    const metadata = appAll.find((p) => p.holdingId === h.id);
    eq('投資標的', `標的 #${h.id}`, JSON.stringify([h.assetClass, h.symbol, h.name, h.active]),
      metadata ? JSON.stringify([metadata.assetClass, metadata.symbol, metadata.name, metadata.active]) : '缺少標的');
    let quantity = 0n; let cost = fraction(0n); let realized = 0n; let dividends = 0n;
    for (const t of source.transactions.filter((t) => t.holdingId === h.id && t.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      if (t.txType === 'opening' || t.txType === 'buy') {
        if (h.assetClass === 'stock') {
          if (t.quantity === null || scaled(t.quantity) <= 0n) throw new ConversionStopped(`舊投資標的 #${h.id} 缺股數，已停止比對。`);
          quantity += scaled(t.quantity);
        }
        cost = plus(cost, fraction(BigInt(t.amount)));
      } else if (t.txType === 'sell') {
        if (h.assetClass === 'crypto') cost = plus(cost, fraction(-BigInt(t.amount)));
        else {
          const sell = t.quantity === null ? 0n : scaled(t.quantity);
          if (sell <= 0n || sell > quantity) throw new ConversionStopped(`舊投資標的 #${h.id} 缺股數或賣超，已停止比對。`);
          const average = cs(fraction(cost.n * 10_000n, cost.d * quantity));
          const out = cs(fraction(average.n * sell, average.d * 10_000n));
          realized += BigInt(rounded(plus(fraction(BigInt(t.amount)), fraction(-out.n, out.d))));
          quantity -= sell; cost = quantity === 0n ? fraction(0n) : plus(cost, fraction(-out.n, out.d));
        }
      } else dividends += BigInt(t.amount);
    }
    const costValue = rounded(cost);
    const upper = timestamp(`${asOf}T23:59:59.9999999+08:00`);
    const latest = source.valuations.filter((v) => v.holdingId === h.id && timestamp(v.asOf) <= upper).sort((a, b) => timestamp(a.asOf) === timestamp(b.asOf) ? b.id - a.id : timestamp(a.asOf) < timestamp(b.asOf) ? 1 : -1)[0];
    const marketValue = h.assetClass === 'stock' ? latest?.unitPrice == null ? costValue : rounded(cs(fraction(quantity * scaled(latest.unitPrice), 100_000_000n)))
      : latest?.marketValue ?? costValue;
    eq('各標的成本', `${h.name} 持有成本`, costValue, app?.cost ?? '缺少標的');
    eq('各標的市值', `${h.name} 最新市值`, marketValue, app?.marketValue ?? '缺少標的');
    eq('各標的損益', `${h.name} 已實現損益`, integer(realized), app?.realizedPnl ?? '缺少標的');
    eq('各標的投資收入', `${h.name} 配息`, integer(dividends), app?.dividends ?? '缺少標的');
    rows.push({ name: h.name, sourceCost: costValue, appCost: app?.cost ?? null, sourceMarketValue: marketValue, appMarketValue: app?.marketValue ?? null });
  }
  let deployed = BigInt(source.opening?.netDeployed ?? 0);
  for (const t of source.transactions) {
    if (t.fundSource !== 'internal' || t.date > asOf || (source.opening && t.date.slice(0, 7) <= source.opening.asOfMonth)) continue;
    if (t.txType === 'buy') deployed += BigInt(t.amount);
    if (t.txType === 'sell') deployed -= BigInt(t.amount);
  }
  const sourceNetDeployed = integer(deployed);
  const appNetDeployed = await ledger.getNetDeployed(asOf);
  eq('累計投入淨額', `截至 ${asOf} 累計投入淨額`, sourceNetDeployed, appNetDeployed);
  eq('期初投入宣告', '期初月份與投入淨額', JSON.stringify(source.opening), JSON.stringify(await ledger.getInvestmentOpening()));
  const txKey = (t: { id: number; holdingId: number; date: string; txType: string; amount: number; quantity: string | null; fundSource: string; note: string }) =>
    JSON.stringify([t.id, t.holdingId, t.date, t.txType, t.amount, canonical(t.quantity), t.fundSource, t.note]);
  const valKey = (v: { id: number; holdingId: number; asOf: string; unitPrice: string | null; marketValue: number | null }) => JSON.stringify([v.id, v.holdingId, v.asOf, canonical(v.unitPrice), v.marketValue]);
  eq('投資交易原貌', '投資交易（含期初與配息）', JSON.stringify(source.transactions.map(txKey).sort()), JSON.stringify((await ledger.listInvestmentTransactions()).map(txKey).sort()));
  eq('市值快照原貌', '全部市值歷史', JSON.stringify(source.valuations.map(valKey).sort()), JSON.stringify((await ledger.listInvestmentValuations()).map(valKey).sort()));
  return { asOf, sourceCount: source.holdings.length, appCount: appAll.length, sourceNetDeployed, appNetDeployed, rows, differences };
}
