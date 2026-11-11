// 所有資料均為虛構；只透過帳本服務操作真正的 SQLite。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type Ledger, type CompleteOnboardingInput } from './index.ts';
const NOW = new Date('2026-11-11T04:00:00Z');
async function setup(t: TestContext, now: () => Date = () => NOW) {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now });
  t.after(() => ledger.close());
  return ledger;
}
async function opening(ledger: Ledger, openingDate = '2026-11-01'): Promise<CompleteOnboardingInput> {
  return { openingDate, openingDeployed: 0,
    accounts: (await ledger.listAccounts()).map((a) => ({ id: a.id, openingBalance: 0 })),
    budgets: (await ledger.getOpeningBudgetSuggestions({ monthlyIncome: 30000 })).rows.map((r) => ({ categoryId: r.categoryId, kind: r.kind, amount: r.amount })),
  };
}
// 核對值直接來自合成帳戶與交易，不調整銀行餘額去掩蓋帳面差額。
async function readyToClose(ledger: Ledger, month = '2026-11') {
  const request = { month, hasEntitlement: true };
  const check = await ledger.previewAssetCheck(request);
  assert.equal(check.difference, 0);
  assert.equal(check.canComplete, true);
  const record = await ledger.recordAssetCheck({ ...request, checkToken: check.checkToken, operationId: randomUUID() });
  // 保存核對會增加文件版本，完成月結必須重新取得相符的預覽。
  return { ...await ledger.previewMonthlyClose(request), ...request, assetCheckId: record.id, operationId: randomUUID() };
}
test('新帳本提供本月與上月；查詢建議不會完成開帳', async (t) => {
  const ledger = await setup(t);
  assert.deepEqual(await ledger.getOnboardingStatus(), { completed: false, openingDate: null, currentMonth: '2026-11', previousMonth: '2026-10', openingDeployed: 0 });
  await ledger.getOpeningBudgetSuggestions({ monthlyIncome: 30000 });
  assert.equal(await ledger.getOpeningDate(), null);
  assert.deepEqual(await ledger.listBudgetRevisions(), []);
});
test('沒有歷史資料依收入比例縮放、同名預設分組、照實支沒有上限', async (t) => {
  const ledger = await setup(t);
  const low = await ledger.getOpeningBudgetSuggestions({ monthlyIncome: 20000 });
  const high = await ledger.getOpeningBudgetSuggestions({ monthlyIncome: 40000 });
  assert.equal(low.source, 'income');
  assert.deepEqual(low.months, []);
  assert.equal(low.rows.find((r) => r.name === '飲食')!.amount, 4000);
  assert.equal(high.rows.find((r) => r.name === '飲食')!.amount, 8000);
  assert.equal(low.rows.find((r) => r.name === '電話網路')!.kind, 'fixed');
  assert.equal(low.rows.find((r) => r.name === '水電瓦斯')!.kind, 'actual');
  assert.equal(low.rows.find((r) => r.name === '水電瓦斯')!.amount, 0);
  await assert.rejects(ledger.getOpeningBudgetSuggestions({ monthlyIncome: -1 }), /收入/);
  await assert.rejects(ledger.getOpeningBudgetSuggestions({ monthlyIncome: 0.5 }), /收入/);
});
test('先明確建立收入及支出分類再匯入歷史 CSV；沿用拒收與數量式去重', async (t) => {
  const ledger = await setup(t);
  const csv = '日期,類別,金額,收支別\n2026-08-03,寵物,101,支出\n2026-08-04,獎金,1000,收入';
  assert.equal((await ledger.importTransactionsCsv(csv)).rejectedRows, 2);
  await ledger.addOpeningCategory({ name: '寵物', flow: 'expense' });
  await ledger.addOpeningCategory({ name: '獎金', flow: 'income' });
  assert.equal((await ledger.importTransactionsCsv(csv)).addedRows, 2);
  assert.equal((await ledger.importTransactionsCsv(csv)).skippedRows, 2);
  const suggestion = await ledger.getOpeningBudgetSuggestions();
  assert.equal(suggestion.rows.find((r) => r.name === '寵物')!.kind, 'actual');
  assert.equal(suggestion.rows.some((r) => r.name === '獎金'), false);
  await assert.rejects(ledger.addOpeningCategory({ name: '薪資', flow: 'expense' }), /名稱/);
});
test('近三完整月平均進位百元，缺支出算零、排除本月與收入', async (t) => {
  const ledger = await setup(t);
  await ledger.importTransactionsCsv('日期,類別,金額,收支別\n2026-07-01,飲食,9999,支出\n2026-08-01,飲食,101,支出\n2026-09-01,薪資,8000,收入\n2026-10-01,飲食,500,支出\n2026-11-01,飲食,9999,支出');
  const s = await ledger.getOpeningBudgetSuggestions();
  assert.equal(s.source, 'history');
  assert.deepEqual(s.months, ['2026-08', '2026-09', '2026-10']);
  assert.equal(s.rows.find((r) => r.name === '飲食')!.amount, 300);
  assert.equal(s.rows.find((r) => r.name === '娛樂')!.amount, 0);
});
test('不足三完整月使用現有期間；只有本月資料回退收入比例', async (t) => {
  const ledger = await setup(t);
  await ledger.importTransactionsCsv('日期,類別,金額\n2026-11-01,飲食,999');
  assert.equal((await ledger.getOpeningBudgetSuggestions({ monthlyIncome: 10000 })).source, 'income');
  await ledger.importTransactionsCsv('日期,類別,金額\n2026-10-01,飲食,101');
  const s = await ledger.getOpeningBudgetSuggestions();
  assert.deepEqual(s.months, ['2026-10']);
  assert.equal(s.rows.find((r) => r.name === '飲食')!.amount, 200);
});
test('期初加總帳戶及投入額、儲備零；首月保存零差額核對後走精靈', async (t) => {
  let now = NOW;
  const ledger = await setup(t, () => now);
  await ledger.importTransactionsCsv('日期,類別,金額,收支別\n2026-09-01,飲食,9999,支出\n2026-10-01,飲食,8888,支出\n2026-11-01,飲食,120,支出\n2026-11-02,薪資,1000,收入');
  const input = await opening(ledger);
  input.accounts = input.accounts.map((a, i) => ({ ...a, openingBalance: [1000, 5000, -300, 200][i] }));
  input.openingDeployed = 2500;
  input.budgets = input.budgets.map((r) => ({ ...r, kind: 'actual', amount: 0 }));
  await ledger.completeOnboarding(input);
  const b = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual([b.income, b.surplus, b.spare, b.tuition, b.reserve, b.total], [0, 0, 8400, 0, 0, 8400]);
  assert.equal(b.migrated, false);
  assert.equal((await ledger.getOnboardingStatus()).openingDeployed, 2500);
  assert.equal((await ledger.getOnboardingStatus()).completed, true);
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-11');
  assert.equal((await ledger.listAccountBalances()).reduce((sum, a) => sum + a.balance, 0), 6780);
  assert.equal((await ledger.listTransactions('2026-01-01', '2026-12-31')).length, 4);
  assert.equal((await ledger.getMonthlyCloseDraft()).canClose, false);
  now = new Date('2026-12-01T04:00:00Z');
  assert.equal((await ledger.getMonthlyCloseDraft()).canClose, true);
  const request = { month: '2026-11', hasEntitlement: true };
  await assert.rejects(ledger.previewMonthlyClose({ ...request, month: '2026-09' }), /順序|開帳/);
  const preview = await ledger.previewMonthlyClose(request);
  await assert.rejects(ledger.runBudgetCommand({ action: 'close', operationId: randomUUID(), version: preview.version, month: preview.month, reason: '合成直接月結', amount: 1000 }, { hasEntitlement: true }), /月結精靈/);
  await assert.rejects(ledger.completeMonthlyClose({ ...preview, ...request, operationId: randomUUID() }), /請先保存.*總資產核對/);
  assert.equal(await ledger.isMonthClosed('2026-11'), false);
  const confirm = await readyToClose(ledger);
  await ledger.completeMonthlyClose(confirm);
  assert.equal((await ledger.completeMonthlyClose(confirm)).replayed, true);
  assert.equal((await ledger.listAssetChecks('2026-11')).length, 1);
  const c = await ledger.getBudgetMonth('2026-11');
  assert.deepEqual([c.income, c.surplus, c.spare, c.total], [1000, 880, 9280, 9280]);
  await assert.rejects(ledger.completeOnboarding(input), /已.*開帳/);
  assert.equal((await ledger.getBudgetMonth('2026-10')).total, 8400);
});
test('逐項修改後採納；從上月開帳只建前月基準、不補結歷史', async (t) => {
  const ledger = await setup(t);
  const input = await opening(ledger, '2026-10-01');
  const food = (await ledger.listCategories()).find((c) => c.name === '飲食')!;
  input.budgets = input.budgets.map((r) => ({ ...r, kind: r.categoryId === food.id ? 'fixed' : r.kind, amount: r.categoryId === food.id ? 1234 : r.amount }));
  await ledger.completeOnboarding(input);
  const foodBudget = (await ledger.getBudgetProgress('2026-10')).rows.find((r) => r.name === '飲食')!;
  assert.deepEqual([foodBudget.kind, foodBudget.cap], ['fixed', 1234]);
  assert.deepEqual((await ledger.listBudgetMonths()).map((m) => m.month), ['2026-09']);
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-10');
});
test('無效日期、帳戶、分類、上限或溢位整筆拒絕還原，可修正重試', async (t) => {
  const ledger = await setup(t);
  const input = await opening(ledger);
  for (const bad of [
    { ...input, openingDate: '2026-11-02' }, { ...input, openingDate: '2026-09-01' }, { ...input, openingDate: '2026-12-01' },
    { ...input, accounts: input.accounts.slice(1) }, { ...input, accounts: [...input.accounts, input.accounts[0]] },
    { ...input, budgets: input.budgets.slice(1) }, { ...input, openingDeployed: -1 }, { ...input, openingDeployed: 0.5 },
    { ...input, budgets: input.budgets.map((r, i) => i === input.budgets.length - 1 ? { ...r, amount: 1000001 } : r) },
    { ...input, accounts: input.accounts.map((r) => ({ ...r, openingBalance: Number.MAX_SAFE_INTEGER })) },
  ]) {
    await assert.rejects(ledger.completeOnboarding(bad));
    assert.equal(await ledger.getOpeningDate(), null);
    assert.deepEqual(await ledger.listBudgetMonths(), []);
    assert.deepEqual(await ledger.listBudgetRevisions(), []);
    assert.equal((await ledger.listAccounts()).every((a) => a.openingBalance === 0), true);
  }
  await ledger.completeOnboarding(input);
  await assert.rejects(ledger.addOpeningCategory({ name: '開帳後分類', flow: 'expense' }), /已.*開帳/);
});
test('重開服務保留開帳狀態與投入額；舊帳有開帳日也不再開帳', async (t) => {
  const db = openNodeDatabase(':memory:');
  const ledger = await openLedger(db, { now: () => NOW });
  await ledger.completeOnboarding({ ...await opening(ledger), openingDeployed: 345 });
  const reopened = await openLedger(db, { now: () => NOW });
  t.after(() => reopened.close());
  assert.equal((await reopened.getOnboardingStatus()).completed, true);
  assert.equal((await reopened.getOnboardingStatus()).openingDeployed, 345);
  const old = await setup(t);
  await old.importLegacyLedger({ openingDate: '2026-10-01', accounts: [{ name: '合成現金', kind: 'cash', openingBalance: 0 }], categories: [], members: [], transactions: [], document: serializeBudgetDocument(emptyBudgetState()) });
  assert.equal((await old.getOnboardingStatus()).completed, true);
  await assert.rejects(old.completeOnboarding(await opening(ledger)), /已.*開帳/);
});

