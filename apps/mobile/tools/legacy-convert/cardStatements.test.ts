// 信用卡舊帳搬遷只經由帳本服務驗證；資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { LedgerError, openLedger, type LegacyImportData } from '../../src/ledger/index.ts';
import { serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { fictionalState } from './testExport.ts';

function data(): LegacyImportData {
  return {
    openingDate: '2026-11-01', accounts: [{ name: '虛構卡', kind: 'credit_card', openingBalance: -500 }],
    categories: [], members: [], transactions: [], document: serializeBudgetDocument(fictionalState()),
    cardStatements: [
      { date: '2026-09-03', merchant: '虛構商行', amount: 250, account: '虛構卡' },
      { date: '2026-09-03', merchant: '虛構商行', amount: 250, account: '虛構卡' },
    ],
  };
}

test('舊帳信用卡明細原樣帶入已結月份，保留合法重複列與財務文件', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  try {
    const source = data();
    const result = await ledger.importLegacyLedger(source);
    assert.equal(result.cardStatements, 2);
    assert.equal(result.cardStatementTotal, 500);
    assert.deepEqual((await ledger.listCardStatements({ month: '2026-09' })).map((r) => [r.date, r.merchant, r.amount, r.account]), [
      ['2026-09-03', '虛構商行', 250, '虛構卡'], ['2026-09-03', '虛構商行', 250, '虛構卡'],
    ]);
    assert.deepEqual(JSON.parse(await ledger.exportFinanceDocument()), JSON.parse(source.document));
  } finally { await ledger.close(); }
});

test('信用卡舊帳任一列不合規定，整批帶入還原且原預設帳戶保留', async () => {
  for (const bad of [
    { date: '2026-02-30' }, { merchant: '' }, { amount: -1 }, { amount: 1.5 }, { account: '不存在的卡' },
  ]) {
    const ledger = await openLedger(openNodeDatabase(':memory:'));
    try {
      const source = data();
      source.cardStatements!.push({ ...source.cardStatements![0], ...bad });
      await assert.rejects(ledger.importLegacyLedger(source), (error: unknown) => error instanceof LedgerError && error.code === 'invalid_legacy_import');
      assert.equal((await ledger.listAccounts()).length, 4);
      assert.deepEqual(await ledger.listCardStatements(), []);
      assert.deepEqual(await ledger.listBudgetMonths(), []);
    } finally { await ledger.close(); }
  }
});

test('只有信用卡帳單列的帳本也不能被舊帳帶入覆蓋', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  try {
    const card = (await ledger.listAccounts()).find((a) => a.kind === 'credit_card')!;
    await ledger.importCardStatement({ accountId: card.id, csv: '2026-11-03,虛構商行,250' });
    await assert.rejects(ledger.importLegacyLedger(data()), (error: unknown) => error instanceof LedgerError && error.code === 'ledger_not_empty');
    assert.equal((await ledger.listCardStatements()).length, 1);
  } finally { await ledger.close(); }
});

test('信用卡舊帳合計超過安全整數時明確拒絕，整批還原', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  try {
    const source = data();
    source.cardStatements = source.cardStatements!.map((row) => ({ ...row, amount: 4_503_599_627_370_496 }));
    await assert.rejects(ledger.importLegacyLedger(source), (error: unknown) =>
      error instanceof LedgerError && error.code === 'invalid_legacy_import' && /合計.*安全整數/.test(error.message));
    assert.equal((await ledger.listAccounts()).length, 4);
    assert.deepEqual(await ledger.listCardStatements(), []);
    assert.deepEqual(await ledger.listBudgetMonths(), []);
  } finally { await ledger.close(); }
});
