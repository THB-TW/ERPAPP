// 合成帳本；所有操作與斷言都走帳本服務，使用真正的 SQLite。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetCommand, BudgetState } from '../calc/budgetTypes.ts';
import { openLedger, type Ledger } from './index.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
function fixture(): BudgetState {
  return {
    ...emptyBudgetState(), version: 4,
    categories: [
      { id: 'learn', name: '學習', kind: 'reserve' },
      { id: 'food', name: '飲食', kind: 'actual' },
      { id: 'other', name: '其他', kind: 'fixed' },
    ],
    revisions: [{ id: 'caps', month: '2026-09', tuition: 0,
      limits: [{ categoryId: 'learn', amount: 3000 }, { categoryId: 'food', amount: 0 }, { categoryId: 'other', amount: 0 }],
      mapping: { 學習: 'learn', 飲食: 'food', 交通: 'other' },
      reason: '合成上限', actor: 'test', time: NOW.toISOString() }],
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 10000, tuition: 5000,
      balances: { learn: 1000 }, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }],
  };
}
async function setup(t: TestContext, state = fixture(), now = NOW): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => now });
  t.after(() => ledger.close());
  await ledger.importFinanceDocument(serializeBudgetDocument(state));
  return ledger;
}
async function transaction(ledger: Ledger, name: string, amount: number, date = '2026-10-05') {
  const category = (await ledger.listCategories()).find((c) => c.name === name)!;
  const account = (await ledger.listAccounts())[0];
  return ledger.addTransaction({ date, categoryId: category.id, accountId: account.id, amount, flow: category.flow });
}
async function command(ledger: Ledger, fields: Partial<BudgetCommand> & { action: string }) {
  const status = await ledger.getBudgetStatus();
  return ledger.runBudgetCommand({ operationId: randomUUID(), version: status.version, month: status.openMonth,
    reason: '合成調整', ...fields });
}

test('精靈自動選開放月份，只帶入該月收入；尚未結束的月份不可月結', async (t) => {
  const ledger = await setup(t);
  await transaction(ledger, '薪資', 40000);
  await transaction(ledger, '其他收入', 500);
  await transaction(ledger, '飲食', 100);
  await transaction(ledger, '薪資', 888, '2026-11-01');
  assert.deepEqual(await ledger.getMonthlyCloseDraft(), {
    month: '2026-10', version: 4, income: 40500, latestMonth: '2026-09', canClose: true,
  });
  const current = await setup(t, fixture(), new Date('2026-10-31T15:59:59Z'));
  assert.equal((await current.getMonthlyCloseDraft()).canClose, false);
});

test('進入計算即取得票03同一案例的八項數字與逐類變動，預覽不寫入', async (t) => {
  const ledger = await setup(t);
  await transaction(ledger, '薪資', 40000);
  await transaction(ledger, '飲食', 100);
  await transaction(ledger, '飲食', 200);
  await transaction(ledger, '學習', 1200);
  await transaction(ledger, '交通', 50);
  const before = await ledger.exportFinanceDocument();
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  assert.equal(preview.version, 4);
  assert.deepEqual([preview.income, preview.summary.surplus, preview.summary.spare, preview.summary.tuition,
    preview.summary.reserve, preview.summary.total], [40000, 36650, 46650, 5000, 2800, 54450]);
  assert.deepEqual(preview.rows.map((r) => [r.name, r.cap, r.spent, r.change, r.balance]), [
    ['學習', 3000, 1200, 1800, 2800], ['飲食', null, 300, null, null], ['其他', 0, 50, -50, null],
  ]);
  assert.equal(preview.summary.capSnapshot!.month, '2026-10');
  assert.deepEqual(preview.summary.capSnapshot!.limits, fixture().revisions[0].limits);
  assert.equal(await ledger.exportFinanceDocument(), before);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
});

