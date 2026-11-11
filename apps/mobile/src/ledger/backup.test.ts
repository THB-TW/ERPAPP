// 備份檔匯出與匯入還原（票 16）：真的 SQLite 暫存檔，只經由帳本服務下指令、查結果。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { migrate } from '../db/migrate.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { BACKUP_APPLICATION_ID, inspectBackupFile } from './backup.ts';
import { ledgerMigrations } from './migrations.ts';
import { LedgerError, openLedger, type Ledger } from './index.ts';

const FULL: [string, string] = ['0001-01-01', '9999-12-31'];

/** 可以撥動的時鐘：每個測試自己決定「現在」。 */
function clock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    set(next: string) {
      current = new Date(next);
    },
  };
}

function workspace(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function nodeFiles(dir: string) {
  return {
    directory: dir,
    open: async (path: string) => openNodeDatabase(path),
    remove: async (path: string) => rmSync(path, { force: true }),
  };
}

async function openAt(dir: string, file: string, now: () => Date): Promise<Ledger> {
  return openLedger(openNodeDatabase(join(dir, file)), {
    now,
    backupFiles: nodeFiles(dir),
  });
}

async function spend(ledger: Ledger, date: string, category: string, amount: number, note = '') {
  const c = (await ledger.listCategories()).find((x) => x.name === category)!;
  const a = (await ledger.listAccounts()).find((x) => x.name === '現金')!;
  return ledger.addTransaction({ date, categoryId: c.id, accountId: a.id, flow: c.flow, amount, note });
}

/** 帳本服務查得到的全部內容，用來比對「匯出再匯入後所有查詢結果相同」。 */
async function snapshot(ledger: Ledger) {
  return {
    transactions: await ledger.listTransactions(...FULL),
    categories: await ledger.listCategories(),
    accounts: await ledger.listAccounts(),
    members: await ledger.listMembers(),
    openingDate: await ledger.getOpeningDate(),
    calendar: await ledger.getMonthCalendar('2026-10'),
    document: await ledger.exportFinanceDocument(),
    budget: await ledger.getBudgetStatus(),
  };
}

async function sampleLedger(dir: string, file: string, now: () => Date) {
  const ledger = await openAt(dir, file, now);
  await spend(ledger, '2026-10-03', '飲食', 180, '虛構早餐');
  await spend(ledger, '2026-10-03', '飲食', 180, '同日同額第二筆');
  await spend(ledger, '2026-10-20', '交通', 1280);
  await spend(ledger, '2026-10-25', '薪資', 52000);
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), version: 3 }));
  return ledger;
}

test('帳本有變動才更新最後修改時間；查詢不算變動', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-11-01T01:00:00Z');
  const ledger = await openAt(dir, 'ledger.db', c.now);
  assert.deepEqual(await ledger.getBackupStatus(), { lastBackupAt: null, lastModifiedAt: null, safetyCopyPath: null });

  await spend(ledger, '2026-11-01', '飲食', 90);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-01T01:00:00.000Z');

  c.set('2026-11-02T01:00:00Z');
  await ledger.listTransactions(...FULL);
  await ledger.getMonthCalendar('2026-11');
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-01T01:00:00.000Z');

  // 被拒的指令整筆還原，也不算變動
  await assert.rejects(spend(ledger, '2026-11-02', '飲食', -1));
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-01T01:00:00.000Z');
  await ledger.close();
});

test('匯出的備份檔帶識別標記、結構版本、最後修改時間與匯出時間，並記下上次備份日期', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-10-31T15:00:00Z');
  const ledger = await sampleLedger(dir, 'ledger.db', c.now);
  c.set('2026-11-05T12:30:00Z');

  const out = join(dir, 'export.db');
  const result = await ledger.exportBackup(out);
  assert.deepEqual(result, { path: out, exportedAt: '2026-11-05T12:30:00.000Z' });
  assert.deepEqual(await ledger.getBackupStatus(), {
    lastBackupAt: '2026-11-05T12:30:00.000Z',
    lastModifiedAt: '2026-10-31T15:00:00.000Z', // 記下備份日期不算帳本變動
    safetyCopyPath: null,
  });

  const raw = openNodeDatabase(out);
  assert.equal((await raw.get<{ application_id: number }>('PRAGMA application_id'))?.application_id, BACKUP_APPLICATION_ID);
  assert.equal((await raw.get<{ user_version: number }>('PRAGMA user_version'))?.user_version, ledgerMigrations.length);
  await raw.close();

  const info = await ledger.inspectBackup(out);
  assert.deepEqual(info, {
    schemaVersion: ledgerMigrations.length,
    lastModifiedAt: '2026-10-31T15:00:00.000Z',
    exportedAt: '2026-11-05T12:30:00.000Z',
    olderThanCurrent: false,
  });
  await ledger.close();
});

