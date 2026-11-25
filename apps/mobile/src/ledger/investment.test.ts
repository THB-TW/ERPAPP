import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { LedgerError, openLedger, type Ledger } from './index.ts';

const access = { hasEntitlement: true };
const now = new Date('2026-11-11T04:00:00Z');
async function setup(t: TestContext): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => now });
  t.after(() => ledger.close());
  return ledger;
}
async function stock(ledger: Ledger) {
  return (await ledger.addInvestmentHolding({ assetClass: 'stock', symbol: '1234', name: '合成台股' }, access)).id;
}
async function trade(ledger: Ledger, holdingId: number, txType: 'opening' | 'buy' | 'sell' | 'dividend', amount: number,
  quantity?: string, date = '2026-10-01', fundSource: 'internal' | 'external' = 'external', accountId?: number) {
  return ledger.addInvestmentTransaction({ holdingId, txType, amount, quantity, date, fundSource, accountId }, access);
}

test('台股移動平均保留小數成本，每筆損益遠離零，全部賣出成本歸零', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'opening', 101, '2');
  await trade(ledger, id, 'sell', 51, '1');
  let p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl, p.totalBuy], ['1', 51, 1, 101]);
  await trade(ledger, id, 'buy', 49, '1');
  await trade(ledger, id, 'sell', 49, '1');
  p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl, p.totalBuy], ['1', 50, 0, 150]);
  await trade(ledger, id, 'sell', 50, '1');
  p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl], ['0', 0, 0]);
});

test('負半元已實現損益也遠離零，不能先把結轉成本四捨五入', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'buy', 101, '2');
  await trade(ledger, id, 'sell', 50, '1');
  assert.equal((await ledger.getInvestmentPortfolio()).positions[0].realizedPnl, -1);
});

test('C# decimal 中間精度：5除6再乘3略低於2.5，負損益不應誤算成負1', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'opening', 5, '6');
  await trade(ledger, id, 'sell', 2, '3');
  let p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl], ['3', 3, 0]);
  await trade(ledger, id, 'buy', 7, '2');
  await trade(ledger, id, 'sell', 10, '4');
  p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl], ['1', 2, 2]);
  await trade(ledger, id, 'sell', 1, '1');
  p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl], ['0', 0, 1]);
});

test('十進位股數精確相加與出清，含小數股價的市值也遠離零', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'buy', 10, '0.1');
  await trade(ledger, id, 'buy', 20, '0.2');
  await ledger.addInvestmentValuation({ holdingId: id, asOf: now.toISOString(), unitPrice: '5' }, access);
  const p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.marketValue, p.unrealized], ['0.3', 2, -28]);
  await trade(ledger, id, 'sell', 30, '0.3');
  assert.equal((await ledger.getInvestmentPortfolio()).positions[0].cost, 0);
});

test('虛擬貨幣成本收回可為負且不認列損益，配息不減部位', async (t) => {
  const ledger = await setup(t);
  const { id } = await ledger.addInvestmentHolding({ assetClass: 'crypto', name: '虛擬貨幣' }, access);
  await trade(ledger, id, 'opening', 100);
  await trade(ledger, id, 'buy', 50);
  await trade(ledger, id, 'sell', 200);
  await trade(ledger, id, 'dividend', 7);
  let p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.quantity, p.cost, p.realizedPnl, p.dividends, p.totalBuy, p.marketValue], ['0', -50, 0, 7, 150, -50]);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: now.toISOString(), marketValue: 0 }, access);
  p = (await ledger.getInvestmentPortfolio()).positions[0];
  assert.deepEqual([p.marketValue, p.unrealized, p.totalReturn], [0, 50, 57]);
});

test('台股代號不能重複，虛擬貨幣只能一桶，拒絕未知標的類別', async (t) => {
  const ledger = await setup(t); await stock(ledger);
  await assert.rejects(stock(ledger), /重複|已經/);
  await ledger.addInvestmentHolding({ assetClass: 'crypto', name: '幣桶' }, access);
  await assert.rejects(ledger.addInvestmentHolding({ assetClass: 'crypto', name: '另一桶' }, access), /一個|已經/);
  await assert.rejects(ledger.addInvestmentHolding({ assetClass: 'bond' as 'stock', name: '錯誤' }, access), /台股|類別/);
});

test('缺股數、賣超、未知類型、不合法十進位及金額均拒絕且不留半筆', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await assert.rejects(trade(ledger, id, 'buy', 100), (e: unknown) => e instanceof LedgerError && e.code === 'invalid_investment' && /股數/.test(e.message));
  await trade(ledger, id, 'buy', 100, '1');
  await assert.rejects(trade(ledger, id, 'sell', 100, '1.0001'), /僅持有|賣超/);
  await assert.rejects(trade(ledger, id, 'other' as 'buy', 100, '1'), /類型/);
  for (const q of ['0', '-1', '1e2', 'NaN', '0.00001', '100000000000000']) {
    await assert.rejects(trade(ledger, id, 'buy', 100, q), /股數|小數|範圍/);
  }
  for (const amount of [0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(trade(ledger, id, 'buy', amount, '1'), /金額/);
  }
  assert.equal((await ledger.listInvestmentTransactions()).length, 1);
});