test('確認才完成月結、凍結沿用版本並鎖定全部交易異動；相同請求重送不重做', async (t) => {
  const ledger = await setup(t);
  await transaction(ledger, '薪資', 40000);
  const { id } = await transaction(ledger, '飲食', 100);
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  const request = { month: preview.month, version: preview.version, previewToken: preview.previewToken,
    operationId: randomUUID(), hasEntitlement: true };
  assert.deepEqual(await ledger.completeMonthlyClose(request), { version: 5, replayed: false });
  assert.deepEqual(await ledger.completeMonthlyClose(request), { version: 5, replayed: true });
  assert.equal((await ledger.listBudgetMonths()).length, 2);
  assert.equal((await ledger.getMonthlyCloseDraft()).month, '2026-11');
  const closed = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual([closed.income, closed.surplus, closed.spare, closed.tuition, closed.reserve, closed.total],
    [40000, 36900, 46900, 5000, 4000, 55900]);
  assert.equal(closed.capSnapshot!.month, '2026-10');
  assert.equal((await ledger.listBudgetRevisions()).length, 2);
  await assert.rejects(transaction(ledger, '飲食', 50), /已結月份/);
  const old = await ledger.getTransaction(id);
  await assert.rejects(ledger.updateTransaction(id, { ...old, amount: 200 }), /已結月份/);
  await assert.rejects(ledger.deleteTransaction(id), /已結月份/);
  await command(ledger, { action: 'caps', limits: fixture().revisions[0].limits.map((l) => ({ ...l, amount: l.categoryId === 'learn' ? 8000 : 0 })) });
  assert.deepEqual((await ledger.getBudgetMonth('2026-10')).capSnapshot, closed.capSnapshot);
  await assert.rejects(ledger.completeMonthlyClose({ ...request, previewToken: '不同預覽' }), /操作識別碼|預覽/);
});

test('沒有付費權益拒絕預覽與完成，過去月結仍可讀取', async (t) => {
  const ledger = await setup(t);
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  const before = await ledger.exportFinanceDocument();
  await assert.rejects(ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: false }), /付費權益/);
  await assert.rejects(ledger.completeMonthlyClose({ ...preview, operationId: randomUUID(), hasEntitlement: false }), /付費權益/);
  assert.equal((await ledger.getBudgetMonth('2026-09')).total, 16000);
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('尚未結束的月份、跳月與格式錯誤不能預覽或完成，台北換月後才開放', async (t) => {
  const ledger = await setup(t, fixture(), new Date('2026-10-31T15:59:59Z'));
  await assert.rejects(ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true }), /還沒結束/);
  await assert.rejects(ledger.completeMonthlyClose({ month: '2026-10', version: 4, previewToken: '', operationId: randomUUID(), hasEntitlement: true }), /還沒結束/);
  await assert.rejects(ledger.previewMonthlyClose({ month: '2026-1', hasEntitlement: true }), /月份格式/);
  const next = await setup(t, fixture(), new Date('2026-10-31T16:00:00Z'));
  assert.equal((await next.getMonthlyCloseDraft()).canClose, true);
  await next.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  await assert.rejects(next.previewMonthlyClose({ month: '2026-09', hasEntitlement: true }), /依月份順序/);
});

test('預覽後交易新增、修改、刪除或上限變更都拒絕舊預覽，且沒有半套月結', async (t) => {
  const ledger = await setup(t);
  const income = await transaction(ledger, '薪資', 40000);
  async function request() {
    const p = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
    return { ...p, operationId: randomUUID(), hasEntitlement: true };
  }
  const add = await request();
  const expense = await transaction(ledger, '飲食', 100);
  await assert.rejects(ledger.completeMonthlyClose(add), /重新預覽/);
  const edit = await request();
  await ledger.updateTransaction(income.id, { ...await ledger.getTransaction(income.id), amount: 35000 });
  await assert.rejects(ledger.completeMonthlyClose(edit), /重新預覽/);
  const remove = await request();
  await ledger.deleteTransaction(expense.id);
  await assert.rejects(ledger.completeMonthlyClose(remove), /重新預覽/);
  const caps = await request();
  await command(ledger, { action: 'caps', limits: fixture().revisions[0].limits, tuition: 100 });
  await assert.rejects(ledger.completeMonthlyClose(caps), /重新預覽/);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
  assert.equal((await ledger.listBudgetMonths()).length, 1);
  const fresh = await request();
  await ledger.completeMonthlyClose(fresh);
  assert.equal((await ledger.getBudgetMonth('2026-10')).income, 35000);
});

