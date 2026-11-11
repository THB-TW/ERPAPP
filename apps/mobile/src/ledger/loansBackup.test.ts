// 貸款備份整合驗證：只使用合成資料，經帳本服務操作真正的 SQLite。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import type { Migration } from '../db/migrate.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { ledgerMigrations } from './migrations.ts';
import { openLedger, inspectLedgerFile, type Ledger } from './index.ts';

const NOW = new Date('2027-04-11T04:00:00Z');

function workspace(t: TestContext) {
  const directory = mkdtempSync(join(process.cwd(), '.loan-backup-test-'));
  const ledgers: Ledger[] = [];
  t.after(async () => {
    try { for (const ledger of ledgers) await ledger.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  });
  const files = {
    directory,
    open: async (path: string) => openNodeDatabase(path),
    remove: async (path: string) => { rmSync(path, { force: true }); },
  };
  return {
    directory,
    async open(name: string, migrations?: readonly Migration[]) {
      const db = openNodeDatabase(join(directory, name));
      const ledger = await openLedger(db, { now: () => NOW, backupFiles: files, migrations });
      ledgers.push(ledger);
      return { ledger, db };
    },
    async close(ledger: Ledger) {
      await ledger.close();
      ledgers.splice(ledgers.indexOf(ledger), 1);
    },
  };
}

test('跳號至 v10 的貸款帳本可驗證並完整備份還原', async (t) => {
  const w = workspace(t);
  const { ledger: source, db } = await w.open('source.db');
  const { id } = await source.createLoan({ name: '合成備份分期', totalAmount: 1200, monthlyPayment: 300,
    remainingPrincipal: 900, expectedEndMonth: '2027-07', hasEntitlement: true,
    reason: '合成備份設定', version: (await source.getBudgetStatus()).version });
  await source.updateLoan(id, { name: '合成備份分期', totalAmount: 1200, monthlyPayment: 250,
    remainingPrincipal: 900, expectedEndMonth: '2027-08', hasEntitlement: true,
    reason: '合成繳款額調整', version: (await source.getBudgetStatus()).version });
  const before = await source.listLoans();
  const revisions = await source.listLoanRevisions(id);
  assert.equal(revisions.length, 2);
  assert.deepEqual(await inspectLedgerFile(db), { ok: true });
  const backup = await source.exportBackup(join(w.directory, 'export.db'));
  assert.equal((await source.inspectBackup(backup.path)).schemaVersion, 10);
  const { ledger: target } = await w.open('target.db');
  await target.restoreBackup(backup.path);
  assert.deepEqual(await target.listLoans(), before);
  assert.deepEqual(await target.listLoanRevisions(id), revisions);
  assert.deepEqual(await target.listCategories(), await source.listCategories());
});

test('同為 v10 的備份仍會補跑後加入的 v6 遷移', async (t) => {
  const w = workspace(t);
  const { ledger: source } = await w.open('source.db');
  const backup = await source.exportBackup(join(w.directory, 'export.db'));
  const withMiddle: Migration[] = [
    ...ledgerMigrations.filter((m) => m.version < 6),
    { version: 6, async up(tx) {
      await tx.run("INSERT INTO settings (key, value) VALUES ('opening_date', '2026-09-01')");
    } },
    ...ledgerMigrations.filter((m) => m.version > 6),
  ];
  const { ledger: target } = await w.open('target.db', withMiddle);
  await target.restoreBackup(backup.path);
  assert.equal(await target.getOpeningDate(), '2026-09-01');
  assert.equal((await source.inspectBackup(backup.path)).schemaVersion, 10);
});

test('匯入 v5 舊備份轉成待補資料的學費貸款，歷史月結與來源檔不改寫', async (t) => {
  const w = workspace(t);
  const { ledger: source } = await w.open('old.db', ledgerMigrations.filter((m) => m.version <= 5));
  await source.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(),
    revisions: [{ id: 'synthetic-caps', month: '2026-09', limits: [], mapping: {}, tuition: 100,
      reason: '合成舊上限', actor: 'test', time: NOW.toISOString() }],
    months: [{ id: 'synthetic-old-close', month: '2026-09', income: 5000, surplus: 4000,
      rawSpare: 12000, tuition: 1300, balances: {}, changes: {}, expenses: {}, revision: null,
      migrated: true, legacyTotalDifference: -27, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }],
  }));
  const original = await source.exportFinanceDocument();
  const originalMonth = await source.getBudgetMonth('2026-09');
  const backup = await source.exportBackup(join(w.directory, 'old-export.db'));
  const { ledger: target } = await w.open('target.db');
  await target.restoreBackup(backup.path);
  const loans = await target.listLoans();
  assert.equal(loans.length, 1);
  assert.equal(loans[0].name, '學費儲備');
  assert.equal(loans[0].reserve, 1300);
  assert.equal(loans[0].monthlyPayment, 100);
  assert.equal(loans[0].totalAmount, null);
  assert.equal(loans[0].remainingPrincipal, null);
  assert.equal(loans[0].expectedEndMonth, null);
  assert.equal(loans[0].categoryId, null);
  assert.equal(loans[0].needsSetup, true);
  assert.deepEqual(await target.getBudgetMonth('2026-09'), originalMonth);
  assert.equal(await target.exportFinanceDocument(), original);
  assert.equal((await source.inspectBackup(backup.path)).schemaVersion, 5);
  await w.close(target);
  const { ledger: reopened } = await w.open('target.db');
  assert.deepEqual(await reopened.listLoans(), loans);
  await w.close(reopened);
  const { ledger: reopenedAgain } = await w.open('target.db');
  assert.deepEqual(await reopenedAgain.listLoans(), loans);
});

