// 只用合成資料，從帳本服務操作真正的 SQLite。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type Ledger, type BudgetCommand } from './index.ts';

const NOW = new Date('2027-04-11T04:00:00Z');
async function setup(t: TestContext, now = () => NOW): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now });
  t.after(() => ledger.close());
  await ledger.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(),
    revisions: [{ id: 'caps', month: '2026-09', limits: [], mapping: {}, tuition: 0,
      reason: '合成上限', actor: 'test', time: NOW.toISOString() }],
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 10000, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }],
  }));
  return ledger;
}
const INPUT = { name: '合成分期', totalAmount: 1000, monthlyPayment: 300, remainingPrincipal: 1000, expectedEndMonth: '2027-01' };
async function request(ledger: Ledger, fields = {}) {
  return { ...INPUT, reason: '合成設定原因', hasEntitlement: true, version: (await ledger.getBudgetStatus()).version, ...fields };
}
async function command(ledger: Ledger, fields: Partial<BudgetCommand> & { action: string }) {
  const status = await ledger.getBudgetStatus();
  return ledger.runBudgetCommand({ operationId: randomUUID(), version: status.version, month: status.openMonth,
    reason: '合成貸款驗證', ...fields });
}

test('建立與修改貸款，提供獨立支出分類並保留已宣告本金', async (t) => {
  const ledger = await setup(t);
  const { id } = await ledger.createLoan(await request(ledger));
  const [loan] = await ledger.listLoans();
  assert.equal(loan.id, id);
  assert.equal(loan.name, '合成分期');
  assert.equal(loan.remainingPrincipal, 1000);
  assert.equal(loan.reserve, 0);
  assert.equal(loan.monthlyPayment, 300);
  assert.equal(loan.expectedEndMonth, '2027-01');
  assert.ok((await ledger.listCategories()).some((c) => c.id === loan.categoryId && c.flow === 'expense'));
  await ledger.updateLoan(id, await request(ledger, { name: '合成車貸', monthlyPayment: 250, remainingPrincipal: 800 }));
  const [updated] = await ledger.listLoans();
  assert.equal(updated.name, '合成車貸');
  assert.equal(updated.remainingPrincipal, 800);
  assert.equal(updated.monthlyPayment, 250);
});

async function pay(ledger: Ledger, month: string, amount: number) {
  const [loan] = await ledger.listLoans();
  return ledger.addTransaction({ date: `${month}-05`, categoryId: loan.categoryId!,
    accountId: (await ledger.listAccounts())[0].id, amount, flow: 'expense' });
}

test('實際繳款月結才扣儲備與本金，最後一期提撥剩餘本金，結清後停止', async (t) => {
  const ledger = await setup(t);
  await ledger.createLoan(await request(ledger));
  await pay(ledger, '2026-10', 300);
  const income = (await ledger.listCategories()).find((c) => c.flow === 'income')!;
  await ledger.addTransaction({ date: '2026-10-05', categoryId: income.id, accountId: (await ledger.listAccounts())[0].id,
    amount: 2000, flow: 'income' });
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  assert.equal(preview.summary.surplus, 1700);
  assert.equal(preview.summary.tuition, 0);
  assert.equal(preview.summary.total, 11700);
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[1000, 0]]);
  assert.deepEqual(await ledger.getUnmappedExpenseCategories('2026-10'), []);
  assert.deepEqual((await ledger.getBudgetProgress('2026-10')).unmapped, []);
  const confirmation = { month: '2026-10', hasEntitlement: true, version: preview.version,
    previewToken: preview.previewToken, operationId: randomUUID() };
  await ledger.completeMonthlyClose(confirmation);
  assert.equal((await ledger.completeMonthlyClose(confirmation)).replayed, true);
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[700, 0]]);
  for (const month of ['2026-11', '2026-12']) {
    await pay(ledger, month, 300);
    await command(ledger, { action: 'close', amount: 2000 });
  }
  await pay(ledger, '2027-01', 100);
  await command(ledger, { action: 'close', amount: 2000 });
  assert.equal((await ledger.getBudgetMonth('2027-01')).surplus, 1900);
  assert.equal((await ledger.listLoans())[0].remainingPrincipal, 0);
  await command(ledger, { action: 'close', amount: 2000 });
  assert.equal((await ledger.getBudgetMonth('2027-02')).surplus, 2000);
  assert.equal((await ledger.listLoans('2026-10'))[0].remainingPrincipal, 700);
});

test('多筆貸款逐月提撥計入總開銷，只累積儲備、不自動減本金', async (t) => {
  const ledger = await setup(t);
  await ledger.createLoan(await request(ledger));
  await ledger.createLoan(await request(ledger, { name: '合成學貸', totalAmount: 500, remainingPrincipal: 500, monthlyPayment: 200 }));
  await command(ledger, { action: 'close', amount: 2000 });
  const october = await ledger.getBudgetMonth('2026-10');
  assert.equal(october.surplus, 1500);
  assert.equal(october.tuition, 500);
  assert.equal(october.total, 12000);
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[1000, 300], [500, 200]]);
  await command(ledger, { action: 'close', amount: 2000 });
  assert.equal((await ledger.getBudgetMonth('2026-11')).tuition, 1000);
  assert.deepEqual((await ledger.listLoans('2026-10')).map((l) => l.reserve), [300, 200]);
});

