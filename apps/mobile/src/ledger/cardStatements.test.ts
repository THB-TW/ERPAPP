// 合成帳單；只從帳本服務操作，背後使用真 SQLite。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { CsvFormatError, openLedger } from './index.ts';

async function setup(t: TestContext) {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => new Date('2026-11-11T04:00:00Z') });
  t.after(() => ledger.close());
  const card = (await ledger.listAccounts()).find((a) => a.kind === 'credit_card')!;
  return { ledger, card };
}

test('信用卡與記帳 CSV 的格式錯誤皆可用帳本入口的 CsvFormatError 識別，整份壞檔不寫入', async (t) => {
  const { ledger, card } = await setup(t);
  const malformed = '2026-10-02,"未閉合,100';
  await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv: malformed }),
    (error: unknown) => error instanceof CsvFormatError);
  await assert.rejects(ledger.importTransactionsCsv('類別,金額\n"未閉合,100'),
    (error: unknown) => error instanceof CsvFormatError);
  assert.deepEqual(await ledger.listCardStatements(), []);
  assert.deepEqual(await ledger.listTransactions('2026-01-01', '2026-12-31'), []);
});

test('三欄帳單保留同鍵合法重複，重跑只補不足數量，負數不匯入也不計數，卡片互相隔離', async (t) => {
  const { ledger, card } = await setup(t);
  const csv = '日期,店家,金額\n2026/10/2,合成商店,100\n2026/10/2,合成商店,100\n2026/10/3,合成繳款,-200';
  assert.deepEqual(await ledger.importCardStatement({ accountId: card.id, csv }), { imported: 2, skipped: 0, total: 2 });
  assert.deepEqual(await ledger.importCardStatement({ accountId: card.id, csv }), { imported: 0, skipped: 2, total: 2 });
  assert.deepEqual(await ledger.importCardStatement({ accountId: card.id, csv: csv + '\n2026/10/2,合成商店,100' }),
    { imported: 1, skipped: 2, total: 3 });
  const second = await ledger.addAccount({ name: '合成第二張卡', kind: 'credit_card' });
  assert.deepEqual(await ledger.importCardStatement({ accountId: second.id, csv }), { imported: 2, skipped: 0, total: 2 });
  const rows = await ledger.listCardStatements({ accountId: card.id, month: '2026-10' });
  assert.deepEqual(rows.map((r) => [r.date, r.merchant, r.amount, r.accountId, r.account]),
    Array.from({ length: 3 }, () => ['2026-10-02', '合成商店', 100, card.id, card.name]));
});

test('銀行前十筆內辨識標題、按欄位取值，保留摘要內未加引號逗號並略過負數', async (t) => {
  const { ledger, card } = await setup(t);
  const csv = [...Array.from({ length: 9 }, (_, i) => `合成說明${i + 1}`),
    '消費日,入帳起息日,摘要,幣別,消費地金額,外幣折算日,消費地,末四碼,新臺幣金額',
    '2026/10/2,2026/10/3,合成商店,分店,TWD,999,,TW,1234,"1,200"',
    '2026/10/3,2026/10/3,合成繳款,TWD,0,,TW,1234,"-1,200"',
  ].join('\n');
  assert.deepEqual(await ledger.importCardStatement({ accountId: card.id, csv }), { imported: 1, skipped: 0, total: 1 });
  assert.deepEqual((await ledger.listCardStatements()).map((r) => [r.date, r.merchant, r.amount]), [['2026-10-02', '合成商店,分店', 1200]]);
});