test('不覆寫已存在的檔案；匯出失敗時上次備份日期不變', async (t) => {
  const dir = workspace(t);
  const ledger = await sampleLedger(dir, 'ledger.db', clock('2026-11-01T00:00:00Z').now);
  const out = join(dir, 'taken.db');
  writeFileSync(out, '別人的檔案');
  await assert.rejects(ledger.exportBackup(out), (e) => e instanceof LedgerError && e.code === 'backup_failed');
  assert.equal((await ledger.getBackupStatus()).lastBackupAt, null);
  await ledger.close();
});

test('在另一支手機匯入備份檔：整本取代，所有查詢結果與原本相同', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-11-01T00:00:00Z');
  const source = await sampleLedger(dir, 'old-phone.db', c.now);
  const before = await snapshot(source);
  c.set('2026-11-02T00:00:00Z');
  const exported = await source.exportBackup(join(dir, 'export.db'));
  await source.close();

  // 新手機上已經記了一筆（會被整本取代，不合併）
  c.set('2026-10-01T00:00:00Z');
  const target = await openAt(dir, 'new-phone.db', c.now);
  await spend(target, '2026-09-30', '娛樂', 999, '會被取代');
  c.set('2026-11-03T00:00:00Z');

  const result = await target.restoreBackup(exported.path);
  assert.deepEqual(await snapshot(target), before);
  assert.deepEqual(await target.getBackupStatus(), {
    lastBackupAt: '2026-11-02T00:00:00.000Z', // 這份備份本身就是一份備份
    lastModifiedAt: '2026-11-01T00:00:00.000Z',
    safetyCopyPath: result.safetyCopyPath,
  });
  assert.equal(result.schemaVersion, ledgerMigrations.length);

  // 還原後照常記帳，編號接在後面、不撞號
  await spend(target, '2026-11-03', '飲食', 50);
  assert.equal((await target.listTransactions(...FULL)).length, before.transactions.length + 1);
  await target.close();
});

test('取代前自動把目前的帳另存一份，選錯時可以用它復原', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-11-01T00:00:00Z');
  const source = await sampleLedger(dir, 'a.db', c.now);
  const exported = await source.exportBackup(join(dir, 'export.db'));
  await source.close();

  c.set('2026-11-05T00:00:00Z');
  const target = await openAt(dir, 'b.db', c.now);
  await spend(target, '2026-11-05', '娛樂', 777, '手機上原本的帳');
  const mine = await snapshot(target);

  c.set('2026-11-06T00:00:00Z');
  const result = await target.restoreBackup(exported.path, { allowOlder: true });
  assert.ok(existsSync(result.safetyCopyPath));
  assert.ok(result.safetyCopyPath.startsWith(dir));
  assert.notDeepEqual(await snapshot(target), mine);

  // 另存檔本身就是合格的備份檔，可以原路復原
  const undo = await target.restoreBackup(result.safetyCopyPath, { allowOlder: true });
  assert.deepEqual(await snapshot(target), mine);
  assert.notEqual(undo.safetyCopyPath, result.safetyCopyPath);
  await target.close();
});

test('另存檔只留最近一份，關掉 App 再開仍找得到；復原後舊的另存檔會清掉', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-11-01T00:00:00Z');
  const source = await sampleLedger(dir, 'a.db', c.now);
  const exported = await source.exportBackup(join(dir, 'export.db'));
  await source.close();

  c.set('2026-11-05T00:00:00Z');
  let target = await openAt(dir, 'b.db', c.now);
  await spend(target, '2026-11-05', '娛樂', 777, '手機上原本的帳');
  const first = await target.restoreBackup(exported.path, { allowOlder: true });
  await target.close();

  target = await openAt(dir, 'b.db', c.now); // 重開 App
  assert.equal((await target.getBackupStatus()).safetyCopyPath, first.safetyCopyPath);

  c.set('2026-11-06T00:00:00Z');
  const second = await target.restoreBackup(first.safetyCopyPath, { allowOlder: true });
  assert.equal((await target.getBackupStatus()).safetyCopyPath, second.safetyCopyPath);
  assert.ok(existsSync(second.safetyCopyPath));
  assert.ok(!existsSync(first.safetyCopyPath), '上一份另存檔應該已清掉');
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('restore-staging')), [], '暫存檔不殘留');
  await target.close();
});

test('要匯入的備份比目前的帳舊時先警告；確認後才取代', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-10-01T00:00:00Z');
  const source = await sampleLedger(dir, 'a.db', c.now);
  const exported = await source.exportBackup(join(dir, 'export.db'));
  await source.close();

  c.set('2026-11-01T00:00:00Z');
  const target = await openAt(dir, 'b.db', c.now);
  await spend(target, '2026-11-01', '飲食', 100, '比備份新的帳');
  const mine = await snapshot(target);

  assert.equal((await target.inspectBackup(exported.path)).olderThanCurrent, true);
  await assert.rejects(target.restoreBackup(exported.path), (e) => e instanceof LedgerError && e.code === 'backup_older');
  assert.deepEqual(await snapshot(target), mine); // 沒有被動到

  await target.restoreBackup(exported.path, { allowOlder: true });
  assert.equal((await target.listTransactions(...FULL)).length, 4);
  await target.close();
});