test('貸款寫入拒絕無權益、過期版本及不合法輸入，原因與每次完整設定可回查', async (t) => {
  const ledger = await setup(t);
  for (const fields of [{ hasEntitlement: false }, { version: 999 }, { reason: '' }, { reason: '字'.repeat(301) },
    { totalAmount: 0 }, { monthlyPayment: 0 }, { remainingPrincipal: -1 }, { remainingPrincipal: 1001 },
    { totalAmount: 1.5 }, { expectedEndMonth: '2027-99' }, { name: '' }, { name: '飲食' }]) {
    await assert.rejects(ledger.createLoan(await request(ledger, fields)));
  }
  assert.deepEqual(await ledger.listLoans(), []);
  const { id } = await ledger.createLoan(await request(ledger, { reason: '第一版原因' }));
  await ledger.updateLoan(id, await request(ledger, { monthlyPayment: 200, reason: '調低每月負擔' }));
  assert.deepEqual((await ledger.listLoanRevisions(id)).map((r) => [r.monthlyPayment, r.reason]), [[300, '第一版原因'], [200, '調低每月負擔']]);
});

test('修改貸款使舊月結預覽失效；撤銷重結恢復本金，舊成功確認重送不再扣款', async (t) => {
  const ledger = await setup(t);
  const { id } = await ledger.createLoan(await request(ledger));
  const transaction = await pay(ledger, '2026-10', 300);
  const preview = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  await ledger.updateLoan(id, await request(ledger, { expectedEndMonth: '2027-02' }));
  await assert.rejects(ledger.completeMonthlyClose({ ...preview, operationId: randomUUID(), hasEntitlement: true }), /重新預覽/);
  const fresh = await ledger.previewMonthlyClose({ month: '2026-10', hasEntitlement: true });
  const confirmation = { month: fresh.month, version: fresh.version, previewToken: fresh.previewToken, operationId: randomUUID(), hasEntitlement: true };
  await ledger.completeMonthlyClose(confirmation);
  await command(ledger, { action: 'rollback', month: '2026-10' });
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[1000, 0]]);
  assert.equal((await ledger.completeMonthlyClose(confirmation)).replayed, true);
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-10');
  const old = await ledger.getTransaction(transaction.id);
  await ledger.updateTransaction(transaction.id, { date: old.date, categoryId: old.categoryId, accountId: old.accountId,
    amount: 400, flow: 'expense' });
  await command(ledger, { action: 'close', amount: 2000 });
  assert.deepEqual((await ledger.listLoans()).map((l) => [l.remainingPrincipal, l.reserve]), [[600, -100]]);
});

test('較晚建立與修改的貸款只從當時開放月生效，撤銷較早月份不追溯', async (t) => {
  const ledger = await setup(t);
  const { id } = await ledger.createLoan(await request(ledger));
  await command(ledger, { action: 'close', amount: 2000 });
  const original = await ledger.getBudgetMonth('2026-10');
  await ledger.updateLoan(id, await request(ledger, { name: '合成修改名稱', monthlyPayment: 200, remainingPrincipal: 900 }));
  await ledger.createLoan(await request(ledger, { name: '較晚的合成貸款', monthlyPayment: 50 }));
  await command(ledger, { action: 'rollback', month: '2026-10' });
  const current = await ledger.listLoans();
  assert.equal(current.length, 1);
  assert.equal(current[0].name, '合成分期');
  assert.equal(current[0].monthlyPayment, 300);
  assert.equal(current[0].remainingPrincipal, 1000);
  await command(ledger, { action: 'close', amount: 2000 });
  assert.deepEqual(await ledger.getBudgetMonth('2026-10'), original);
  const next = await ledger.listLoans();
  assert.equal(next.length, 2);
  assert.equal(next[0].remainingPrincipal, 900);
  assert.equal(next[0].monthlyPayment, 200);
});

test('繳款超過本金時整筆月結拒絕，原貸款、資產與最後修改時間都不變', async (t) => {
  const ledger = await setup(t);
  await ledger.createLoan(await request(ledger));
  await pay(ledger, '2026-10', 1100);
  const before = await ledger.listLoans();
  const modified = await ledger.getBackupStatus();
  await assert.rejects(command(ledger, { action: 'close', amount: 2000 }), /超過剩餘本金/);
  assert.deepEqual(await ledger.listLoans(), before);
  assert.deepEqual(await ledger.getBackupStatus(), modified);
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-10');
});

test('貸款分類不能同時指定為一般預算用途，避免重複提撥', async (t) => {
  const ledger = await setup(t);
  await ledger.createLoan(await request(ledger));
  await command(ledger, { action: 'add', name: '合成一般分類', kind: 'reserve', amount: 200 });
  const budget = (await ledger.getBudgetStatus()).categories.find((c) => c.name === '合成一般分類')!;
  for (const fields of [
    { action: 'add', name: INPUT.name, kind: 'reserve', amount: 200 },
    { action: 'edit', from: budget.id, name: INPUT.name, kind: 'reserve', amount: 200 },
    { action: 'map', sourceCategory: INPUT.name, to: budget.id },
  ]) await assert.rejects(command(ledger, fields), /貸款/);
  await pay(ledger, '2026-10', 300);
  assert.equal((await ledger.getBudgetProgress('2026-10')).rows[0].spent, 0);
});

test('貸款寫入更新最後修改時間，查詢與無權益的修改維持唯讀', async (t) => {
  let now = NOW;
  const ledger = await setup(t, () => now);
  now = new Date('2027-04-12T04:00:00Z');
  await ledger.listLoans();
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, NOW.toISOString());
  const { id } = await ledger.createLoan(await request(ledger));
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, now.toISOString());
  const before = await ledger.listLoans();
  now = new Date('2027-04-13T04:00:00Z');
  await assert.rejects(ledger.updateLoan(id, await request(ledger, { hasEntitlement: false, monthlyPayment: 200 })), /付費權益/);
  assert.deepEqual(await ledger.listLoans(), before);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2027-04-12T04:00:00.000Z');
  await ledger.updateLoan(id, await request(ledger, { monthlyPayment: 200 }));
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, now.toISOString());
});