test('多月提撥、繳款與本金快照完整還原，還原後可撤銷重結', async (t) => {
  const w = workspace(t);
  const { ledger: source } = await w.open('source.db');
  await source.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(),
    revisions: [{ id: 'synthetic-caps', month: '2026-09', limits: [], mapping: {}, tuition: 0,
      reason: '合成上限', actor: 'test', time: NOW.toISOString() }],
    months: [{ id: 'synthetic-baseline', month: '2026-09', income: 0, surplus: 0,
      rawSpare: 5000, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
      migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: NOW.toISOString(), actor: 'test' }],
  }));
  await source.createLoan({ name: '合成多月分期', totalAmount: 1000, monthlyPayment: 300,
    remainingPrincipal: 1000, expectedEndMonth: '2027-01', hasEntitlement: true,
    reason: '合成分期設定', version: (await source.getBudgetStatus()).version });
  const [loan] = await source.listLoans();
  const account = (await source.listAccounts())[0];
  for (const [month, payment] of [['2026-10', 0], ['2026-11', 200], ['2026-12', 600], ['2027-01', 200]] as const) {
    if (payment) await source.addTransaction({ date: `${month}-05`, flow: 'expense', amount: payment,
      categoryId: loan.categoryId!, accountId: account.id });
    const status = await source.getBudgetStatus();
    await source.runBudgetCommand({ action: 'close', operationId: randomUUID(), version: status.version,
      month: status.openMonth, reason: '合成月結', amount: 1000 });
  }
  const months = ['2026-10', '2026-11', '2026-12', '2027-01'];
  async function snapshot(ledger: Ledger) {
    return {
      loans: await ledger.listLoans(),
      history: await Promise.all(months.map((month) => ledger.listLoans(month))),
      closes: await Promise.all(months.map((month) => ledger.getBudgetMonth(month))),
      transactions: await ledger.listTransactions('2026-10-01', '2027-01-31'),
      document: await ledger.exportFinanceDocument(),
    };
  }
  const before = await snapshot(source);
  assert.equal(before.loans[0].remainingPrincipal, 0);
  assert.equal(before.loans[0].reserve, 100);
  assert.equal(before.history[1][0].remainingPrincipal, 800);
  assert.equal(before.history[1][0].reserve, 400);
  const backup = await source.exportBackup(join(w.directory, 'export.db'));
  const { ledger: target } = await w.open('target.db');
  await target.restoreBackup(backup.path);
  assert.deepEqual(await snapshot(target), before);
  const status = await target.getBudgetStatus();
  await target.runBudgetCommand({ action: 'rollback', operationId: randomUUID(), version: status.version,
    month: '2027-01', reason: '合成撤銷重結' });
  assert.equal((await target.listLoans())[0].remainingPrincipal, 200);
  assert.equal((await target.listLoans())[0].reserve, 100);
  const rolled = await target.getBudgetStatus();
  await target.runBudgetCommand({ action: 'close', operationId: randomUUID(), version: rolled.version,
    month: rolled.openMonth, reason: '合成重新月結', amount: 1000 });
  assert.equal((await target.listLoans())[0].remainingPrincipal, 0);
  assert.equal((await target.listLoans())[0].reserve, 100);
});
