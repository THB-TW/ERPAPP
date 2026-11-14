// 合成帳本；畫面流程只經由帳本服務，背後使用真正的 SQLite。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type BudgetCommand, type Ledger } from './index.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
/** 精靈完成入口要先有零差額的總資產核對（票 13）：把合成銀行餘額核平後才完成月結。 */
async function closeMonth(ledger: Ledger, month: string) {
  const input = { month, hasEntitlement: true };
  const check = await ledger.previewAssetCheck(input);
  const bank = check.accounts.find((a) => a.kind === 'bank')!;
  const balances = [{ accountId: bank.accountId, balance: bank.appBalance - check.difference }];
  const adjusted = await ledger.previewAssetCheck({ ...input, balances });
  const record = await ledger.recordAssetCheck({ ...input, balances, checkToken: adjusted.checkToken, operationId: randomUUID() });
  const preview = await ledger.previewMonthlyClose(input);
  await ledger.completeMonthlyClose({ month, hasEntitlement: true, operationId: randomUUID(), version: preview.version,
    previewToken: preview.previewToken, assetCheckId: record.id });
}
async function setup(t: TestContext, openingSpare = 5000): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  const state = emptyBudgetState();
  state.categories = [{ id: 'food', name: '合成餐費', kind: 'reserve' }, { id: 'trip', name: '合成旅遊', kind: 'reserve' }];
  state.revisions = [{ id: 'caps', month: '2026-09', tuition: 0,
    limits: [{ categoryId: 'food', amount: 1000 }, { categoryId: 'trip', amount: 500 }],
    mapping: { 合成餐費: 'food', 合成旅遊: 'trip' }, reason: '合成上限', actor: 'test', time: NOW.toISOString() }];
  state.months = [{ id: 'baseline', month: '2026-08', income: 0, surplus: 0, rawSpare: openingSpare, tuition: 0,
    balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
    legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }];
  await ledger.importLegacyLedger({ openingDate: '2026-09-01',
    accounts: [{ name: '合成銀行', kind: 'bank', openingBalance: openingSpare }],
    categories: [{ name: '合成餐費', flow: 'expense' }, { name: '合成旅遊', flow: 'expense' }, { name: '合成薪資', flow: 'income' }],
    members: [], transactions: ['09', '10'].flatMap((month) => [
      { date: `2026-${month}-02`, category: '合成薪資', account: '合成銀行', member: null, note: '', flow: 'income' as const, amount: 3000 },
      { date: `2026-${month}-03`, category: '合成餐費', account: '合成銀行', member: null, note: '', flow: 'expense' as const, amount: 200 },
    ]), document: serializeBudgetDocument(state) });
  for (const month of ['2026-09', '2026-10']) await closeMonth(ledger, month);
  return ledger;
}

async function request(ledger: Ledger, action: string, fields: Partial<BudgetCommand> = {}) {
  const status = await ledger.getBudgetStatus();
  return { hasEntitlement: true, command: { action, operationId: randomUUID(), version: status.version,
    month: action === 'retire' || action === 'correct' ? status.openMonth : status.latestMonth!, reason: '合成調整原因', ...fields } };
}
async function apply(ledger: Ledger, action: string, fields: Partial<BudgetCommand> = {}) {
  const input = await request(ledger, action, fields);
  const preview = await ledger.previewAdjustment(input);
  await ledger.confirmAdjustment({ ...input, previewToken: preview.previewToken });
  return input;
}
const balances = (view: Awaited<ReturnType<Ledger['getBudgetMonth']>>) => view.reserves.map((r) => [r.categoryId, r.balance]);

test('挪用先預覽前後金額且不寫入，確認守恆、原快照不變、相同操作重送不重做', async (t) => {
  const ledger = await setup(t);
  const original = await ledger.getMonthlyCloseSnapshot('2026-10');
  const document = await ledger.exportFinanceDocument();
  const input = await request(ledger, 'transfer', { from: 'food', to: 'trip', amount: 300 });
  const preview = await ledger.previewAdjustment(input);
  assert.deepEqual(balances(preview.latestBefore!), [['food', 1600], ['trip', 1000]]);
  assert.deepEqual(balances(preview.latestAfter!), [['food', 1300], ['trip', 1300]]);
  assert.equal(preview.latestBefore!.total, 10600);
  assert.equal(preview.latestAfter!.total, 10600);
  assert.equal(preview.latestAfter!.spare, 8000);
  assert.equal(preview.latestAfter!.tuition, 0);
  assert.equal(await ledger.exportFinanceDocument(), document);
  assert.deepEqual(await ledger.listBudgetAdjustments(), []);
  const confirmation = { ...input, previewToken: preview.previewToken };
  await ledger.confirmAdjustment(confirmation);
  assert.equal((await ledger.confirmAdjustment(confirmation)).replayed, true);
  assert.equal((await ledger.listBudgetAdjustments()).length, 1);
  assert.deepEqual((await ledger.getMonthlyCloseSnapshot('2026-10')).calculation, original.calculation);
  await assert.rejects(ledger.confirmAdjustment({ ...confirmation, command: { ...input.command, amount: 301 } }), /其他內容/);
});