test('預算已有較晚草稿時給可操作提示且不覆寫；選本月可保留草稿開帳', async (t) => {
  const ledger = await setup(t);
  await ledger.runBudgetCommand({ action: 'add', operationId: randomUUID(), version: 0, month: '2026-11', reason: '合成預算草稿', name: '寵物', kind: 'actual', amount: 0 });
  const input = await opening(ledger, '2026-10-01');
  const before = await ledger.listBudgetRevisions();
  await assert.rejects(ledger.completeOnboarding(input), /草稿.*本月/);
  assert.equal(await ledger.getOpeningDate(), null);
  assert.deepEqual(await ledger.listBudgetRevisions(), before);
  await ledger.completeOnboarding({ ...input, openingDate: '2026-11-01' });
  assert.equal((await ledger.getBudgetProgress()).rows.some((r) => r.name === '寵物'), true);
});

test('期初補入儲備、首月與撤銷重結各自保存零差額核對且守恆', async (t) => {
  let now = NOW;
  const ledger = await setup(t, () => now);
  const input = await opening(ledger);
  input.accounts[0].openingBalance = 5000;
  input.openingDeployed = 2000;
  const food = (await ledger.listCategories()).find((c) => c.name === '飲食')!;
  input.budgets = input.budgets.map((r) => ({ ...r, amount: r.categoryId === food.id ? 500 : 0 }));
  await ledger.completeOnboarding(input);
  async function run(action: 'fund' | 'rollback', fields = {}) {
    const status = await ledger.getBudgetStatus();
    return ledger.runBudgetCommand({ action, operationId: randomUUID(), version: status.version, month: status.latestMonth!, reason: '合成守恆驗證', ...fields }, { hasEntitlement: true });
  }
  const foodId = (await ledger.getBudgetStatus()).categories.find((c) => c.name === '飲食')!.id;
  await run('fund', { to: foodId, amount: 700 });
  await ledger.addTransaction({ date: '2026-11-02', categoryId: food.id, accountId: input.accounts[0].id, flow: 'expense', amount: 200 });
  const salary = (await ledger.listCategories()).find((c) => c.name === '薪資')!;
  await ledger.addTransaction({ date: '2026-11-03', categoryId: salary.id, accountId: input.accounts[0].id, flow: 'income', amount: 1000 });
  now = new Date('2026-12-01T04:00:00Z');
  const firstConfirm = await readyToClose(ledger);
  await ledger.completeMonthlyClose(firstConfirm);
  const first = await ledger.getBudgetMonth('2026-11');
  assert.deepEqual([first.spare, first.reserve, first.total], [6800, 1000, 7800]);
  await run('rollback');
  const freshPreview = await ledger.previewMonthlyClose({ month: '2026-11', hasEntitlement: true });
  await assert.rejects(ledger.completeMonthlyClose({ ...firstConfirm, ...freshPreview, operationId: randomUUID() }), /重新核對/);
  const secondConfirm = await readyToClose(ledger);
  assert.notEqual(secondConfirm.assetCheckId, firstConfirm.assetCheckId);
  await ledger.completeMonthlyClose(secondConfirm);
  assert.equal((await ledger.listAssetChecks('2026-11')).length, 2);
  assert.deepEqual(await ledger.getBudgetMonth('2026-11'), first);
});

