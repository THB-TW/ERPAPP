// 票 13：只用合成帳本，經帳本服務搭配真 SQLite 驗證。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type Ledger } from './index.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
async function setup(t: TestContext, openingDate = '2026-10-01', amounts = [1000, 10000, -2000, 100]): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  await ledger.importLegacyLedger({
    openingDate,
    accounts: [
      { name: '現金', kind: 'cash', openingBalance: amounts[0] },
      { name: '銀行', kind: 'bank', openingBalance: amounts[1] },
      { name: '信用卡', kind: 'credit_card', openingBalance: amounts[2] },
      { name: '電子支付', kind: 'e_wallet', openingBalance: amounts[3] },
    ],
    categories: [{ name: '飲食', flow: 'expense' }, { name: '薪資', flow: 'income' }],
    members: [], transactions: [],
    document: serializeBudgetDocument({
      ...emptyBudgetState(), version: 1,
      categories: [{ id: 'food', name: '飲食', kind: 'actual' }],
      revisions: [{ id: 'caps', month: '2026-10', limits: [{ categoryId: 'food', amount: 0 }],
        mapping: { 飲食: 'food' }, tuition: 0, reason: '合成上限', actor: 'test', time: NOW.toISOString() }],
      months: [{ id: 'base', month: '2026-09', income: 0, surplus: 0, rawSpare: amounts.reduce((sum, n) => sum + n, 0), tuition: 0,
        balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
        legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }],
    }),
  });
  return ledger;
}
const request = { month: '2026-10', hasEntitlement: true };