test('補儲備與沖銷保留原因、金額、時間及相反紀錄；總資產與貸款儲備守恆', async (t) => {
  const ledger = await setup(t);
  const input = await request(ledger, 'fund', { to: 'trip', amount: 400 });
  const preview = await ledger.previewAdjustment(input);
  assert.equal(preview.latestAfter!.spare, 7600);
  assert.equal(preview.latestAfter!.reserve, 3000);
  assert.equal(preview.latestAfter!.total, 10600);
  assert.equal(preview.latestAfter!.tuition, preview.latestBefore!.tuition);
  await ledger.confirmAdjustment({ ...input, previewToken: preview.previewToken });
  await apply(ledger, 'reverse', { reverses: input.command.operationId, reason: '合成沖銷原因' });
  const history = await ledger.listBudgetAdjustments();
  assert.equal(history[0].reason, '合成調整原因');
  assert.equal(history[0].amount, 400);
  assert.equal(history[0].time, NOW.toISOString());
  assert.equal(history[0].reversed, true);
  assert.equal(history[1].reverses, history[0].id);
  assert.equal(history[1].amount, -400);
  assert.equal(history[1].reason, '合成沖銷原因');
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, 8000);
  await assert.rejects(apply(ledger, 'reverse', { reverses: history[0].id }), /已沖銷/);
  await assert.rejects(apply(ledger, 'reverse', { reverses: history[1].id }), /沖銷紀錄/);
});

test('更正列出所有受影響月份；撤銷後待重結，重結只恢復一次並保留原始計算', async (t) => {
  const ledger = await setup(t);
  const original = await ledger.getMonthlyCloseSnapshot('2026-10');
  const input = await request(ledger, 'correct', { month: '2026-10', amount: -700 });
  const preview = await ledger.previewAdjustment(input);
  assert.deepEqual(preview.months.map((m) => [m.month, m.before.spare, m.after!.spare]), [
    ['2026-09', 6500, 5800], ['2026-10', 8000, 7300],
  ]);
  await ledger.confirmAdjustment({ ...input, previewToken: preview.previewToken });
  await apply(ledger, 'rollback');
  const rollback = await request(ledger, 'rollback', { month: '2026-09' });
  const back = await ledger.previewAdjustment(rollback);
  assert.equal(back.latestBefore!.spare, 5800);
  assert.equal(back.latestAfter!.spare, 5000);
  assert.equal(back.months[0].after, null);
  assert.equal(back.pending[0].id, input.command.operationId);
  await ledger.confirmAdjustment({ ...rollback, previewToken: back.previewToken });
  assert.equal((await ledger.listBudgetAdjustments())[0].pending, true);
  await assert.rejects(apply(ledger, 'reverse', { reverses: input.command.operationId }), /待重結/);
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-09');
  assert.equal(await ledger.isMonthClosed('2026-09'), false);
  for (const month of ['2026-09', '2026-10']) await closeMonth(ledger, month);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, 7300);
  assert.equal((await ledger.listBudgetAdjustments())[0].pending, false);
  assert.deepEqual((await ledger.getMonthlyCloseSnapshot('2026-10')).calculation, original.calculation);
  await apply(ledger, 'reverse', { reverses: input.command.operationId });
  assert.equal((await ledger.getBudgetMonth('2026-09')).spare, 6500);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, 8000);
});

test('撤銷本月的挪用與補入保留為待重結，重結恰好恢復一次', async (t) => {
  const ledger = await setup(t);
  await apply(ledger, 'transfer', { from: 'food', to: 'trip', amount: 200 });
  await apply(ledger, 'fund', { to: 'trip', amount: 100 });
  const before = await ledger.getBudgetMonth('2026-10');
  const rollback = await request(ledger, 'rollback');
  const preview = await ledger.previewAdjustment(rollback);
  assert.equal(preview.pending.length, 2);
  await ledger.confirmAdjustment({ ...rollback, previewToken: preview.previewToken });
  assert.ok((await ledger.listBudgetAdjustments()).every((a) => a.pending));
  await closeMonth(ledger, '2026-10');
  assert.deepEqual(await ledger.getBudgetMonth('2026-10'), before);
});

