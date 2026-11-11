import type { Queryable } from '../db/driver.ts';
export interface InvestmentCashFlow { id: number; accountId: number; date: string; amount: number; txType: 'buy' | 'sell'; description: string }
/** 帳戶餘額與月結倒回共用；只有帳內買賣動現金，期初與配息各有獨立語意。 */
export function investmentCashFlows(q: Queryable, from: string, to: string): Promise<InvestmentCashFlow[]> {
  return q.all<InvestmentCashFlow>(`SELECT t.id, t.account_id AS accountId, t.date, t.amount, t.tx_type AS txType, h.name AS description
    FROM investment_transactions t JOIN investment_holdings h ON h.id=t.holding_id
    WHERE t.fund_source='internal' AND t.tx_type IN ('buy','sell') AND t.account_id IS NOT NULL AND t.date>=? AND t.date<=? ORDER BY t.date,t.id`, [from, to]);
}
