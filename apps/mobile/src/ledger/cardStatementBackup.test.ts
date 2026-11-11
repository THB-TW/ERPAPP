import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import type { Migration } from '../db/migrate.ts';
import { inspectLedgerFile, openLedger, type Ledger } from './index.ts';
import { ledgerMigrations } from './migrations.ts';

function workspace(t: TestContext) {
  const directory = mkdtempSync(join(process.cwd(), '.card-backup-'));
  const ledgers: Ledger[] = [];
  t.after(async () => {
    for (const ledger of ledgers) await ledger.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    async open(name: string, migrations?: readonly Migration[]) {
      const db = openNodeDatabase(join(directory, name));
      const ledger = await openLedger(db, { migrations,
        now: () => new Date('2026-11-11T04:00:00Z'),
        backupFiles: { directory, open: async (path) => openNodeDatabase(path), remove: async (path) => { rmSync(path, { force: true }); } },
      });
      ledgers.push(ledger);
      return { db, ledger };
    },
  };
}

test('目前版本帳本可檢查；帳單、所屬卡與重複列隨整本備份還原及取代前另存完整復原', async (t) => {
  const w = workspace(t);
  const { db, ledger: source } = await w.open('source.db');
  const card = (await source.listAccounts()).find((a) => a.kind === 'credit_card')!;
  await source.importCardStatement({ accountId: card.id, csv: '2026-10-02,合成商店,100\n2026-10-02,合成商店,100' });
  assert.deepEqual(await inspectLedgerFile(db), { ok: true });
  const exported = await source.exportBackup(join(w.directory, 'export.db'));
  assert.equal((await source.inspectBackup(exported.path)).schemaVersion, 13);
  const { ledger: target } = await w.open('target.db');
  const second = await target.addAccount({ name: '合成其他卡', kind: 'credit_card' });
  await target.importCardStatement({ accountId: second.id, csv: '2026-10-03,合成他店,90' });
  const previous = await target.listCardStatements();
  const restored = await target.restoreBackup(exported.path, { allowOlder: true });
  assert.deepEqual(await target.listCardStatements(), await source.listCardStatements());
  assert.deepEqual(await target.getCardReconciliation('2026-10'), await source.getCardReconciliation('2026-10'));
  await target.restoreBackup(restored.safetyCopyPath, { allowOlder: true });
  assert.deepEqual(await target.listCardStatements(), previous);
});

test('v5 舊備份補上 v11；同為 v11 也會補入稍後合併的 v6，重開不重做遷移', async (t) => {
  const w = workspace(t);
  const { ledger: old } = await w.open('old.db', ledgerMigrations.filter((m) => m.version <= 5));
  await old.updateAccount(2, { openingBalance: 700 });
  const oldFile = await old.exportBackup(join(w.directory, 'v5.db'));
  const { ledger: current } = await w.open('current.db');
  await current.restoreBackup(oldFile.path);
  assert.equal((await current.listAccounts()).find((a) => a.id === 2)?.openingBalance, 700);
  assert.deepEqual(await current.listCardStatements(), []);
  await current.importCardStatement({ accountId: 3, csv: '2026-10-02,合成商店,100' });
  const cardFile = await current.exportBackup(join(w.directory, 'v11.db'));
  const futureMigrations = [...ledgerMigrations.filter((m) => m.version < 6), {
    version: 6, async up(tx) { await tx.run("UPDATE accounts SET opening_balance = opening_balance + 9 WHERE kind = 'bank'"); },
  } satisfies Migration, ...ledgerMigrations.filter((m) => m.version > 6)];
  const { ledger: future } = await w.open('future.db', futureMigrations);
  await future.restoreBackup(cardFile.path);
  assert.equal((await future.listAccounts()).find((a) => a.id === 2)?.openingBalance, 709);
  assert.deepEqual(await future.listCardStatements(), await current.listCardStatements());
  const { ledger: reopened } = await w.open('future.db', futureMigrations);
  assert.equal((await reopened.listAccounts()).find((a) => a.id === 2)?.openingBalance, 709);
});
