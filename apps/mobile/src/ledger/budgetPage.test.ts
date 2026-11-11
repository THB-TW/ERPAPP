// 所有資料皆為合成資料；只透過帳本服務驗證預算頁與設定。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetCommand, BudgetState } from '../calc/budgetTypes.ts';
import { openLedger, type Ledger } from './index.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
function fixture(withBaseline = false): BudgetState {
  const state = emptyBudgetState();
  state.categories = [
    { id: 'food', name: '飲食', kind: 'reserve' },
    { id: 'phone', name: '電話網路', kind: 'fixed' },
    { id: 'water', name: '水電瓦斯', kind: 'actual' },
  ];
  state.revisions = [{
    id: 'original', month: '2026-10', tuition: 50,
    limits: [{ categoryId: 'food', amount: 1000 }, { categoryId: 'phone', amount: 200 }, { categoryId: 'water', amount: 0 }],
    mapping: { 飲食: 'food', 電話網路: 'phone', 水電瓦斯: 'water', 交通: 'food' },
    reason: '合成開帳上限', actor: 'test', time: NOW.toISOString(),
  }];
  if (withBaseline) state.months = [{
    id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 5000, tuition: 0,
    balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
    legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test',
  }];
  return state;
}
async function setup(t: TestContext, baseline = false): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  await ledger.importLegacyLedger({
    openingDate: '2026-10-01', accounts: [{ name: '測試銀行', kind: 'bank', openingBalance: 5000 }],
    categories: [
      { name: '飲食', flow: 'expense' }, { name: '電話網路', flow: 'expense' },
      { name: '水電瓦斯', flow: 'expense' }, { name: '交通', flow: 'expense' },
      { name: '未歸屬', flow: 'expense' }, { name: '薪資', flow: 'income' },
    ], members: [], transactions: [], document: serializeBudgetDocument(fixture(baseline)),
  });
  return ledger;
}
async function command(ledger: Ledger, fields: Partial<BudgetCommand> & { action: string }): Promise<BudgetCommand> {
  const status = await ledger.getBudgetStatus();
  return { operationId: randomUUID(), version: status.version, month: status.openMonth, reason: '合成調整原因', ...fields };
}
async function spend(ledger: Ledger, category: string, amount: number, date = '2026-11-01') {
  const c = (await ledger.listCategories()).find((c) => c.name === category)!;
  const a = (await ledger.listAccounts())[0];
  return ledger.addTransaction({ date, categoryId: c.id, accountId: a.id, flow: c.flow, amount });
}

test('未月結的開放月份採開帳月；查詢與指令一致，跨日曆月份仍可改開帳月', async (t) => {
  const ledger = await setup(t);
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-10');
  const c = await command(ledger, { action: 'caps', limits: fixture().revisions[0].limits, tuition: 75 });
  await ledger.runBudgetCommand(c);
  assert.equal((await ledger.getBudgetStatus()).currentRevision!.tuition, 75);
  await assert.rejects(ledger.runBudgetCommand(await command(ledger, { action: 'caps', month: '2026-11', limits: c.limits })), /開放月份/);
});

test('本月進度依有效歸屬加總三組，只計當月支出；照實支無上限，未歸屬仍列出', async (t) => {
  const ledger = await setup(t);
  await spend(ledger, '飲食', 900);
  await spend(ledger, '交通', 150);
  await spend(ledger, '電話網路', 80);
  await spend(ledger, '水電瓦斯', 60);
  await spend(ledger, '未歸屬', 20);
  await spend(ledger, '薪資', 9999);
  await spend(ledger, '飲食', 999, '2026-10-31');
  const view = await ledger.getBudgetProgress();
  assert.equal(view.month, '2026-11');
  assert.equal(view.openMonth, '2026-10');
  assert.deepEqual(view.rows.map((r) => [r.kind, r.cap, r.spent, r.remaining]), [
    ['reserve', 1000, 1050, -50], ['fixed', 200, 80, 120], ['actual', null, 60, null],
  ]);
  assert.deepEqual(view.unmapped.map((r) => [r.name, r.spent]), [['未歸屬', 20]]);
  assert.equal(view.totalSpent, 1210);
  assert.equal(view.totalCap, 1200);
  assert.equal((await ledger.getBudgetProgress('2026-10')).rows[0].spent, 999);
  await assert.rejects(ledger.getBudgetProgress('2026-1'), /月份/);
});

test('新帳本沒有預算時仍能顯示未歸屬實支，不捏造上限', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  await spend(ledger, '飲食', 35);
  const view = await ledger.getBudgetProgress();
  assert.deepEqual(view.rows, []);
  assert.equal(view.unmapped[0].spent, 35);
  assert.equal(view.totalSpent, 35);
});