test('全新沒有記過帳的手機匯入備份不需要警告', async (t) => {
  const dir = workspace(t);
  const c = clock('2026-10-01T00:00:00Z');
  const source = await sampleLedger(dir, 'a.db', c.now);
  const exported = await source.exportBackup(join(dir, 'export.db'));
  await source.close();
  c.set('2026-12-01T00:00:00Z');
  const target = await openAt(dir, 'b.db', c.now);
  assert.equal((await target.inspectBackup(exported.path)).olderThanCurrent, false);
  await target.restoreBackup(exported.path);
  assert.equal((await target.listTransactions(...FULL)).length, 4);
  await target.close();
});

test('不是本 App 的檔案被拒並說明，帳本不受影響', async (t) => {
  const dir = workspace(t);
  const ledger = await sampleLedger(dir, 'ledger.db', clock('2026-11-01T00:00:00Z').now);
  const before = await snapshot(ledger);

  const text = join(dir, 'note.txt');
  writeFileSync(text, '這不是資料庫'.repeat(200));
  const otherSqlite = join(dir, 'other.sqlite');
  const other = openNodeDatabase(otherSqlite);
  await other.exec('CREATE TABLE photos (id INTEGER PRIMARY KEY); PRAGMA user_version = 1;');
  await other.close();
  const empty = join(dir, 'empty.db');
  writeFileSync(empty, '');

  for (const file of [text, otherSqlite, empty, join(dir, 'missing.db')]) {
    await assert.rejects(ledger.inspectBackup(file), (e) => e instanceof LedgerError && e.code === 'invalid_backup' && /不是這個 App 的備份檔/.test(e.message), file);
    await assert.rejects(ledger.restoreBackup(file, { allowOlder: true }), (e) => e instanceof LedgerError && e.code === 'invalid_backup', file);
  }
  assert.deepEqual(await snapshot(ledger), before);
  await ledger.close();
});

test('結構版本比 App 新的備份被拒，請使用者先更新 App', async (t) => {
  const dir = workspace(t);
  const ledger = await sampleLedger(dir, 'ledger.db', clock('2026-11-01T00:00:00Z').now);
  const exported = await ledger.exportBackup(join(dir, 'export.db'));
  const raw = openNodeDatabase(exported.path);
  await raw.exec(`PRAGMA user_version = ${ledgerMigrations.length + 1}`);
  await raw.close();

  await assert.rejects(ledger.restoreBackup(exported.path, { allowOlder: true }), (e) =>
    e instanceof LedgerError && e.code === 'backup_too_new' && /更新 App/.test(e.message));
  await ledger.close();
});

test('完整性檢查不過的備份被拒', async (t) => {
  const dir = workspace(t);
  const ledger = await sampleLedger(dir, 'ledger.db', clock('2026-11-01T00:00:00Z').now);
  const exported = await ledger.exportBackup(join(dir, 'export.db'));
  // 外鍵指到不存在的分類：檔案本身還是 SQLite，但內容不一致
  const raw = openNodeDatabase(exported.path);
  await raw.exec('PRAGMA foreign_keys = OFF');
  await raw.exec('UPDATE transactions SET category_id = 9999 WHERE id = 1');
  await raw.close();

  const before = await snapshot(ledger);
  await assert.rejects(ledger.restoreBackup(exported.path, { allowOlder: true }), (e) =>
    e instanceof LedgerError && e.code === 'backup_corrupt');
  assert.deepEqual(await snapshot(ledger), before);
  await ledger.close();
});

test('結構版本較舊的備份先遷移再取代', async (t) => {
  const dir = workspace(t);
  const ledger = await sampleLedger(dir, 'ledger.db', clock('2026-11-01T00:00:00Z').now);
  const exported = await ledger.exportBackup(join(dir, 'export.db'));
  const expected = await snapshot(ledger);
  await ledger.close();

  // 模擬之後的 App 版本多了一個遷移：同一份備份對它來說是較舊的結構
  const newer = [...ledgerMigrations, {
    version: ledgerMigrations.length + 1,
    async up(tx: { exec(sql: string): Promise<void> }) {
      await tx.exec("ALTER TABLE transactions ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
    },
  }];
  const files = nodeFiles(dir);
  const info = await inspectBackupFile(files, exported.path, newer.length, null);
  assert.equal(info.schemaVersion, ledgerMigrations.length);

  const live = openNodeDatabase(join(dir, 'newer-app.db'));
  await migrate(live, newer);
  const app = await openLedger(live, { backupFiles: files, migrations: newer });
  await app.restoreBackup(exported.path);
  assert.deepEqual(await snapshot(app), expected);
  assert.equal((await live.get<{ user_version: number }>('PRAGMA user_version'))?.user_version, newer.length);
  await app.close();
});

test('沒有接上檔案位置時，備份指令說明無法使用', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  await assert.rejects(ledger.exportBackup('/tmp/x.db'), (e) => e instanceof LedgerError && e.code === 'backup_unavailable');
  await ledger.close();
});