test('隨 App 打包的解碼器支援 UTF-8 BOM、Big5 自動及明確選擇；錯誤位元組不寫入', async (t) => {
  const { ledger, card } = await setup(t);
  const big5 = Uint8Array.from(Buffer.from('a4e9b4c12ca9b1ae612caaf7c3420a323032362f31302f30342cb4fab8d5b0d3a9b12c3132330a', 'hex'));
  assert.deepEqual(await ledger.importCardStatement({ accountId: card.id, csv: big5 }), { imported: 1, skipped: 0, total: 1 });
  assert.deepEqual(await ledger.importCardStatement({ accountId: card.id, csv: big5, encoding: 'big5' }), { imported: 0, skipped: 1, total: 1 });
  const utf8 = new TextEncoder().encode('\ufeff日期,店家,金額\r\n2026/10/05,"合成,\"\"商店\"\"",234');
  await ledger.importCardStatement({ accountId: card.id, csv: utf8, encoding: 'utf-8' });
  await ledger.importCardStatement({ accountId: card.id, csv: '2026-10-06,"合成\n,,,\n分店",345' });
  assert.deepEqual((await ledger.listCardStatements()).map((r) => [r.date, r.merchant, r.amount]), [
    ['2026-10-04', '測試商店', 123], ['2026-10-05', '合成,"商店"', 234], ['2026-10-06', '合成\n,,,\n分店', 345],
  ]);
  await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv: big5, encoding: 'utf-8' }), /編碼/);
  await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv: Uint8Array.of(0xff) }), /編碼/);
  assert.equal((await ledger.listCardStatements()).length, 3);
});

test('三欄任一列形狀或內容不符、銀行標題超出十筆及未加引號千分位，整份拒收', async (t) => {
  const { ledger, card } = await setup(t);
  const invalid = [
    '2026-10-02,合成商店,1,200', '2026-10-02,合成商店', '2026-02-30,合成商店,100',
    '2026-10-02,,100', '2026-10-02,合成商店,1.5', '2026-10-02,合成繳款,-1,200',
    '2026-10-02,"未閉合,100', '2026-10-02,合成商店,9007199254740992', ',,,', '"",,""',
  ];
  for (const bad of invalid) {
    await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv: '2026-10-01,有效但不得留下,50\n' + bad }), /整份檔未匯入/);
    assert.deepEqual(await ledger.listCardStatements(), []);
  }
  const header = '消費日,入帳起息日,摘要,幣別,消費地金額,外幣折算日,消費地,末四碼,新臺幣金額';
  await assert.rejects(ledger.importCardStatement({ accountId: card.id,
    csv: [...Array.from({ length: 10 }, () => '合成說明'), header, '2026-10-01,,合成商店,TWD,0,,TW,1234,100'].join('\n') }), /整份檔未匯入/);
  await assert.rejects(ledger.importCardStatement({ accountId: card.id,
    csv: header + '\n2026-10-01,,合成繳款,TWD,0,,TW,1234,-1,200' }), /千分位/);
  assert.deepEqual(await ledger.listCardStatements(), []);
});