test('未歸屬支出由引擎指出分類；拒絕後補歸屬即可完成', async (t) => {
  const ledger = await setup(t);
  await transaction(ledger, '娛樂', 500);
  const before = await ledger.exportFinanceDocument();
  await assert.rejects(ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true }), /分類「娛樂」尚未設定有效的預算歸屬/);
  assert.equal(await ledger.exportFinanceDocument(), before);
  await command(ledger, { action: 'map', sourceCategory: '娛樂', to: 'other' });
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  await ledger.completeMonthlyClose({ ...preview, operationId: randomUUID(), hasEntitlement: true });
  assert.equal((await ledger.getBudgetMonth('2026-10')).surplus, -3500);
});

test('前期更正與補入儲備經精靈撤銷重結只生效一次，並保留原始快照', async (t) => {
  const ledger = await setup(t);
  await transaction(ledger, '薪資', 20000);
  await command(ledger, { action: 'correct', amount: -700 });
  const first = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  const request = { ...first, operationId: randomUUID(), hasEntitlement: true };
  await ledger.completeMonthlyClose(request);
  await command(ledger, { action: 'fund', month: '2026-10', amount: 2000, to: 'learn' });
  const adjusted = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual([adjusted.spare, adjusted.reserve, adjusted.total], [24300, 6000, 35300]);
  await command(ledger, { action: 'rollback', month: '2026-10' });
  assert.equal((await ledger.listBudgetAdjustments()).find((a) => a.kind === 'fund')!.pending, true);
  // 舊的成功請求重送不會把已撤銷月份再結一次。
  assert.equal((await ledger.completeMonthlyClose(request)).replayed, true);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
  const again = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  await ledger.completeMonthlyClose({ ...again, operationId: randomUUID(), hasEntitlement: true });
  const reclosed = await ledger.getBudgetMonth('2026-10');
  assert.deepEqual([reclosed.income, reclosed.surplus, reclosed.spare, reclosed.tuition, reclosed.reserve, reclosed.total],
    [20000, 17000, 24300, 5000, 6000, 35300]);
  assert.deepEqual(reclosed.reserves, adjusted.reserves);
  assert.deepEqual(reclosed.capSnapshot!.limits, adjusted.capSnapshot!.limits);
  assert.deepEqual(reclosed.capSnapshot!.mapping, adjusted.capSnapshot!.mapping);
});

test('歷史查詢分開原始月結快照與調整後資產，舊月份不推算缺漏的實支', async (t) => {
  const ledger = await setup(t);
  await transaction(ledger, '薪資', 20000);
  await transaction(ledger, '學習', 1200);
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  await ledger.completeMonthlyClose({ ...preview, operationId: randomUUID(), hasEntitlement: true });
  await command(ledger, { action: 'fund', month: '2026-10', amount: 2000, to: 'learn' });
  const snapshot = await ledger.getMonthlyCloseSnapshot('2026-10');
  assert.deepEqual([snapshot.calculation.income, snapshot.calculation.surplus, snapshot.calculation.rawSpare,
    snapshot.calculation.tuition, snapshot.calculation.balances.learn, snapshot.calculation.changes.learn,
    snapshot.calculation.expenses.learn], [20000, 17000, 27000, 5000, 2800, 1800, 1200]);
  assert.deepEqual([snapshot.summary.spare, snapshot.summary.reserve, snapshot.summary.total], [25000, 4800, 34800]);
  assert.equal(snapshot.calculation.capSnapshot!.month, '2026-10');
  assert.equal(snapshot.time, NOW.toISOString());
  const baseline = await ledger.getMonthlyCloseSnapshot('2026-09');
  assert.equal(baseline.summary.migrated, true);
  assert.equal(baseline.calculation.capSnapshot, null);
  await assert.rejects(ledger.getMonthlyCloseSnapshot('2026-11'), /尚未月結/);
  await assert.rejects(ledger.getMonthlyCloseSnapshot('bad'), /月份格式/);
});

test('預覽的暫時識別碼不會與既有成功操作衝突', async (t) => {
  const ledger = await setup(t);
  const first = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  await ledger.completeMonthlyClose({ ...first, operationId: '11111111-1111-4111-8111-111111111111', hasEntitlement: true });
  await command(ledger, { action: 'rollback', month: '2026-10' });
  const next = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  assert.equal(next.summary.surplus, -3000);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
});

