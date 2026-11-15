import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type Ledger } from './index.ts';

async function setup(includeOther = true) {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => new Date('2026-11-15T04:00:00Z') });
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(),
    categories: [{ id: 'food', name: '飲食', kind: 'reserve' }, ...(includeOther ? [{ id: 'other', name: '其他', kind: 'reserve' as const }] : [])],
    revisions: [{ id: 'oct', month: '2026-10', limits: [{ categoryId: 'food', amount: 1000 }, ...(includeOther ? [{ categoryId: 'other', amount: 100 }] : [])],
      mapping: includeOther ? { 飲食: 'food', 其他: 'other' } : { 飲食: 'food' }, tuition: 0, reason: '合成', actor: 'test', time: '' }],
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 3000, tuition: 0,
      balances: includeOther ? {food: 100, other: 50} : {food: 100}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '' }] }));
  const category = (await ledger.listCategories()).find(c => c.name === '交通')!;
  await ledger.addTransaction({ date: '2026-10-10', categoryId: category.id, accountId: (await ledger.listAccounts())[0].id, flow: 'expense', amount: 350 });
  return ledger;
}
async function command(ledger: Ledger, fields: Record<string, unknown>) {
  const status = await ledger.getBudgetStatus();
  return ledger.runBudgetCommand({ operationId: randomUUID(), version: status.version, month: status.openMonth,
    reason: '合成驗證', action: 'close', ...fields });
}

test('未歸屬支出進度與月結計入其他，已結歷史不變；之後指定歸屬從開放月改計', async t => {
  const ledger = await setup(); t.after(() => ledger.close());
  const old = await ledger.getBudgetMonth('2026-09');
  const progress = await ledger.getBudgetProgress('2026-10');
  assert.equal(progress.rows.find(r => r.name === '其他')!.spent, 350);
  assert.deepEqual(progress.unmapped, []);
  await command(ledger, { action: 'close', amount: 5000 });
  const october = await ledger.getBudgetMonth('2026-10');
  assert.equal(october.reserves.find(r => r.name === '其他')!.balance, -200);
  await command(ledger, { action: 'map', sourceCategory: '交通', to: 'food' });
  const category = (await ledger.listCategories()).find(c => c.name === '交通')!;
  await ledger.addTransaction({ date: '2026-11-10', categoryId: category.id, accountId: (await ledger.listAccounts())[0].id, flow: 'expense', amount: 200 });
  assert.equal((await ledger.getBudgetProgress('2026-11')).rows.find(r => r.name === '飲食')!.spent, 200);
  assert.deepEqual(await ledger.getBudgetMonth('2026-09'), old);
  assert.deepEqual(await ledger.getBudgetMonth('2026-10'), october);
});

test('其他只能改上限，不能停用、改名或改成非儲備類', async t => {
  const ledger = await setup(); t.after(() => ledger.close());
  await assert.rejects(command(ledger, { action: 'retire', from: 'other', to: 'food' }), /其他.*固定/);
  await assert.rejects(command(ledger, { action: 'edit', from: 'other', name: '任意', kind: 'reserve', amount: 100 }), /其他.*固定/);
  await assert.rejects(command(ledger, { action: 'edit', from: 'other', name: '其他', kind: 'actual', amount: 0 }), /其他.*固定/);
  await command(ledger, { action: 'edit', from: 'other', name: '其他', kind: 'reserve', amount: 400 });
  assert.equal((await ledger.getBudgetProgress('2026-10')).rows.find(r => r.name === '其他')!.cap, 400);
});

test('缺少其他的舊帳可補上固定儲備，保留歷史基準與月結數字', async t => {
  const ledger = await setup(false); t.after(() => ledger.close());
  const historical = await ledger.getBudgetMonth('2026-09');
  const other = (await ledger.getBudgetStatus()).categories.find(c => c.name === '其他');
  assert.ok(other?.active);
  assert.equal(other.kind, 'reserve');
  assert.equal((await ledger.getBudgetProgress('2026-10')).rows.find(r => r.name === '其他')!.spent, 350);
  await command(ledger, { action: 'close', amount: 5000 });
  assert.equal((await ledger.getBudgetMonth('2026-10')).reserves.find(r => r.name === '其他')!.balance, -350);
  assert.deepEqual(await ledger.getBudgetMonth('2026-09'), historical);
});

test('跨貸款與一般支出合計超過安全整數時拒絕進度查詢', async t => {
  const ledger = await setup(); t.after(() => ledger.close());
  await ledger.createLoan({ name: '合成貸款', totalAmount: 1000, monthlyPayment: 100, remainingPrincipal: 1000,
    expectedEndMonth: '2027-01', reason: '合成', hasEntitlement: true, version: (await ledger.getBudgetStatus()).version });
  const loan = (await ledger.listLoans())[0];
  await ledger.addTransaction({ date: '2026-10-15', categoryId: loan.categoryId!, accountId: (await ledger.listAccounts())[0].id, flow: 'expense', amount: Number.MAX_SAFE_INTEGER });
  await assert.rejects(ledger.getBudgetProgress('2026-10'), /安全|範圍/);
});

test('只有舊期初基準且沒有上限版本的帳本也能補上其他', async t => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  t.after(() => ledger.close());
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), months: [{
    id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 2000, tuition: 0,
    balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
    legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '',
  }] }));
  assert.equal((await ledger.getBudgetStatus()).categories.find(c => c.name === '其他')?.kind, 'reserve');
  assert.equal((await ledger.getBudgetMonth('2026-09')).total, 2000);
});