test('僅信用卡可收帳單，停用或未知帳戶拒收；已結月份混在開放月份時整批回滾', async (t) => {
  const { ledger, card } = await setup(t);
  const cash = (await ledger.listAccounts()).find((a) => a.kind === 'cash')!;
  const csv = '2026-10-01,合成商店,100';
  await assert.rejects(ledger.importCardStatement({ accountId: cash.id, csv }), /信用卡帳戶/);
  await assert.rejects(ledger.importCardStatement({ accountId: 9876, csv }), /找不到/);
  await ledger.updateAccount(card.id, { active: false });
  await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv }), /停用/);
  await ledger.updateAccount(card.id, { active: true });
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), version: 1,
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 0, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-11T04:00:00Z', actor: 'test' }],
  }));
  const before = await ledger.exportFinanceDocument();
  await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv: csv + '\n2026-09-01,已結不得寫入,80' }), /已結月份/);
  assert.deepEqual(await ledger.listCardStatements(), []);
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('兩張卡不能互相抵銷，停用卡舊支出仍核對；收入、轉帳、別月都不參與', async (t) => {
  const { ledger, card } = await setup(t);
  const second = await ledger.addAccount({ name: '合成另一張卡', kind: 'credit_card' });
  const categories = await ledger.listCategories();
  const expense = categories.find((c) => c.flow === 'expense')!;
  const income = categories.find((c) => c.flow === 'income')!;
  await ledger.addTransaction({ date: '2026-10-02', categoryId: expense.id, accountId: card.id, flow: 'expense', amount: 100 });
  await ledger.importCardStatement({ accountId: second.id, csv: '2026-10-02,合成商店,100' });
  await ledger.addTransaction({ date: '2026-10-02', categoryId: income.id, accountId: second.id, flow: 'income', amount: 100 });
  await ledger.addTransfer({ date: '2026-10-02', fromAccountId: card.id, toAccountId: second.id, amount: 100 });
  await ledger.addTransaction({ date: '2026-11-02', categoryId: expense.id, accountId: card.id, flow: 'expense', amount: 100 });
  await ledger.updateAccount(card.id, { active: false });
  const result = await ledger.getCardReconciliation('2026-10');
  assert.equal(result.matched, false);
  assert.deepEqual(result.mismatches.map((r) => [r.accountId, r.transactionCount, r.statementCount]), [[card.id, 1, 0], [second.id, 0, 1]]);
  await assert.rejects(ledger.getCardReconciliation('2026-13'), /月份格式/);
});

test('沒有信用卡帳戶可略過核對，免費匯入不改交易與月結數字，月結仍須付費權益', async (t) => {
  const { ledger } = await setup(t);
  await ledger.importLegacyLedger({ openingDate: '2026-10-01', accounts: [{ name: '合成現金', kind: 'cash', openingBalance: 0 }],
    categories: [{ name: '合成支出', flow: 'expense' }], members: [], transactions: [], document: serializeBudgetDocument(emptyBudgetState()) });
  assert.deepEqual(await ledger.getCardReconciliation('2026-10'), { month: '2026-10', matched: true, hasCards: false, cards: [], mismatches: [] });
  const card = await ledger.addAccount({ name: '合成新卡', kind: 'credit_card' });
  const document = await ledger.exportFinanceDocument();
  const balances = await ledger.listAccountBalances();
  await ledger.importCardStatement({ accountId: card.id, csv: '2026-10-02,合成商店,100' });
  assert.equal(await ledger.exportFinanceDocument(), document);
  assert.deepEqual(await ledger.listAccountBalances(), balances);
  assert.deepEqual(await ledger.listTransactions('2026-01-01', '2026-12-31'), []);
  await assert.rejects(ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: false }), /付費權益/);
});