test('停用沿用引擎：預覽轉走全部正儲備，確認後分類停用且歷史快照與交易保留', async (t) => {
  const ledger = await setup(t);
  const before = await ledger.getMonthlyCloseSnapshot('2026-10');
  const transactions = await ledger.listTransactions('2026-09-01', '2026-10-31');
  const input = await request(ledger, 'retire', { from: 'food', to: 'trip' });
  const preview = await ledger.previewAdjustment(input);
  assert.deepEqual(balances(preview.latestAfter!), [['food', 0], ['trip', 2600]]);
  assert.equal(preview.latestAfter!.total, 10600);
  assert.ok((await ledger.listCategories()).some((c) => c.name === '合成餐費'));
  await ledger.confirmAdjustment({ ...input, previewToken: preview.previewToken });
  assert.ok(!(await ledger.listCategories()).some((c) => c.name === '合成餐費'));
  assert.deepEqual((await ledger.getMonthlyCloseSnapshot('2026-10')).calculation, before.calculation);
  assert.deepEqual(await ledger.listTransactions('2026-09-01', '2026-10-31'), transactions);
});

test('所有調整必填原因並驗權益；無權益仍能查詢既有資料，免費上限可改', async (t) => {
  const ledger = await setup(t);
  const original = await apply(ledger, 'fund', { to: 'trip', amount: 10 });
  const before = await ledger.exportFinanceDocument();
  for (const [action, fields] of [
    ['transfer', { from: 'food', to: 'trip', amount: 10 }], ['fund', { to: 'trip', amount: 10 }],
    ['correct', { amount: -10 }], ['reverse', { reverses: original.command.operationId }],
    ['retire', { from: 'food', to: 'trip' }], ['rollback', {}],
  ] as const) {
    const input = await request(ledger, action, fields);
    const preview = await ledger.previewAdjustment(input);
    await assert.rejects(ledger.previewAdjustment({ ...input, hasEntitlement: false }), /付費權益/);
    await assert.rejects(ledger.confirmAdjustment({ ...input, hasEntitlement: false, previewToken: preview.previewToken }), /付費權益/);
    await assert.rejects(ledger.runBudgetCommand(input.command, { hasEntitlement: false }), /付費權益/);
    await assert.rejects(ledger.previewBudgetCommand(input.command, { hasEntitlement: false }), /付費權益/);
    for (const reason of ['', '   ', '字'.repeat(301)]) {
      const invalid = { ...input, command: { ...input.command, reason } };
      await assert.rejects(ledger.previewAdjustment(invalid), /原因/);
      await assert.rejects(ledger.confirmAdjustment({ ...invalid, previewToken: '' }));
    }
  }
  assert.equal(await ledger.exportFinanceDocument(), before);
  assert.equal((await ledger.listBudgetAdjustments()).length, 1);
  const caps = await request(ledger, 'caps', { month: '2026-11', limits: (await ledger.getBudgetStatus()).currentRevision!.limits });
  await ledger.runBudgetCommand(caps.command, { hasEntitlement: false });
  await assert.rejects(ledger.previewAdjustment(caps), /調整/);
});

test('金額不足、未知分類、無效金額、停用負儲備與非最近月撤銷均拒絕而不寫入', async (t) => {
  const ledger = await setup(t);
  const before = await ledger.exportFinanceDocument();
  for (const [action, fields] of [
    ['transfer', { from: 'food', to: 'trip', amount: 1601 }], ['transfer', { from: 'food', to: 'unknown', amount: 1 }],
    ['transfer', { from: 'food', to: 'food', amount: 1 }], ['transfer', { from: 'food', to: 'trip', amount: 1.5 }],
    ['fund', { to: 'trip', amount: 8001 }], ['fund', { to: 'trip', amount: -1 }], ['fund', { to: 'trip', amount: 0 }],
    ['correct', { amount: 0 }], ['retire', { from: 'food' }], ['rollback', { month: '2026-09' }],
  ] as const) {
    const input = await request(ledger, action, fields);
    await assert.rejects(ledger.previewAdjustment(input));
    await assert.rejects(ledger.confirmAdjustment({ ...input, previewToken: '' }));
  }
  assert.equal(await ledger.exportFinanceDocument(), before);
  await apply(ledger, 'transfer', { from: 'food', to: 'trip', amount: 1600 });
  await apply(ledger, 'rollback');
  // 負儲備由合法支出形成，不能透過停用消失。
  const category = (await ledger.listCategories()).find((c) => c.name === '合成餐費')!;
  const account = (await ledger.listAccounts())[0];
  await ledger.addTransaction({ date: '2026-10-05', categoryId: category.id, accountId: account.id, flow: 'expense', amount: 2000 });
  await ledger.runBudgetCommand((await request(ledger, 'close', { month: '2026-10', amount: 3000 })).command);
  await assert.rejects(apply(ledger, 'retire', { from: 'food', to: 'trip' }), /負儲備/);
});