test('預覽不寫入；確認後完整上限版本保留，重送不重做且異內容重送拒絕', async (t) => {
  const ledger = await setup(t);
  const before = await ledger.listBudgetRevisions();
  const c = await command(ledger, { action: 'edit', from: 'food', name: '飲食', kind: 'reserve', amount: 1200 });
  const preview = await ledger.previewBudgetCommand(c);
  assert.equal(preview.before.currentRevision!.limits[0].amount, 1000);
  assert.equal(preview.after.currentRevision!.limits[0].amount, 1200);
  assert.deepEqual(await ledger.listBudgetRevisions(), before);
  assert.equal((await ledger.getBudgetStatus()).version, c.version);
  await ledger.runBudgetCommand(c);
  const revisions = await ledger.listBudgetRevisions();
  assert.equal(revisions.length, before.length + 1);
  assert.equal(revisions.at(-1)!.limits.length, 3);
  assert.equal(revisions.at(-1)!.reason, c.reason);
  assert.equal((await ledger.runBudgetCommand(c)).replayed, true);
  await assert.rejects(ledger.runBudgetCommand({ ...c, kind: 'fixed' }), /其他內容/);
});

test('設定驗證原因、金額、組別、名稱與過期版本，拒絕時不留半套資料', async (t) => {
  const ledger = await setup(t);
  for (const fields of [
    { reason: '' }, { reason: '字'.repeat(301) }, { amount: -1 }, { amount: 1_000_001 },
    { amount: 1.5 }, { kind: 'unknown' }, { name: '薪資' }, { name: '電話網路' }, { name: ' ' },
    { name: '字'.repeat(31) }, { version: -1 }, { from: 'unknown' },
  ]) {
    const c = await command(ledger, { action: 'edit', from: 'food', name: '改名測試', kind: 'reserve', amount: 100, ...fields });
    await assert.rejects(ledger.previewBudgetCommand(c));
    await assert.rejects(ledger.runBudgetCommand(c));
  }
  assert.equal((await ledger.getBudgetStatus()).version, 0);
  assert.equal((await ledger.listBudgetRevisions()).length, 1);
  assert.ok((await ledger.listCategories()).some((c) => c.name === '飲食'));
});

test('新增分類預設照實支，可立即記帳；改歸屬保留原交易分類', async (t) => {
  const ledger = await setup(t);
  const add = await command(ledger, { action: 'add', name: '測試出遊' });
  await ledger.runBudgetCommand(add);
  assert.equal((await ledger.getBudgetStatus()).categories.find((c) => c.id === add.operationId)!.kind, 'actual');
  await spend(ledger, '測試出遊', 45);
  await ledger.runBudgetCommand(await command(ledger, { action: 'map', sourceCategory: '未歸屬', to: 'phone' }));
  await spend(ledger, '未歸屬', 25);
  assert.equal((await ledger.getBudgetProgress()).rows.find((r) => r.categoryId === 'phone')!.spent, 25);
  assert.equal((await ledger.getDayTransactions('2026-11-01')).at(-1)!.categoryName, '未歸屬');
});

test('更名保留已結交易名稱與快照，未結交易轉用新名稱，撤銷重結八項數字不變', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 1000, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  const original = await ledger.getBudgetMonth('2026-10');
  const historical = await ledger.getDayTransactions('2026-10-10');
  await spend(ledger, '飲食', 80);
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '餐飲', kind: 'reserve', amount: 1500 }));
  assert.deepEqual(await ledger.getDayTransactions('2026-10-10'), historical);
  assert.equal((await ledger.getDayTransactions('2026-11-01'))[0].categoryName, '餐飲');
  assert.ok(!(await ledger.listCategories()).some((c) => c.name === '飲食'));
  assert.equal((await ledger.getBudgetProgress()).rows[0].spent, 80);
  const after = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual(after.capSnapshot, original.capSnapshot);
  assert.deepEqual(await ledger.listBudgetMonths(), [{
    month: '2026-09', income: 0, surplus: 0, spare: 5000, tuition: 0, reserve: 0, total: 5000, migrated: true,
  }, { month: '2026-10', income: 3000, surplus: 1950, spare: 6950, tuition: 50, reserve: 0, total: 7000, migrated: false }]);
  await ledger.runBudgetCommand(await command(ledger, { action: 'rollback', month: '2026-10' }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  const reclosed = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual([reclosed.income, reclosed.surplus, reclosed.spare, reclosed.tuition, reclosed.reserve, reclosed.total, reclosed.capSnapshot],
    [original.income, original.surplus, original.spare, original.tuition, original.reserve, original.total, original.capSnapshot]);
  assert.deepEqual(reclosed.reserves.map((r) => [r.categoryId, r.balance]), original.reserves.map((r) => [r.categoryId, r.balance]));
});