test('同日同額只比該月該卡的支出筆數；帳單多一筆含單邊列都拒絕月結，不能繞過精靈', async (t) => {
  const { ledger, card } = await setup(t);
  await ledger.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(), version: 1,
    categories: [{ id: 'food', name: '飲食', kind: 'actual' }],
    revisions: [{ id: 'caps', month: '2026-10', tuition: 0, limits: [{ categoryId: 'food', amount: 0 }],
      mapping: { 飲食: 'food' }, reason: '合成上限', actor: 'test', time: '2026-11-11T04:00:00Z' }],
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 1000, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-11T04:00:00Z', actor: 'test' }],
  }));
  const expense = (await ledger.listCategories()).find((c) => c.name === '飲食')!;
  for (let i = 0; i < 2; i++) await ledger.addTransaction({ date: '2026-10-02', categoryId: expense.id, accountId: card.id, flow: 'expense', amount: 100 });
  const csv = '2026-10-02,不須配對店家,100\n2026-10-02,另一家,100';
  await ledger.importCardStatement({ accountId: card.id, csv });
  assert.equal((await ledger.getCardReconciliation('2026-10')).matched, true);
  const request = { month: '2026-10', hasEntitlement: true };
  const preview = await ledger.previewMonthlyClose(request);
  const assets = await ledger.previewAssetCheck(request);
  const bank = assets.accounts.find((a) => a.kind === 'bank')!;
  const balances = [{ accountId: bank.accountId, balance: bank.appBalance - assets.difference }];
  const balanced = await ledger.previewAssetCheck({ ...request, balances });
  const check = await ledger.recordAssetCheck({ ...request, balances, checkToken: balanced.checkToken, operationId: randomUUID() });
  await ledger.importCardStatement({ accountId: card.id, csv: csv + '\n2026-10-02,第三家,100\n2026-10-03,只有帳單,90' });
  const result = await ledger.getCardReconciliation('2026-10');
  assert.deepEqual(result.mismatches, [
    { accountId: card.id, account: card.name, date: '2026-10-02', amount: 100, transactionCount: 2, statementCount: 3 },
    { accountId: card.id, account: card.name, date: '2026-10-03', amount: 90, transactionCount: 0, statementCount: 1 },
  ]);
  await assert.rejects(ledger.previewMonthlyClose(request), /帳單.*筆數/);
  await assert.rejects(ledger.completeMonthlyClose({ ...request, version: preview.version, previewToken: preview.previewToken,
    assetCheckId: check.id, operationId: randomUUID() }), /帳單.*筆數/);
  await assert.rejects(ledger.runBudgetCommand({ action: 'close', month: '2026-10', amount: 0,
    version: (await ledger.getBudgetStatus()).version, operationId: randomUUID(), reason: '不可繞過' }), /帳單.*筆數/);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
});

test('卡帳單核平後可保存總資產核對並完成月結，八項數字不變、重送不重做、已結帳單鎖定', async (t) => {
  const { ledger, card } = await setup(t);
  await ledger.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(), version: 1,
    categories: [{ id: 'food', name: '飲食', kind: 'actual' }],
    revisions: [{ id: 'caps', month: '2026-10', tuition: 0, limits: [{ categoryId: 'food', amount: 0 }],
      mapping: { 飲食: 'food' }, reason: '合成上限', actor: 'test', time: '2026-11-11T04:00:00Z' }],
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 0, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-11T04:00:00Z', actor: 'test' }],
  }));
  const expense = (await ledger.listCategories()).find((c) => c.name === '飲食')!;
  await ledger.addTransaction({ date: '2026-10-02', categoryId: expense.id, accountId: card.id, flow: 'expense', amount: 100 });
  await ledger.importCardStatement({ accountId: card.id, csv: '2026-10-02,合成商店,100' });
  const input = { month: '2026-10', hasEntitlement: true };
  const assets = await ledger.previewAssetCheck(input);
  assert.equal(assets.difference, 0);
  const record = await ledger.recordAssetCheck({ ...input, checkToken: assets.checkToken, operationId: randomUUID() });
  const preview = await ledger.previewMonthlyClose(input);
  const request = { ...input, version: preview.version, previewToken: preview.previewToken, assetCheckId: record.id, operationId: randomUUID() };
  assert.equal((await ledger.completeMonthlyClose(request)).replayed, false);
  const snapshot = await ledger.getMonthlyCloseSnapshot('2026-10');
  assert.deepEqual([snapshot.summary.income, snapshot.summary.surplus, snapshot.summary.spare, snapshot.summary.tuition,
    snapshot.summary.reserve, snapshot.summary.total], [0, -100, -100, 0, 0, -100]);
  assert.deepEqual(snapshot.summary.reserves, []);
  assert.deepEqual(snapshot.calculation.capSnapshot?.limits, [{ categoryId: 'food', amount: 0 }]);
  assert.equal((await ledger.completeMonthlyClose(request)).replayed, true);
  assert.deepEqual(await ledger.getMonthlyCloseSnapshot('2026-10'), snapshot);
  await assert.rejects(ledger.importCardStatement({ accountId: card.id, csv: '2026-10-02,合成商店,100' }), /已結月份/);
});
