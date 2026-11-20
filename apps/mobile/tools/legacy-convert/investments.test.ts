// 投資舊帳搬遷僅用虛構資料，從帳本服務讀回結果。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { LedgerError, openLedger, type LegacyImportData } from '../../src/ledger/index.ts';
import { serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { fictionalState } from './testExport.ts';

export function investmentData(): NonNullable<LegacyImportData['investments']> {
  return {
    holdings: [
      { id: 7, assetClass: 'stock', symbol: 'FICT', name: '虛構台股', active: true },
      { id: 9, assetClass: 'crypto', symbol: null, name: '虛構幣桶', active: false },
    ],
    transactions: [
      { id: 12, holdingId: 7, date: '2026-07-01', txType: 'opening', amount: 10, quantity: '0.3', fundSource: 'internal', account: null, note: '虛構期初' },
      { id: 15, holdingId: 7, date: '2026-08-01', txType: 'sell', amount: 4, quantity: '0.1', fundSource: 'internal', account: null, note: '' },
      { id: 18, holdingId: 9, date: '2026-07-02', txType: 'opening', amount: 200, quantity: null, fundSource: 'external', account: null, note: '' },
      { id: 20, holdingId: 9, date: '2026-08-03', txType: 'sell', amount: 250, quantity: null, fundSource: 'external', account: null, note: '' },
      { id: 22, holdingId: 7, date: '2026-09-01', txType: 'dividend', amount: 2, quantity: null, fundSource: 'internal', account: null, note: '' },
    ],
    opening: { asOfMonth: '2026-07', netDeployed: 50 },
    valuations: [
      { id: 3, holdingId: 7, asOf: '2026-10-01T12:00:00', unitPrice: '50.0000', marketValue: null },
      { id: 4, holdingId: 7, asOf: '2026-10-01T12:00:00', unitPrice: '60.0000', marketValue: null },
      { id: 8, holdingId: 9, asOf: '2026-10-01T12:00:00', unitPrice: null, marketValue: 300 },
    ],
  };
}
function data(): LegacyImportData {
  return { openingDate: '2026-11-01', accounts: [{ name: '虛構銀行', kind: 'bank', openingBalance: 1000 }],
    categories: [], members: [], transactions: [], document: serializeBudgetDocument(fictionalState()), investments: investmentData() };
}

test('舊投資標的、期初、交易與市值快照原樣搬入，歷史不重算且同時點取較大編號', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  try {
    const source = data();
    await ledger.importLegacyLedger(source);
    const portfolio = await ledger.getInvestmentPortfolio('2026-10-31');
    const stock = portfolio.positions.find((p) => p.holdingId === 7)!;
    assert.deepEqual([stock.quantity, stock.cost, stock.realizedPnl, stock.dividends, stock.marketValue], ['0.2', 7, 1, 2, 12]);
    assert.equal(await ledger.getNetDeployed('2026-10-31'), 46);
    assert.equal((await ledger.listInvestmentTransactions()).length, 5);
    assert.equal((await ledger.listInvestmentValuations()).length, 3);
    assert.equal((await ledger.listAccountBalances())[0].balance, 1000);
    assert.deepEqual(JSON.parse(await ledger.exportFinanceDocument()), JSON.parse(source.document));
  } finally { await ledger.close(); }
});

test('投資壞資料讓舊帳整批還原，不能留下半批帳戶與財務文件', async () => {
  for (const edit of [
    (x: ReturnType<typeof investmentData>) => { x.transactions[1].quantity = '0.4'; },
    (x: ReturnType<typeof investmentData>) => { x.transactions[0].quantity = null; },
    (x: ReturnType<typeof investmentData>) => { x.transactions[0].fundSource = '不明' as never; },
    (x: ReturnType<typeof investmentData>) => { x.transactions[1].date = '2026-11-02'; },
    (x: ReturnType<typeof investmentData>) => { x.valuations[0].holdingId = 999; },
  ]) {
    const ledger = await openLedger(openNodeDatabase(':memory:'));
    try {
      const source = data(); edit(source.investments!);
      await assert.rejects(ledger.importLegacyLedger(source), (e: unknown) => e instanceof LedgerError && e.code === 'invalid_legacy_import');
      assert.equal((await ledger.listAccounts()).length, 4);
      assert.deepEqual(await ledger.listInvestmentTransactions(), []);
      assert.deepEqual(await ledger.listBudgetMonths(), []);
    } finally { await ledger.close(); }
  }
});

test('只有投資資料的帳本也拒絕舊帳覆蓋', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  try {
    await ledger.addInvestmentHolding({ assetClass: 'stock', symbol: 'FICT', name: '虛構台股' }, { hasEntitlement: true });
    await assert.rejects(ledger.importLegacyLedger(data()), (e: unknown) => e instanceof LedgerError && e.code === 'ledger_not_empty');
  } finally { await ledger.close(); }
});
