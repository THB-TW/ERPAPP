// 票 13：合成帳本經服務入口驗證核對紀錄持久化、備份與還原。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type Ledger } from './index.ts';

const REQUEST = { month: '2026-10', hasEntitlement: true };
const LEGACY_CHECK = { Id: 'synthetic-legacy-check', Month: '2026-09', Input: { Cash: 7 }, Result: { Diff: 17 } };

async function workspace(t: TestContext) {
  const directory = mkdtempSync(join(process.cwd(), '.asset-check-backup-'));
  const ledgers = new Set<Ledger>();
  let now = new Date('2026-11-11T01:00:00Z');
  t.after(async () => {
    try { for (const ledger of ledgers) await ledger.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  });
  return {
    directory,
    setTime(iso: string) { now = new Date(iso); },
    async open(file: string) {
      const ledger = await openLedger(openNodeDatabase(join(directory, file)), {
        now: () => now,
        backupFiles: {
          directory,
          open: async (path) => openNodeDatabase(path),
          remove: async (path) => { rmSync(path, { force: true }); },
        },
      });
      ledgers.add(ledger);
      return ledger;
    },
    async close(ledger: Ledger) {
      await ledger.close();
      ledgers.delete(ledger);
    },
  };
}

async function seed(ledger: Ledger) {
  await ledger.importLegacyLedger({
    openingDate: '2026-10-01',
    accounts: [{ name: '合成銀行', kind: 'bank', openingBalance: 1000 }, { name: '合成現金', kind: 'cash', openingBalance: 0 }],
    categories: [{ name: '合成支出', flow: 'expense' }, { name: '合成收入', flow: 'income' }],
    members: [], transactions: [],
    document: serializeBudgetDocument({
      ...emptyBudgetState(), version: 1,
      categories: [{ id: 'synthetic-expense', name: '合成支出', kind: 'actual' }],
      revisions: [{ id: 'synthetic-caps', month: '2026-10', limits: [{ categoryId: 'synthetic-expense', amount: 0 }],
        mapping: { 合成支出: 'synthetic-expense' }, tuition: 0, reason: '合成上限', actor: 'test', time: '2026-11-11T01:00:00Z' }],
      months: [{ id: 'synthetic-baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 1000, tuition: 0,
        balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
        legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-11T01:00:00Z', actor: 'test' }],
      checks: [LEGACY_CHECK],
    }),
  });
  await ledger.addTransaction({ date: '2026-11-01', categoryId: 2, accountId: 1, flow: 'income', amount: 50 });
  await ledger.addTransfer({ date: '2026-11-02', fromAccountId: 1, toAccountId: 2, amount: 20, note: '合成領現' });
}

async function record(ledger: Ledger, bankBalance?: number) {
  const input = { ...REQUEST, balances: bankBalance === undefined ? undefined : [{ accountId: 1, balance: bankBalance }] };
  const preview = await ledger.previewAssetCheck(input);
  const request = { ...input, operationId: randomUUID(), checkToken: preview.checkToken };
  return { request, saved: await ledger.recordAssetCheck(request) };
}

test('保存核對才更新最後修改時間；查詢與重送不改時間，關閉重開保留輸入及倒回明細', async (t) => {
  const w = await workspace(t);
  let ledger = await w.open('ledger.db');
  await seed(ledger);
  const previousModified = (await ledger.getBackupStatus()).lastModifiedAt;
  w.setTime('2026-11-11T02:00:00Z');
  await ledger.previewAssetCheck(REQUEST);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, previousModified);

  const { request, saved } = await record(ledger, 1030);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-11T02:00:00.000Z');
  assert.equal(saved.result.difference, 0);
  assert.deepEqual(saved.result.accounts[0].movements.map((m) => [m.kind, m.adjustment]), [['income', -50], ['transfer_out', 20]]);
  const document = await ledger.exportFinanceDocument();

  w.setTime('2026-11-12T02:00:00Z');
  assert.deepEqual(await ledger.recordAssetCheck(request), saved);
  assert.deepEqual(await ledger.listAssetChecks('2026-10'), [saved]);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-11T02:00:00.000Z');
  await w.close(ledger);
  ledger = await w.open('ledger.db');
  assert.deepEqual(await ledger.listAssetChecks(), [saved]);
  assert.deepEqual(await ledger.recordAssetCheck(request), saved);
  assert.equal(await ledger.exportFinanceDocument(), document);
});

test('備份還原完整保存核對、月結快照與成功重送收據；另存檔可復原原有不同核對', async (t) => {
  const w = await workspace(t);
  const source = await w.open('source.db');
  await seed(source);
  w.setTime('2026-11-11T02:00:00Z');
  const { request: checkRequest, saved } = await record(source);
  w.setTime('2026-11-11T03:00:00Z');
  const closeRequest = { ...await source.previewMonthlyClose(REQUEST), hasEntitlement: true,
    operationId: randomUUID(), assetCheckId: saved.id };
  assert.deepEqual(await source.completeMonthlyClose(closeRequest), { version: 3, replayed: false });
  const snapshot = await source.getMonthlyCloseSnapshot('2026-10');
  const document = await source.exportFinanceDocument();
  const sourceChecks = await source.listAssetChecks();
  const modified = (await source.getBackupStatus()).lastModifiedAt;
  w.setTime('2026-11-11T04:00:00Z');
  const exported = await source.exportBackup(join(w.directory, 'export.db'));

  const target = await w.open('target.db');
  await seed(target);
  w.setTime('2026-11-11T05:00:00Z');
  const { saved: targetCheck } = await record(target, 930);
  assert.equal(targetCheck.result.difference, -100);
  const targetDocument = await target.exportFinanceDocument();
  const restored = await target.restoreBackup(exported.path, { allowOlder: true });
  assert.deepEqual(await target.listAssetChecks(), sourceChecks);
  assert.deepEqual(await target.getMonthlyCloseSnapshot('2026-10'), snapshot);
  assert.equal(await target.exportFinanceDocument(), document);
  assert.equal((await target.getBackupStatus()).lastModifiedAt, modified);
  assert.deepEqual(await target.recordAssetCheck(checkRequest), saved);
  assert.deepEqual(await target.completeMonthlyClose(closeRequest), { version: 3, replayed: true });
  await assert.rejects(target.completeMonthlyClose({ ...closeRequest, assetCheckId: targetCheck.id }), /識別碼/);

  await target.restoreBackup(restored.safetyCopyPath, { allowOlder: true });
  assert.deepEqual(await target.listAssetChecks(), [targetCheck]);
  assert.equal(await target.exportFinanceDocument(), targetDocument);
  assert.equal(await target.isMonthClosed('2026-10'), false);
  assert.equal((await target.getBackupStatus()).lastModifiedAt, '2026-11-11T05:00:00.000Z');
});