test('沖銷挪用與補入都重新檢查可退儲備，不足則原紀錄保持未沖銷', async (t) => {
  const ledger = await setup(t);
  const fund = await apply(ledger, 'fund', { to: 'trip', amount: 400 });
  const transfer = await apply(ledger, 'transfer', { from: 'food', to: 'trip', amount: 200 });
  await apply(ledger, 'transfer', { from: 'trip', to: 'food', amount: 1600 });
  for (const original of [fund, transfer]) {
    await assert.rejects(apply(ledger, 'reverse', { reverses: original.command.operationId }), /儲備不足/);
  }
  assert.ok((await ledger.listBudgetAdjustments()).every((a) => !a.reversed));
});

test('確認要求原預覽、拒絕更換內容、過期版本與同版本整本取代後的舊預覽', async (t) => {
  const ledger = await setup(t);
  const input = await request(ledger, 'fund', { to: 'trip', amount: 100 });
  const preview = await ledger.previewAdjustment(input);
  await assert.rejects(ledger.confirmAdjustment({ ...input, previewToken: '' }), /預覽/);
  await assert.rejects(ledger.confirmAdjustment({ ...input, command: { ...input.command, amount: 200 }, previewToken: preview.previewToken }), /預覽/);
  const replacement = await setup(t, 6000);
  await ledger.importFinanceDocument(await replacement.exportFinanceDocument(), { replace: true });
  await assert.rejects(ledger.confirmAdjustment({ ...input, previewToken: preview.previewToken }), /預覽/);
  const next = await request(ledger, 'fund', { to: 'trip', amount: 100 });
  const nextPreview = await ledger.previewAdjustment(next);
  await apply(ledger, 'fund', { to: 'food', amount: 1 });
  await assert.rejects(ledger.confirmAdjustment({ ...next, previewToken: nextPreview.previewToken }), /更新|預覽/);
});

test('搬遷月份缺上限或有歷史差異時，受影響更正與撤銷都拒絕且保留原始帳本', async (t) => {
  for (const kind of ['missing', 'difference'] as const) {
    const ledger = await setup(t);
    const source = emptyBudgetState();
    source.categories = [{ id: 'food', name: '合成餐費', kind: 'reserve' }];
    source.months = ['2026-08', '2026-09', '2026-10'].map((month) => ({
      id: randomUUID(), month, income: 100, surplus: 100, rawSpare: 100,
      tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: month === '2026-10' && kind === 'difference' ? 7 : 0,
      legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test',
    }));
    await ledger.importFinanceDocument(serializeBudgetDocument(source), { replace: true });
    const before = await ledger.exportFinanceDocument();
    for (const action of ['correct', 'rollback']) {
      const input = await request(ledger, action, { amount: 1 });
      await assert.rejects(ledger.previewAdjustment(input), /上限|差異/);
      await assert.rejects(ledger.confirmAdjustment({ ...input, previewToken: '' }), /上限|差異/);
    }
    assert.equal(await ledger.exportFinanceDocument(), before);
  }
});

test('明確的無快照期初基準可更正與沖銷，期初本身有歷史差異仍被拒絕', async (t) => {
  const ledger = await setup(t);
  const correction = await apply(ledger, 'correct', { month: '2026-09', amount: -100 });
  assert.equal((await ledger.getBudgetMonth('2026-08')).spare, 4900);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, 7900);
  await apply(ledger, 'reverse', { reverses: correction.command.operationId });
  assert.equal((await ledger.getBudgetMonth('2026-08')).spare, 5000);
  const source = emptyBudgetState();
  source.months = [{ id: 'baseline', month: '2026-08', income: 0, surplus: 0, rawSpare: 5000, tuition: 0,
    balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
    legacyTotalDifference: 7, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }];
  await ledger.importFinanceDocument(serializeBudgetDocument(source), { replace: true });
  const before = await ledger.exportFinanceDocument();
  await assert.rejects(apply(ledger, 'correct', { month: '2026-09', amount: 1 }), /差異/);
  assert.equal(await ledger.exportFinanceDocument(), before);
  await assert.rejects(apply(ledger, 'rollback'), /期初基準/);
});