test('補早期交易按日期與編號驗證整條時間軸，不能依賴未來買進', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'buy', 100, '1', '2026-10-02');
  await assert.rejects(trade(ledger, id, 'sell', 120, '1', '2026-10-01'), /持有|賣超/);
  await trade(ledger, id, 'sell', 120, '1', '2026-10-02');
  assert.equal((await ledger.getInvestmentPortfolio()).positions[0].realizedPnl, 20);
});

test('累計投入淨額採獨立期初、次月下界與結算月底上界，排除期初列配息帳外', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await ledger.setInvestmentOpening({ asOfMonth: '2026-09', netDeployed: 300 }, access);
  await trade(ledger, id, 'opening', 100, '1', '2026-09-01');
  await trade(ledger, id, 'buy', 50, '1', '2026-09-30', 'internal', 2);
  await trade(ledger, id, 'buy', 70, '1', '2026-10-01', 'internal', 2);
  await trade(ledger, id, 'buy', 999, '1', '2026-10-10');
  await trade(ledger, id, 'dividend', 5, undefined, '2026-10-10', 'internal', 2);
  await trade(ledger, id, 'sell', 20, '1', '2026-10-31', 'internal', 2);
  await trade(ledger, id, 'buy', 40, '1', '2026-11-01', 'internal', 2);
  assert.deepEqual(await ledger.getInvestmentOpening(), { asOfMonth: '2026-09', netDeployed: 300 });
  assert.equal(await ledger.getNetDeployed('2026-09-30'), 300);
  assert.equal(await ledger.getNetDeployed('2026-10-31'), 350);
  assert.equal(await ledger.getNetDeployed(), 390);
  assert.equal((await ledger.listAccountBalances('2026-10-31'))[1].balance, -100);
});

test('帳內買賣需使用中帳戶，帳外及期初配息不異動帳戶或月收入', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await assert.rejects(trade(ledger, id, 'buy', 100, '1', '2026-10-01', 'internal'), /帳戶/);
  await assert.rejects(trade(ledger, id, 'buy', 100, '1', '2026-10-01', 'internal', 999), /帳戶/);
  await ledger.updateAccount(2, { active: false });
  await assert.rejects(trade(ledger, id, 'buy', 100, '1', '2026-10-01', 'internal', 2), /停用/);
  await trade(ledger, id, 'opening', 100, '1');
  await trade(ledger, id, 'dividend', 5, undefined, '2026-10-01', 'internal', 1);
  assert.equal((await ledger.listAccountBalances())[0].balance, 0);
  assert.equal(await ledger.getMonthIncome('2026-10'), 0);
});

test('快照同時間取較大編號，保留歷史；按查詢日期排除未來快照與交易', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'buy', 100, '2');
  const asOf = '2026-10-02T02:00:00Z';
  await ledger.addInvestmentValuation({ holdingId: id, asOf, unitPrice: '50.25' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf, unitPrice: '60.25' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-11-01T02:00:00Z', unitPrice: '70' }, access);
  await trade(ledger, id, 'buy', 50, '1', '2026-11-01');
  assert.equal((await ledger.listInvestmentValuations(id)).length, 3);
  assert.equal((await ledger.getInvestmentPortfolio('2026-10-31')).positions[0].marketValue, 121);
  assert.equal((await ledger.getInvestmentPortfolio()).positions[0].marketValue, 210);
  await assert.rejects(ledger.addInvestmentValuation({ holdingId: id, asOf, unitPrice: '-1' }, access), /股價|單價/);
});

test('沒有權益拒絕全部投資寫入，過期仍可查詢既有投資', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger); const denied = { hasEntitlement: false };
  await assert.rejects(ledger.addInvestmentHolding({ assetClass: 'crypto', name: '幣' }, denied), /付費權益/);
  await assert.rejects(ledger.addInvestmentTransaction({ holdingId: id, txType: 'buy', amount: 10, quantity: '1', date: '2026-10-01', fundSource: 'external' }, denied), /付費權益/);
  await assert.rejects(ledger.setInvestmentOpening({ asOfMonth: '2026-09', netDeployed: 1 }, denied), /付費權益/);
  await assert.rejects(ledger.addInvestmentValuation({ holdingId: id, asOf: now.toISOString(), unitPrice: '1' }, denied), /付費權益/);
  assert.equal((await ledger.getInvestmentPortfolio()).positions.length, 1);
  assert.deepEqual(await ledger.listInvestmentTransactions(), []);
});

test('舊 DATETIME2 七位小數與不同時區精確排序，較早快照不能蓋過較晚者', async (t) => {
  const ledger = await setup(t); const id = await stock(ledger);
  await trade(ledger, id, 'buy', 1, '1');
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-10-02T12:00:00.0000002', unitPrice: '20' }, access);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-10-02T04:00:00.0000001Z', unitPrice: '10' }, access);
  assert.equal((await ledger.getInvestmentPortfolio()).positions[0].marketValue, 20);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: '2026-11-01T00:00:00+08:00', unitPrice: '30' }, access);
  assert.equal((await ledger.getInvestmentPortfolio('2026-10-31')).positions[0].marketValue, 20);
});

