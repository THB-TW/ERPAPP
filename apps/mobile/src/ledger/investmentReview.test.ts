// 審核補充：所有資料均為合成，經帳本服務與真 SQLite 驗證寫入失敗的原子性。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { openLedger, LedgerError } from './index.ts';

const access = { hasEntitlement: true };
const now = new Date('2026-11-11T04:00:00Z');
async function setup(t: TestContext) {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => now });
  t.after(() => ledger.close());
  return ledger;
}

test('新增股數不能使既有市值快照超出安全整數，拒絕後仍可查閱原部位', async (t) => {
  const ledger = await setup(t);
  const { id } = await ledger.addInvestmentHolding({ assetClass: 'stock', symbol: 'TST1', name: '合成安全部位' }, access);
  await ledger.addInvestmentTransaction({ holdingId: id, date: '2026-10-01', txType: 'buy', quantity: '1', amount: 1, fundSource: 'external' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-10-01T12:00:00+08:00', unitPrice: '100' }, access);
  const before = await ledger.getInvestmentPortfolio();
  await assert.rejects(ledger.addInvestmentTransaction({ holdingId: id, date: '2026-10-02', txType: 'buy', quantity: '99999999999999.9999', amount: 1, fundSource: 'external' }, access),
    (e: unknown) => e instanceof LedgerError && e.code === 'invalid_investment' && /安全|範圍/.test(e.message));
  assert.equal((await ledger.listInvestmentTransactions()).length, 1);
  assert.deepEqual(await ledger.getInvestmentPortfolio(), before);
});

test('各標的市值皆合法但分配合計溢位時拒絕快照，保留既有可讀的投資組合', async (t) => {
  const ledger = await setup(t);
  const first = await ledger.addInvestmentHolding({ assetClass: 'stock', symbol: 'TST1', name: '合成部位一' }, access);
  const second = await ledger.addInvestmentHolding({ assetClass: 'stock', symbol: 'TST2', name: '合成部位二' }, access);
  for (const { id } of [first, second]) {
    await ledger.addInvestmentTransaction({ holdingId: id, date: '2026-10-01', txType: 'buy', quantity: '100', amount: 1, fundSource: 'external' }, access);
  }
  await ledger.addInvestmentValuation({ holdingId: first.id, asOf: '2026-10-01T12:00:00+08:00', unitPrice: '50000000000000' }, access);
  const before = await ledger.getInvestmentPortfolio();
  await assert.rejects(ledger.addInvestmentValuation({ holdingId: second.id, asOf: '2026-10-01T12:00:00+08:00', unitPrice: '50000000000000' }, access),
    (e: unknown) => e instanceof LedgerError && e.code === 'invalid_investment' && /安全|範圍/.test(e.message));
  assert.equal((await ledger.listInvestmentValuations()).length, 1);
  assert.deepEqual(await ledger.getInvestmentPortfolio(), before);
});