test('同版本取代期初基準或前期更正時也拒絕舊預覽', async (t) => {
  const ledger = await setup(t);
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  const replaced = fixture();
  replaced.months[0].rawSpare = 20000;
  await ledger.importFinanceDocument(serializeBudgetDocument(replaced), { replace: true });
  await assert.rejects(ledger.completeMonthlyClose({ ...preview, operationId: randomUUID(), hasEntitlement: true }), /重新預覽/);
  const second = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  replaced.adjustments.push({ id: randomUUID(), month: '2026-09', kind: 'correct', amount: -700,
    from: null, to: null, reason: '合成更正', actor: 'test', time: NOW.toISOString(), reverses: null, changes: [] });
  await ledger.importFinanceDocument(serializeBudgetDocument(replaced), { replace: true });
  await assert.rejects(ledger.completeMonthlyClose({ ...second, operationId: randomUUID(), hasEntitlement: true }), /重新預覽/);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
});

test('相容的預算指令入口也接受權益，明確沒有權益時拒絕月結與撤銷', async (t) => {
  const ledger = await setup(t);
  const close = { action: 'close', month: '2026-10', version: 4, operationId: randomUUID(), reason: '月結', amount: 0 };
  const access = { hasEntitlement: false };
  await assert.rejects(ledger.runBudgetCommand(close, access), /付費權益/);
  await assert.rejects(ledger.previewBudgetCommand(close, access), /付費權益/);
  // 缺省保持票03與舊帳工具的收入輸入相容性。
  await ledger.runBudgetCommand(close);
  const rollback = { ...close, action: 'rollback', version: 5, operationId: randomUUID() };
  await assert.rejects(ledger.runBudgetCommand(rollback, access), /付費權益/);
  assert.equal(await ledger.isMonthClosed('2026-10'), true);
});

test('搬遷月份17元合成歷史差額原樣保留，後續月結仍由既有引擎阻擋', async (t) => {
  const state = fixture();
  state.months[0].legacyTotalDifference = 17;
  const ledger = await setup(t, state);
  const before = await ledger.exportFinanceDocument();
  const old = await ledger.getMonthlyCloseSnapshot('2026-09');
  assert.deepEqual([old.summary.income, old.summary.surplus, old.summary.spare, old.summary.tuition,
    old.summary.reserve, old.summary.total, old.summary.legacyTotalDifference], [0, 0, 10000, 5000, 1000, 16017, 17]);
  await assert.rejects(ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true }), /歷史資產加總差異/);
  await assert.rejects(ledger.completeMonthlyClose({ month: '2026-10', version: 4, previewToken: '',
    operationId: randomUUID(), hasEntitlement: true }), /歷史資產加總差異/);
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('關閉並重開SQLite後仍保存月結與確認內容，重送只讀回成功收據', async () => {
  // 暫存資料只寫在執行測試的 worktree，測試結束後移除。
  const dir = mkdtempSync(join(process.cwd(), '.monthly-close-test-'));
  let ledger: Ledger | undefined;
  try {
    const path = join(dir, 'ledger.db');
    ledger = await openLedger(openNodeDatabase(path), { now: () => NOW });
    await ledger.importFinanceDocument(serializeBudgetDocument(fixture()));
    await transaction(ledger, '薪資', 20000);
    const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
    const request = { ...preview, operationId: randomUUID(), hasEntitlement: true };
    await ledger.completeMonthlyClose(request);
    const expected = await ledger.getMonthlyCloseSnapshot('2026-10');
    await ledger.close();
    ledger = undefined;
    ledger = await openLedger(openNodeDatabase(path), { now: () => NOW });
    assert.deepEqual(await ledger.getMonthlyCloseSnapshot('2026-10'), expected);
    assert.equal((await ledger.completeMonthlyClose(request)).replayed, true);
    await assert.rejects(ledger.completeMonthlyClose({ ...request, previewToken: '不同內容' }), /操作識別碼/);
    assert.equal((await ledger.listBudgetMonths()).length, 2);
  } finally {
    await ledger?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
