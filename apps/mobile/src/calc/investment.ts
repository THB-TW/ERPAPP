import { add, compare, decimal, decimalText, divide, inputDecimal, multiply, rounded, safeInteger, subtract } from './investmentDecimal.ts';

export type InvestmentAssetClass = 'stock' | 'crypto';
export type InvestmentTxType = 'opening' | 'buy' | 'sell' | 'dividend';
export interface InvestmentHolding { id: number; assetClass: InvestmentAssetClass; symbol: string | null; name: string; active: boolean }
export interface InvestmentTransaction {
  id: number; holdingId: number; date: string; txType: InvestmentTxType; amount: number;
  quantity: string | null; fundSource: 'internal' | 'external'; accountId: number | null; note: string;
}
export interface InvestmentValuation { id: number; holdingId: number; asOf: string; unitPrice: string | null; marketValue: number | null }
export interface InvestmentPosition {
  holdingId: number; assetClass: InvestmentAssetClass; symbol: string | null; name: string; active: boolean;
  quantity: string; cost: number; totalBuy: number; realizedPnl: number; dividends: number;
  hasValuation: boolean; valuationAsOf: string | null; unitPrice: string | null;
  marketValue: number; unrealized: number; totalReturn: number;
}

/** 對照 Services/InvestmentCalculator.cs：日期、編號排序；每次算術保留 decimal 精度。 */
export function computeInvestment(h: InvestmentHolding, transactions: InvestmentTransaction[], latest?: InvestmentValuation): InvestmentPosition {
  let quantity = decimal(0); let cost = decimal(0); let totalBuy = 0n; let pnl = 0n; let dividends = 0n;
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const amount = decimal(t.amount);
    let q = decimal(0);
    if (h.assetClass === 'stock' && t.txType !== 'dividend') {
      try { q = decimal(inputDecimal(t.quantity, '股數')); } catch (e) { throw new Error(`「${h.name}」${t.date} 缺少有效股數：${(e as Error).message}`); }
    }
    switch (t.txType) {
      case 'opening': case 'buy':
        if (h.assetClass === 'stock') quantity = add(quantity, q);
        cost = add(cost, amount); totalBuy += BigInt(t.amount); break;
      case 'sell':
        if (h.assetClass === 'stock') {
          if (quantity.n <= 0n || compare(q, quantity) > 0) throw new Error(`「${h.name}」${t.date} 賣超，當時僅持有 ${decimalText(quantity)} 股。`);
          const costOut = multiply(divide(cost, quantity), q);
          pnl += rounded(subtract(amount, costOut));
          quantity = subtract(quantity, q); cost = subtract(cost, costOut);
          if (quantity.n === 0n) cost = decimal(0);
        } else cost = subtract(cost, amount);
        break;
      case 'dividend': dividends += BigInt(t.amount); break;
      default: throw new Error(`「${h.name}」有未知的交易類型。`);
    }
  }
  const roundedCost = rounded(cost);
  const hasValuation = h.assetClass === 'stock' ? latest?.unitPrice != null : latest?.marketValue != null;
  const marketValue = hasValuation ? h.assetClass === 'stock' ? rounded(multiply(quantity, decimal(latest!.unitPrice!))) : BigInt(latest!.marketValue!) : roundedCost;
  const unrealized = marketValue - roundedCost;
  return { holdingId: h.id, assetClass: h.assetClass, symbol: h.symbol, name: h.name, active: h.active,
    quantity: decimalText(quantity), cost: safeInteger(roundedCost), totalBuy: safeInteger(totalBuy), realizedPnl: safeInteger(pnl), dividends: safeInteger(dividends),
    hasValuation, valuationAsOf: hasValuation ? latest!.asOf : null, unitPrice: latest?.unitPrice ?? null,
    marketValue: safeInteger(marketValue), unrealized: safeInteger(unrealized), totalReturn: safeInteger(unrealized + pnl + dividends) };
}