test('改組建立新定義而不改舊組別，舊月撤銷重結仍用原規則', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 1000, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  const before = await ledger.getBudgetMonth('2026-10');
  const edit = await command(ledger, { action: 'edit', from: 'food', name: '飲食', kind: 'fixed', amount: 300 });
  await ledger.runBudgetCommand(edit);
  assert.equal((await ledger.getBudgetStatus()).categories.find((c) => c.id === 'food')!.kind, 'reserve');
  assert.equal((await ledger.getBudgetProgress()).rows.find((r) => r.name === '飲食')!.kind, 'fixed');
  await ledger.runBudgetCommand(await command(ledger, { action: 'rollback', month: '2026-10' }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  const after = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual([after.income, after.surplus, after.spare, after.tuition, after.reserve, after.total, after.capSnapshot],
    [before.income, before.surplus, before.spare, before.tuition, before.reserve, before.total, before.capSnapshot]);
  assert.deepEqual(after.reserves.map((r) => [r.categoryId, r.balance]), before.reserves.map((r) => [r.categoryId, r.balance]));
});

test('儲備未清不能改組；停用須指定轉入並守恆，預覽不提前挪用', async (t) => {
  const ledger = await setup(t, true);
  await ledger.runBudgetCommand(await command(ledger, { action: 'add', name: '旅遊', kind: 'reserve', amount: 0 }));
  const target = (await ledger.getBudgetStatus()).categories.find((c) => c.name === '旅遊')!.id;
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await assert.rejects(ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '飲食', kind: 'actual', amount: 0 })), /儲備/);
  const before = await ledger.getBudgetMonth('2026-10');
  await assert.rejects(ledger.runBudgetCommand(await command(ledger, { action: 'retire', from: 'food' })), /儲備/);
  const retire = await command(ledger, { action: 'retire', from: 'food', to: target });
  const preview = await ledger.previewBudgetCommand(retire);
  assert.ok(preview.changes.some((c) => c.field === 'reserve'));
  assert.equal((await ledger.getBudgetMonth('2026-10')).reserve, before.reserve);
  await ledger.runBudgetCommand(retire);
  const after = await ledger.getBudgetMonth('2026-10');
  assert.equal(after.total, before.total);
  assert.equal(after.reserve, before.reserve);
  assert.equal(after.reserves.find((r) => r.categoryId === target)!.balance, 1000);
  assert.ok(!(await ledger.listCategories()).some((c) => c.name === '飲食'));
  assert.ok(!(await ledger.listCategories()).some((c) => c.name === '交通'));
});

test('未月結且零儲備可停用，停用不刪交易，不能以舊分類編號再記帳', async (t) => {
  const ledger = await setup(t);
  const old = (await ledger.listCategories()).find((c) => c.name === '飲食')!;
  await spend(ledger, '飲食', 10);
  await ledger.runBudgetCommand(await command(ledger, { action: 'retire', from: 'food' }));
  assert.equal((await ledger.getDayTransactions('2026-11-01'))[0].amount, 10);
  await assert.rejects(ledger.addTransaction({ date: '2026-11-02', categoryId: old.id, accountId: 1, flow: 'expense', amount: 10 }), /停用/);
  assert.equal((await ledger.getBudgetProgress()).unmapped[0].spent, 10);
});

test('進度查已結月份時使用凍結快照，之後改上限不影響舊月', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 200, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'phone', name: '電話網路', kind: 'fixed', amount: 500 }));
  assert.equal((await ledger.getBudgetProgress('2026-10')).rows.find((r) => r.categoryId === 'phone')!.cap, 200);
  assert.equal((await ledger.getBudgetProgress()).rows.find((r) => r.categoryId === 'phone')!.cap, 500);
});

test('改名後撤銷舊月，分類選項與交易驗證依交易月份恢復；未來分類不混入舊月份', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 1000, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '餐飲', kind: 'reserve', amount: 1000 }));
  const newCategory = (await ledger.listCategories()).find((c) => c.name === '餐飲')!;
  await ledger.runBudgetCommand(await command(ledger, { action: 'rollback', month: '2026-10' }));
  assert.ok((await ledger.listCategories()).some((c) => c.name === '飲食'));
  assert.ok(!(await ledger.listCategories('2026-10')).some((c) => c.name === '餐飲'));
  await spend(ledger, '飲食', 50, '2026-10-11');
  await assert.rejects(ledger.addTransaction({ date: '2026-10-12', categoryId: newCategory.id, accountId: 1, flow: 'expense', amount: 10 }), /尚未啟用/);
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  assert.equal((await ledger.getBudgetMonth('2026-10')).reserve, -50);
  assert.ok((await ledger.listCategories()).some((c) => c.name === '餐飲'));
});

