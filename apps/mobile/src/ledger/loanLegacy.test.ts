// 舊帳全部為合成資料；不讀私人帳本，不更動舊帳比對基準。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { shiftMonth } from '../calc/dates.ts';
import { ledgerMigrations } from './migrations.ts';
import { openLedger } from './index.ts';

const NOW = new Date('2027-01-11T00:00:00Z');
function history(count: number) {
  const state = emptyBudgetState();
  state.categories = [{ id: 'food', name: '飲食', kind: 'reserve' }];
  state.revisions = [{ id: 'old-caps', month: '2020-01', limits: [{ categoryId: 'food', amount: 500 }],
    mapping: { 飲食: 'food' }, tuition: 100, reason: '合成舊上限', actor: 'test', time: NOW.toISOString() }];
  state.months = Array.from({ length: count }, (_, i) => ({
    id: `synthetic-${i}`, month: shiftMonth('2020-01', i), income: 1000, surplus: 400,
    rawSpare: 1000 + i * 400, tuition: 200 + i * 100, balances: { food: 50 + i * 20 },
    changes: { food: 20 }, expenses: { food: 480 }, revision: i === 0 ? null : state.revisions[0],
    migrated: true, legacyTotalDifference: i < 17 ? 3 : 0, legacyBalanceAnchor: 0,
    time: NOW.toISOString(), actor: 'test',
  }));
  return state;
}

test('v5 升 v10 保留合成 58 月全部快照與 17 個歷史差異，學費只轉一次且不猜本金', async (t) => {
  const db = openNodeDatabase(':memory:');
  const old = await openLedger(db, { now: () => NOW, migrations: ledgerMigrations.filter((m) => m.version <= 5) });
  await old.importFinanceDocument(serializeBudgetDocument(history(58)));
  const before = await old.listBudgetMonths();
  const snapshots = await Promise.all(before.map((m) => old.getBudgetMonth(m.month)));
  const document = await old.exportFinanceDocument();
  const categories = await old.listCategories();
  const migrated = await openLedger(db, { now: () => NOW });
  t.after(() => migrated.close());
  assert.deepEqual(await migrated.listBudgetMonths(), before);
  assert.deepEqual(await Promise.all(before.map((m) => migrated.getBudgetMonth(m.month))), snapshots);
  assert.equal(await migrated.exportFinanceDocument(), document);
  assert.deepEqual(await migrated.listCategories(), categories);
  const [loan] = await migrated.listLoans();
  assert.equal(loan.name, '學費儲備');
  assert.equal(loan.reserve, 5900);
  assert.equal(loan.monthlyPayment, 100);
  assert.equal(loan.totalAmount, null);
  assert.equal(loan.remainingPrincipal, null);
  assert.equal(loan.expectedEndMonth, null);
  assert.equal(loan.categoryId, null);
  assert.equal(loan.needsSetup, true);
  const reopened = await openLedger(db, { now: () => NOW });
  assert.equal((await reopened.listLoans()).length, 1);
});

test('舊學費與新貸款只有提撥時，逐月月結數字完全相同', async (t) => {
  const old = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW, migrations: ledgerMigrations.filter((m) => m.version <= 5) });
  const current = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(async () => { await old.close(); await current.close(); });
  const state = history(1);
  state.months[0].legacyTotalDifference = 0;
  for (const ledger of [old, current]) await ledger.importFinanceDocument(serializeBudgetDocument(state));
  for (let i = 0; i < 4; i++) {
    for (const ledger of [old, current]) {
      const status = await ledger.getBudgetStatus();
      await ledger.runBudgetCommand({ action: 'close', version: status.version, month: status.openMonth,
        operationId: randomUUID(), reason: '合成逐月提撥', amount: 1000 });
    }
    assert.deepEqual(await current.listBudgetMonths(), await old.listBudgetMonths());
  }
  assert.equal((await current.listLoans())[0].reserve, 600);
});

test('貸款名稱不能重用待補學費貸款或既有預算別名，補齊本金後只用新設定提撥', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  const state = history(1);
  state.months[0].legacyTotalDifference = 0;
  state.revisions[0].mapping['合成預算別名'] = 'food';
  await ledger.importFinanceDocument(serializeBudgetDocument(state));
  const input = { name: '學費儲備', totalAmount: 1000, monthlyPayment: 150, remainingPrincipal: 800,
    expectedEndMonth: '2027-06', hasEntitlement: true, reason: '補齊合成實際本金', version: (await ledger.getBudgetStatus()).version };
  await assert.rejects(ledger.createLoan(input), /名稱/);
  await assert.rejects(ledger.createLoan({ ...input, name: '合成預算別名' }), /名稱/);
  const [legacy] = await ledger.listLoans();
  await ledger.updateLoan(legacy.id, input);
  const [ready] = await ledger.listLoans();
  assert.equal(ready.reserve, 200);
  assert.equal(ready.remainingPrincipal, 800);
  assert.equal(ready.needsSetup, false);
  await ledger.addTransaction({ date: '2020-02-05', amount: 100, categoryId: ready.categoryId!,
    accountId: (await ledger.listAccounts())[0].id, flow: 'expense' });
  const status = await ledger.getBudgetStatus();
  await ledger.runBudgetCommand({ action: 'close', operationId: randomUUID(), version: status.version,
    month: status.openMonth, reason: '合成補齊後月結', amount: 1000 });
  assert.equal((await ledger.getBudgetMonth('2020-02')).surplus, 350);
  assert.equal((await ledger.getBudgetMonth('2020-02')).tuition, 250);
  assert.equal((await ledger.listLoans())[0].remainingPrincipal, 700);
  assert.equal((await ledger.listLoans())[0].reserve, 250);
  assert.equal((await ledger.getBudgetMonth('2020-01')).tuition, 200);
});