test('更正與其沖銷都保護後續缺快照搬遷月份；原有調整不被刪除', async (t) => {
  const ledger = await setup(t);
  const source = emptyBudgetState();
  source.categories = [{ id: 'food', name: '合成餐費', kind: 'reserve' }];
  source.revisions = [{ id: 'legacy-caps', month: '2026-09', limits: [{ categoryId: 'food', amount: 100 }],
    mapping: { 合成餐費: 'food' }, tuition: 0, reason: '合成搬遷上限', actor: 'test', time: NOW.toISOString() }];
  source.months = ['2026-08', '2026-09', '2026-10'].map((month) => ({
    id: randomUUID(), month, income: 100, surplus: 100, rawSpare: 100,
    tuition: 0, balances: {}, changes: {}, expenses: {}, revision: month === '2026-09' ? source.revisions[0] : null,
    migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test',
  }));
  const id = randomUUID();
  source.adjustments = [{ id, month: '2026-09', kind: 'correct', amount: -7, from: null, to: null,
    reason: '合成原有更正', actor: 'test', time: NOW.toISOString(), reverses: null, changes: [] }];
  await ledger.importFinanceDocument(serializeBudgetDocument(source), { replace: true });
  const before = await ledger.exportFinanceDocument();
  for (const input of [await request(ledger, 'correct', { month: '2026-10', amount: 1 }), await request(ledger, 'reverse', { reverses: id })]) {
    await assert.rejects(ledger.previewAdjustment(input), /2026-10.*上限/);
    await assert.rejects(ledger.confirmAdjustment({ ...input, previewToken: '' }), /2026-10.*上限/);
  }
  assert.equal(await ledger.exportFinanceDocument(), before);
  assert.equal((await ledger.listBudgetAdjustments())[0].reversed, false);
});

test('有貸款繳款時撤銷與重結只扣一次本金及儲備；重送舊撤銷不撤掉新月結', async (t) => {
  const ledger = await setup(t);
  await apply(ledger, 'rollback');
  await ledger.createLoan({ name: '合成分期', totalAmount: 1000, remainingPrincipal: 1000, monthlyPayment: 300,
    expectedEndMonth: '2027-01', reason: '合成貸款', version: (await ledger.getBudgetStatus()).version, hasEntitlement: true });
  const [loan] = await ledger.listLoans();
  await ledger.addTransaction({ date: '2026-10-05', categoryId: loan.categoryId!, accountId: (await ledger.listAccounts())[0].id,
    amount: 100, flow: 'expense' });
  const close = () => closeMonth(ledger, '2026-10');
  await close();
  await apply(ledger, 'fund', { to: 'trip', amount: 100 });
  const before = await ledger.getBudgetMonth('2026-10');
  assert.equal(before.tuition, 200);
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[900, 200]]);
  const input = await request(ledger, 'rollback');
  const preview = await ledger.previewAdjustment(input);
  assert.equal(preview.latestBefore!.tuition, 200);
  assert.equal(preview.latestAfter!.tuition, 0);
  const confirmation = { ...input, previewToken: preview.previewToken };
  await ledger.confirmAdjustment(confirmation);
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[1000, 0]]);
  await close();
  assert.deepEqual(await ledger.getBudgetMonth('2026-10'), before);
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[900, 200]]);
  assert.equal((await ledger.confirmAdjustment(confirmation)).replayed, true);
  assert.equal(await ledger.isMonthClosed('2026-10'), true);
});

test('同時確認相同操作只生效一次；兩個同版本預覽只允許其中一個確認', async (t) => {
  const ledger = await setup(t);
  const input = await request(ledger, 'fund', { to: 'trip', amount: 100 });
  const preview = await ledger.previewAdjustment(input);
  const confirmation = { ...input, previewToken: preview.previewToken };
  const same = await Promise.all([ledger.confirmAdjustment(confirmation), ledger.confirmAdjustment(confirmation)]);
  assert.deepEqual(same.map((r) => r.replayed), [false, true]);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, 7900);
  const first = await request(ledger, 'fund', { to: 'trip', amount: 100 });
  const second = await request(ledger, 'fund', { to: 'food', amount: 100 });
  const [a, b] = await Promise.all([ledger.previewAdjustment(first), ledger.previewAdjustment(second)]);
  const results = await Promise.allSettled([
    ledger.confirmAdjustment({ ...first, previewToken: a.previewToken }), ledger.confirmAdjustment({ ...second, previewToken: b.previewToken }),
  ]);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected']);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, 7800);
  assert.equal((await ledger.listBudgetAdjustments()).length, 2);
});