test('核對預設今天，倒回各帳戶收支與雙向轉帳，四種帳戶的月底合計相等', async (t) => {
  const ledger = await setup(t);
  await ledger.addTransaction({ date: '2026-11-01', categoryId: 2, accountId: 2, flow: 'income', amount: 500 });
  await ledger.addTransaction({ date: '2026-11-02', categoryId: 1, accountId: 1, flow: 'expense', amount: 100 });
  await ledger.addTransfer({ date: '2026-11-03', fromAccountId: 2, toAccountId: 1, amount: 200 });
  await ledger.addTransfer({ date: '2026-11-04', fromAccountId: 2, toAccountId: 3, amount: 300 });
  await ledger.addTransfer({ date: '2026-11-05', fromAccountId: 1, toAccountId: 4, amount: 50 });
  const before = await ledger.exportFinanceDocument();
  const result = await ledger.previewAssetCheck(request);
  assert.deepEqual([result.asOf, result.minDate, result.maxDate], ['2026-11-11', '2026-10-31', '2026-11-11']);
  assert.deepEqual(result.accounts.map((a) => [a.editable, a.appBalance, a.rollback, a.monthEndBalance, a.difference]), [
    [false, 1050, -50, 1000, 0], [true, 10000, 0, 10000, 0],
    [false, -1700, -300, -2000, 0], [true, 150, -50, 100, 0],
  ]);
  assert.deepEqual([result.rawTotal, result.rollbackTotal, result.actualTotal, result.bookTotal, result.netDeployed, result.difference, result.canComplete],
    [9500, -400, 9100, 9100, 0, 0, true]);
  assert.deepEqual(result.accounts[1].movements.map((m) => [m.kind, m.adjustment]), [['income', -500], ['transfer_out', 200], ['transfer_out', 300]]);
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('保存差額與實際輸入，核對不改月結數字；同操作重送只留原紀錄', async (t) => {
  const ledger = await setup(t);
  const before = await ledger.previewMonthlyClose(request);
  const input = { ...request, asOf: '2026-10-31', balances: [{ accountId: 2, balance: 9900 }] };
  const preview = await ledger.previewAssetCheck(input);
  const save = { ...input, operationId: randomUUID(), checkToken: preview.checkToken };
  const record = await ledger.recordAssetCheck(save);
  assert.equal(record.time, NOW.toISOString());
  assert.equal(record.storedVersion, 2);
  assert.equal(record.result.difference, -100);
  assert.equal(record.result.accounts[1].difference, -100);
  assert.equal(record.result.canComplete, false);
  assert.deepEqual(await ledger.recordAssetCheck(save), record);
  assert.deepEqual(await ledger.listAssetChecks('2026-10'), [record]);
  assert.deepEqual((await ledger.previewMonthlyClose(request)).summary, before.summary);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, NOW.toISOString());
  await assert.rejects(ledger.recordAssetCheck({ ...save, balances: [{ accountId: 2, balance: 9800 }] }), /識別碼/);
  await ledger.addTransaction({ date: '2026-11-01', categoryId: 2, accountId: 2, flow: 'income', amount: 500 });
  assert.deepEqual(await ledger.recordAssetCheck(save), record);
  assert.deepEqual(await ledger.listAssetChecks(), [record]);
});

async function savedCheck(ledger: Ledger, balances?: { accountId: number; balance: number }[]) {
  const input = { ...request, balances };
  const preview = await ledger.previewAssetCheck(input);
  return ledger.recordAssetCheck({ ...input, operationId: randomUUID(), checkToken: preview.checkToken });
}
async function closeRequest(ledger: Ledger, assetCheckId?: string) {
  return { ...await ledger.previewMonthlyClose(request), hasEntitlement: true, operationId: randomUUID(), assetCheckId };
}

test('完成入口不可略過核對，有差額不能完成；相等且明確確認才鎖定，重送不重做', async (t) => {
  const ledger = await setup(t);
  await assert.rejects(ledger.completeMonthlyClose(await closeRequest(ledger)), /核對/);
  const mismatch = await savedCheck(ledger, [{ accountId: 2, balance: 9900 }]);
  await assert.rejects(ledger.completeMonthlyClose(await closeRequest(ledger, mismatch.id)), /差額/);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
  const check = await savedCheck(ledger);
  const confirm = await closeRequest(ledger, check.id);
  assert.deepEqual(await ledger.completeMonthlyClose(confirm), { version: 4, replayed: false });
  assert.deepEqual(await ledger.completeMonthlyClose(confirm), { version: 4, replayed: true });
  assert.equal((await ledger.listAssetChecks()).length, 2);
  assert.equal((await ledger.getBudgetMonth('2026-10')).total, 9100);
  await assert.rejects(ledger.completeMonthlyClose({ ...confirm, assetCheckId: mismatch.id }), /識別碼/);
});

test('餘額日期限月底到台北今天，月底早於開帳日仍可核對且不倒回開帳前交易', async (t) => {
  const ledger = await setup(t, '2026-11-01');
  await ledger.addTransaction({ date: '2026-10-31', categoryId: 1, accountId: 1, flow: 'expense', amount: 777 });
  for (const asOf of ['2026-10-30', '2026-11-12', '2026-02-30', '2026-1-31']) {
    await assert.rejects(ledger.previewAssetCheck({ ...request, asOf }), /餘額日期/);
  }
  const end = await ledger.previewAssetCheck({ ...request, asOf: '2026-10-31' });
  assert.deepEqual(end.accounts.map((a) => a.monthEndBalance), [1000, 10000, -2000, 100]);
  assert.deepEqual(end.accounts.flatMap((a) => a.movements), []);
  assert.equal(end.actualTotal, 9100);
});

test('App 付費預算指令不能繞過總資產核對直接月結', async (t) => {
  const ledger = await setup(t);
  await assert.rejects(ledger.runBudgetCommand({ action: 'close', month: '2026-10', version: 1,
    operationId: randomUUID(), amount: 0, reason: '嘗試略過核對' }, { hasEntitlement: true }), /月結精靈|核對/);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
});

test('銀行與電子支付可填負整數；現金信用卡、未知或重複帳戶與無效金額被拒', async (t) => {
  const ledger = await setup(t);
  const result = await ledger.previewAssetCheck({ ...request, balances: [{ accountId: 2, balance: -100 }, { accountId: 4, balance: -50 }] });
  assert.deepEqual([result.actualTotal, result.difference], [-1150, -10250]);
  for (const accountId of [1, 3]) await assert.rejects(ledger.previewAssetCheck({ ...request, balances: [{ accountId, balance: 0 }] }), /不能手動修改/);
  await assert.rejects(ledger.previewAssetCheck({ ...request, balances: [{ accountId: 999, balance: 0 }] }), /找不到/);
  await assert.rejects(ledger.previewAssetCheck({ ...request, balances: [{ accountId: 2, balance: 0 }, { accountId: 2, balance: 1 }] }), /兩次/);
  for (const balance of [NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(ledger.previewAssetCheck({ ...request, balances: [{ accountId: 2, balance }] }), /整數/);
  }
});

test('權益到期拒絕核對寫入與預覽，已保存核對紀錄仍可免費查詢', async (t) => {
  const ledger = await setup(t);
  const record = await savedCheck(ledger);
  const before = await ledger.exportFinanceDocument();
  await assert.rejects(ledger.previewAssetCheck({ ...request, hasEntitlement: false }), /付費權益/);
  await assert.rejects(ledger.recordAssetCheck({ ...request, hasEntitlement: false, operationId: randomUUID(), checkToken: record.result.checkToken }), /付費權益/);
  assert.deepEqual(await ledger.listAssetChecks(), [record]);
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('核對預覽後交易變更拒絕保存，沒有半筆紀錄或文件版本異動', async (t) => {
  const ledger = await setup(t);
  const preview = await ledger.previewAssetCheck(request);
  await ledger.addTransfer({ date: '2026-11-01', fromAccountId: 2, toAccountId: 3, amount: 100 });
  const before = await ledger.exportFinanceDocument();
  await assert.rejects(ledger.recordAssetCheck({ ...request, checkToken: preview.checkToken, operationId: randomUUID() }), /重新核對/);
  assert.deepEqual(await ledger.listAssetChecks(), []);
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('保存零差額後新增收支或轉帳、修改帳戶或預算，舊核對都不能完成', async (t) => {
  const mutations: ((ledger: Ledger) => Promise<unknown>)[] = [
    (ledger) => ledger.addTransaction({ date: '2026-11-01', categoryId: 2, accountId: 2, flow: 'income', amount: 100 }),
    (ledger) => ledger.addTransfer({ date: '2026-11-01', fromAccountId: 2, toAccountId: 1, amount: 100 }),
    (ledger) => ledger.updateAccount(2, { openingBalance: 10001 }),
    async (ledger) => ledger.runBudgetCommand({ action: 'caps', month: '2026-10', version: (await ledger.getBudgetStatus()).version,
      operationId: randomUUID(), limits: [{ categoryId: 'food', amount: 0 }], reason: '同額新上限' }),
  ];
  for (const mutate of mutations) {
    const ledger = await setup(t);
    const record = await savedCheck(ledger);
    await mutate(ledger);
    await assert.rejects(ledger.completeMonthlyClose(await closeRequest(ledger, record.id)), /重新核對/);
    assert.equal(await ledger.isMonthClosed('2026-10'), false);
    assert.deepEqual(await ledger.listAssetChecks(), [record]);
  }
});

test('倒回只含月底後至指定日期，停用帳戶仍納入且之後更正不改寫紀錄', async (t) => {
  const ledger = await setup(t);
  await ledger.addTransaction({ date: '2026-11-01', categoryId: 1, accountId: 2, flow: 'expense', amount: 100 });
  await ledger.addTransaction({ date: '2026-11-03', categoryId: 2, accountId: 2, flow: 'income', amount: 200 });
  await ledger.addTransfer({ date: '2026-11-04', fromAccountId: 2, toAccountId: 4, amount: 50 });
  await ledger.updateAccount(2, { active: false });
  const input = { ...request, asOf: '2026-11-02' };
  const preview = await ledger.previewAssetCheck(input);
  assert.deepEqual([preview.accounts[1].appBalance, preview.accounts[1].rollback, preview.accounts[1].monthEndBalance], [9900, 100, 10000]);
  assert.equal(preview.accounts[1].movements.length, 1);
  const record = await ledger.recordAssetCheck({ ...input, checkToken: preview.checkToken, operationId: randomUUID() });
  await ledger.runBudgetCommand({ action: 'correct', month: '2026-10', amount: -100, version: record.storedVersion,
    operationId: randomUUID(), reason: '合成前期更正' });
  assert.deepEqual(await ledger.listAssetChecks(), [record]);
});

test('舊系統核對案例數字：輸入合計 285633、倒回 334，月底實際合計 285967', async (t) => {
  // 信用卡正餘額代表合成的預繳款；不採用任何私人帳本或原始 CSV。
  const ledger = await setup(t, '2026-10-01', [2556, 278269, 5027, 115]);
  await ledger.addTransaction({ date: '2026-11-06', categoryId: 1, accountId: 2, flow: 'expense', amount: 334 });
  const input = { ...request, asOf: '2026-11-06' };
  const preview = await ledger.previewAssetCheck(input);
  assert.deepEqual(preview.accounts.map((a) => a.inputBalance), [2556, 277935, 5027, 115]);
  assert.deepEqual([preview.rawTotal, preview.rollbackTotal, preview.actualTotal, preview.bookTotal, preview.difference], [285633, 334, 285967, 285967, 0]);
  const save = { ...input, operationId: randomUUID(), checkToken: preview.checkToken };
  const record = await ledger.recordAssetCheck(save);
  assert.deepEqual(await ledger.recordAssetCheck(save), record);
  assert.equal((await ledger.listAssetChecks()).length, 1);
});