test('已另行歸屬的同名交易分類不被預算類別改名搬走', async (t) => {
  const ledger = await setup(t);
  await ledger.runBudgetCommand(await command(ledger, { action: 'map', sourceCategory: '飲食', to: 'phone' }));
  const original = await spend(ledger, '飲食', 80, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '餐飲', kind: 'reserve', amount: 1000 }));
  assert.equal((await ledger.getTransaction(original.id)).categoryName, '飲食');
  assert.deepEqual(await ledger.getUnmappedExpenseCategories('2026-10'), []);
  await spend(ledger, '餐飲', 20, '2026-10-11');
  const view = await ledger.getBudgetProgress('2026-10');
  assert.equal(view.rows.find((r) => r.categoryId === 'food')!.spent, 20);
  assert.equal(view.rows.find((r) => r.categoryId === 'phone')!.spent, 80);
});

test('改名後在更晚月份停用，不把原名稱在中間月份重新啟用', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 1000, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '餐飲', kind: 'reserve', amount: 0 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'retire', from: 'food' }));
  assert.ok(!(await ledger.listCategories('2026-11')).some((c) => c.name === '飲食'));
  assert.ok((await ledger.listCategories('2026-11')).some((c) => c.name === '餐飲'));
  assert.ok((await ledger.listCategories('2026-10')).some((c) => c.name === '飲食'));
});

test('預覽後資料被更新，舊預覽的確認被拒且不覆寫新版本', async (t) => {
  const ledger = await setup(t);
  const a = await command(ledger, { action: 'edit', from: 'food', name: '飲食', kind: 'reserve', amount: 500 });
  await ledger.previewBudgetCommand(a);
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'phone', name: '電話網路', kind: 'fixed', amount: 300 }));
  await assert.rejects(ledger.runBudgetCommand(a), /重新載入/);
  assert.equal((await ledger.getBudgetProgress()).rows.find((r) => r.categoryId === 'food')!.cap, 1000);
  assert.equal((await ledger.getBudgetProgress()).rows.find((r) => r.categoryId === 'phone')!.cap, 300);
});

test('撤銷後明確啟用未來建立的分類，會從較早開放月生效', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 1000, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '餐飲', kind: 'reserve', amount: 1000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'rollback', month: '2026-10' }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'map', sourceCategory: '餐飲', to: 'food' }));
  assert.ok((await ledger.listCategories('2026-10')).some((c) => c.name === '餐飲'));
  await spend(ledger, '餐飲', 10, '2026-10-11');
  assert.deepEqual(await ledger.getUnmappedExpenseCategories('2026-10'), []);
});

test('重新指定已停用分類的歸屬只從開放月啟用，不改寫先前的停用月份', async (t) => {
  const ledger = await setup(t, true);
  await ledger.runBudgetCommand(await command(ledger, { action: 'retire', from: 'food' }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'map', sourceCategory: '飲食', to: 'phone' }));
  assert.ok(!(await ledger.listCategories('2026-10')).some((c) => c.name === '飲食'));
  assert.ok((await ledger.listCategories('2026-11')).some((c) => c.name === '飲食'));
  await spend(ledger, '飲食', 10);
  assert.equal((await ledger.getBudgetProgress()).rows.find((r) => r.categoryId === 'phone')!.spent, 10);
});

test('分類可以改回自己先前的名稱，沿用同一歸屬且保留交易筆數與金額', async (t) => {
  const ledger = await setup(t, true);
  await spend(ledger, '飲食', 1000, '2026-10-10');
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 3000 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '餐飲', kind: 'reserve', amount: 1000 }));
  await spend(ledger, '餐飲', 25);
  await ledger.runBudgetCommand(await command(ledger, { action: 'edit', from: 'food', name: '飲食', kind: 'reserve', amount: 1000 }));
  assert.equal((await ledger.getDayTransactions('2026-11-01'))[0].categoryName, '飲食');
  assert.deepEqual((await ledger.listTransactions('2026-10-01', '2026-11-30')).map((r) => r.amount), [1000, 25]);
  assert.deepEqual(await ledger.getUnmappedExpenseCategories(), []);
});
