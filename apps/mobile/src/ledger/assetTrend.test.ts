// 財產趨勢：只取已月結月份，數字與「財產分配」同一個計算。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger } from './index.ts';

const access = { hasEntitlement: true };
const now = new Date('2026-11-11T04:00:00Z');
const month = (m: string, rawSpare: number) => ({ id: m, month: m, income: 0, surplus: 0, rawSpare, tuition: 0, balances: {}, changes: {}, expenses: {},
  revision: null, migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: now.toISOString(), actor: 'test' });

test('每個已月結月份一點：帳面總資產、月底投資市值（無估值用成本並標記）、合計同財產分配', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => now });
  t.after(() => ledger.close());
  assert.deepEqual(await ledger.getAssetTrend(), []); // 還沒有月結
  await ledger.importLegacyLedger({ openingDate: '2026-10-01', accounts: [{ name: '銀行', kind: 'bank', openingBalance: 9000 }],
    categories: [], members: [], transactions: [], document: serializeBudgetDocument({ ...emptyBudgetState(), version: 1,
      months: [month('2026-07', 7000), month('2026-08', 8000), month('2026-09', 9000)] }) });
  const id = (await ledger.addInvestmentHolding({ assetClass: 'stock', symbol: '1234', name: '合成台股' }, access)).id;
  await ledger.addInvestmentTransaction({ holdingId: id, txType: 'opening', amount: 1000, quantity: '10', date: '2026-07-15', fundSource: 'external' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-08-20T10:00:00+08:00', unitPrice: '150' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-09-30T23:00:00+08:00', unitPrice: '120' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-10-01T09:00:00+08:00', unitPrice: '999' }, access); // 下個月，不算進九月

  const trend = await ledger.getAssetTrend();
  assert.deepEqual(trend.map((p) => [p.month, p.investment, p.investmentAtCost]), [
    ['2026-07', 1000, true], ['2026-08', 1500, false], ['2026-09', 1200, false],
  ]);
  for (const p of trend) {
    const end = { '2026-07': '2026-07-31', '2026-08': '2026-08-31', '2026-09': '2026-09-30' }[p.month]!;
    const portfolio = await ledger.getInvestmentPortfolio(end);
    assert.deepEqual([p.book, p.total], [portfolio.bookTotal, portfolio.allocationTotal], p.month);
  }
  assert.deepEqual(trend.map((p) => p.total - p.book), [1000, 1500, 1200]); // 這裡沒有帳內投入，合計＝帳面＋市值
});