test('開帳備份還原及關閉檔案重開皆保留基準、投入額與完成狀態', async (t) => {
  const dir = mkdtempSync(join(process.cwd(), '.onboarding-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'ledger.sqlite');
  const backupFiles = { directory: dir, open: async (file: string) => openNodeDatabase(file), remove: async (file: string) => rmSync(file, { force: true }) };
  const ledger = await openLedger(openNodeDatabase(path), { now: () => NOW, backupFiles });
  await ledger.completeOnboarding({ ...await opening(ledger), openingDeployed: 345 });
  const before = await ledger.getBudgetMonth('2026-10');
  const backupPath = join(dir, 'opening-backup.sqlite');
  await ledger.exportBackup(backupPath);
  await ledger.close();
  const reopened = await openLedger(openNodeDatabase(path), { now: () => NOW, backupFiles });
  t.after(() => reopened.close());
  assert.equal((await reopened.getOnboardingStatus()).completed, true);
  assert.equal((await reopened.getOnboardingStatus()).openingDeployed, 345);
  assert.equal(await reopened.getNetDeployed(), 345);
  await reopened.restoreBackup(backupPath, { allowOlder: true });
  assert.deepEqual(await reopened.getBudgetMonth('2026-10'), before);
  assert.equal((await reopened.getOnboardingStatus()).openingDeployed, 345);
  assert.equal((await reopened.getOnboardingStatus()).completed, true);
  assert.equal(await reopened.getNetDeployed(), 345);
});


test('開帳期初投入額可供投資與核對讀取，既有投資期初優先且不重複加總', async (t) => {
  const ledger = await setup(t);
  await ledger.completeOnboarding({ ...await opening(ledger), openingDeployed: 2500 });
  const before = await ledger.exportFinanceDocument();
  assert.deepEqual(await ledger.getInvestmentOpening(), { asOfMonth: '2026-10', netDeployed: 2500 });
  assert.equal(await ledger.getNetDeployed('2026-11-30'), 2500);
  assert.equal(await ledger.exportFinanceDocument(), before);
  // 投資模組明確保存過的期初（包含零）優先，不把開帳設定再加一次。
  await ledger.setInvestmentOpening({ asOfMonth: '2026-10', netDeployed: 0 }, { hasEntitlement: true });
  assert.equal(await ledger.getNetDeployed(), 0);
  await ledger.setInvestmentOpening({ asOfMonth: '2026-10', netDeployed: 3000 }, { hasEntitlement: true });
  assert.deepEqual(await ledger.getInvestmentOpening(), { asOfMonth: '2026-10', netDeployed: 3000 });
  assert.equal(await ledger.getNetDeployed(), 3000);
});