async function closeSetup(t: TestContext) {
  const ledger = await setup(t);
  await ledger.importLegacyLedger({ openingDate: '2026-10-01', accounts: [{ name: '銀行', kind: 'bank', openingBalance: 1000 }],
    categories: [], members: [], transactions: [], document: serializeBudgetDocument({ ...emptyBudgetState(), version: 1,
      revisions: [{ id: 'caps', month: '2026-10', limits: [], mapping: {}, tuition: 0, reason: '合成', actor: 'test', time: now.toISOString() }],
      months: [{ id: 'base', month: '2026-09', income: 0, surplus: 0, rawSpare: 1000, tuition: 0, balances: {}, changes: {}, expenses: {},
        revision: null, migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: now.toISOString(), actor: 'test' }],
    }) });
  return ledger;
}
test('總資產核對採月底投入淨額並倒回之後帳內買賣，不用市值、不改月結八數字', async (t) => {
  const ledger = await closeSetup(t); const id = await stock(ledger);
  const input = { month: '2026-10', hasEntitlement: true };
  const before = await ledger.previewMonthlyClose(input);
  await trade(ledger, id, 'buy', 200, '2', '2026-10-31', 'internal', 1);
  await trade(ledger, id, 'buy', 100, '1', '2026-11-01', 'internal', 1);
  await trade(ledger, id, 'sell', 50, '1', '2026-11-02', 'internal', 1);
  await ledger.addInvestmentValuation({ holdingId: id, asOf: now.toISOString(), unitPrice: '999' }, access);
  const check = await ledger.previewAssetCheck(input);
  assert.deepEqual([check.netDeployed, check.rawTotal, check.rollbackTotal, check.actualTotal, check.bookTotal, check.difference], [200, 750, 50, 1000, 1000, 0]);
  assert.deepEqual(check.accounts[0].movements.map((m) => [m.kind, m.adjustment]), [['investment_buy', 100], ['investment_sell', -50]]);
  assert.deepEqual((await ledger.previewMonthlyClose(input)).summary, before.summary);
  const portfolio = await ledger.getInvestmentPortfolio();
  assert.deepEqual([portfolio.bookTotal, portfolio.nonInvestment, portfolio.allocationTotal], [1000, 750, 2748]);
});

test('已結月份投資交易拒絕，已保存核對後的投資現金流異動使舊核對失效', async (t) => {
  const ledger = await closeSetup(t); const id = await stock(ledger);
  await assert.rejects(trade(ledger, id, 'buy', 100, '1', '2026-09-30', 'internal', 1), /已結月份/);
  const input = { month: '2026-10', hasEntitlement: true };
  const check = await ledger.previewAssetCheck(input);
  const record = await ledger.recordAssetCheck({ ...input, checkToken: check.checkToken, operationId: randomUUID() });
  await trade(ledger, id, 'buy', 100, '1', '2026-11-01', 'internal', 1);
  await assert.rejects(ledger.completeMonthlyClose({ ...await ledger.previewMonthlyClose(input), hasEntitlement: true, assetCheckId: record.id, operationId: randomUUID() }), /重新核對/);
  assert.deepEqual(await ledger.listAssetChecks(), [record]);
});

test('期初投入額變動讓舊核對失效，但快照市值變動不影響已保存的零差額核對', async (t) => {
  const input = { month: '2026-10', hasEntitlement: true };
  const ledger = await closeSetup(t);
  const check = await ledger.previewAssetCheck(input);
  const saved = await ledger.recordAssetCheck({ ...input, checkToken: check.checkToken, operationId: randomUUID() });
  await ledger.setInvestmentOpening({ asOfMonth: '2026-09', netDeployed: 10 }, access);
  await assert.rejects(ledger.completeMonthlyClose({ ...await ledger.previewMonthlyClose(input), ...access, assetCheckId: saved.id, operationId: randomUUID() }), /重新核對/);
  assert.deepEqual(await ledger.listAssetChecks(), [saved]);

  const second = await closeSetup(t); const id = await stock(second);
  await trade(second, id, 'buy', 100, '1');
  const preview = await second.previewAssetCheck(input);
  const record = await second.recordAssetCheck({ ...input, checkToken: preview.checkToken, operationId: randomUUID() });
  await second.addInvestmentValuation({ holdingId: id, asOf: now.toISOString(), unitPrice: '500' }, access);
  assert.equal((await second.previewAssetCheck(input)).checkToken, preview.checkToken);
  await second.completeMonthlyClose({ ...await second.previewMonthlyClose(input), ...access, assetCheckId: record.id, operationId: randomUUID() });
  assert.equal(await second.isMonthClosed('2026-10'), true);
  assert.equal((await second.getBudgetMonth('2026-10')).total, 1000);
});
