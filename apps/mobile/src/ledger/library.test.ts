// 多帳本（ADR 0008）：帳本清單、切換、備份包、舊單本備份、全 App 共用提醒。資料全部虛構。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { LedgerError, openLedger } from './index.ts';
import { openLedgerLibrary, type LibraryFiles } from './library.ts';

const NOW = new Date('2026-11-25T04:00:00Z');

function nodeFiles(directory: string): LibraryFiles {
  return {
    directory,
    open: async (path) => openNodeDatabase(path),
    remove: async (path) => { for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(path + suffix, { force: true }); },
    readBytes: async (path) => new Uint8Array(readFileSync(path)),
    writeBytes: async (path, bytes) => writeFileSync(path, bytes),
  };
}
function folder(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-library-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function rejects(code: string, promise: Promise<unknown>) {
  await assert.rejects(promise, (e: unknown) => e instanceof LedgerError && e.code === code, code);
}
async function spend(ledger: Awaited<ReturnType<typeof openLedger>>, amount: number) {
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  return ledger.addTransaction({ date: '2026-11-20', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount });
}

test('既有的 ledger.db 成為第一本，內容不動；提醒與上次備份時間搬成全 App 共用', async (t) => {
  const dir = folder(t);
  const old = await openLedger(openNodeDatabase(join(dir, 'ledger.db')), { now: () => NOW });
  await spend(old, 321);
  const settings = await old.getNotificationSettings();
  await old.saveNotificationSettings({ ...settings, entryTime: '22:30', enabled: { ...settings.enabled, entry: true, backupOverdue: true } });
  await old.close();

  const library = await openLedgerLibrary({ files: nodeFiles(dir), now: () => NOW });
  t.after(() => library.close());
  assert.deepEqual(await library.listLedgers(), [{ id: library.currentLedgerId(), name: '我的帳本' }]);
  assert.equal((await library.current().getDayTransactions('2026-11-20'))[0].amount, 321);
  assert.deepEqual(await library.getReminders(), { entry: true, entryTime: '22:30', backupAfterClose: false, backupOverdue: true });
  assert.equal((await library.getNotificationGlobals()).backupStartedAt, NOW.toISOString());
});

test('新增、改名、排序、切換與刪除：各帳本完全獨立；名稱必填不重複；最多 10 本；最後一本不能刪', async (t) => {
  const dir = folder(t);
  const library = await openLedgerLibrary({ files: nodeFiles(dir), now: () => NOW });
  t.after(() => library.close());
  const firstId = library.currentLedgerId();
  await spend(library.current(), 100);
  const family = await library.addLedger('  家庭 ');
  assert.equal(family.name, '家庭');
  await rejects('ledger_name_conflict', library.addLedger('家庭'));
  await rejects('invalid_ledger_name', library.addLedger('   '));
  assert.equal(library.currentLedgerId(), firstId); // 新增不自動切換

  const ledger = await library.switchLedger(family.id);
  assert.equal(library.currentLedgerId(), family.id);
  assert.deepEqual(await ledger.getDayTransactions('2026-11-20'), []); // 獨立的帳
  assert.equal((await ledger.getOnboardingStatus()).completed, false); // 新帳本要走開帳
  assert.deepEqual((await ledger.listCategories()).filter((c) => c.flow === 'income').map((c) => c.name), ['薪資']);
  assert.deepEqual((await ledger.listMembers()).map((m) => m.name), ['自己']);

  await library.renameLedger(family.id, '家用');
  await library.reorderLedgers([family.id, firstId]);
  assert.deepEqual((await library.listLedgers()).map((l) => l.name), ['家用', '我的帳本']);
  await rejects('unknown_ledger', library.reorderLedgers([family.id]));

  for (let i = 3; i <= 10; i++) await library.addLedger(`帳本${i}`);
  await rejects('ledger_limit', library.addLedger('第十一本'));

  await library.deleteLedger(family.id); // 刪目前帳本：切到清單第一本
  assert.equal(library.currentLedgerId(), firstId);
  assert.equal((await library.current().getDayTransactions('2026-11-20'))[0].amount, 100);
  for (const l of (await library.listLedgers()).filter((l) => l.id !== firstId)) await library.deleteLedger(l.id);
  await rejects('last_ledger', library.deleteLedger(firstId));
});

test('備份包含全部帳本；整包取代後順序、名稱與內容都回來；上次備份時間全 App 共用', async (t) => {
  const dir = folder(t);
  let clock = NOW;
  const library = await openLedgerLibrary({ files: nodeFiles(dir), now: () => clock });
  t.after(() => library.close());
  await spend(library.current(), 111);
  const second = await library.addLedger('旅行');
  await spend(await library.switchLedger(second.id), 222);

  const path = join(dir, 'bundle.erpbackup');
  const { exportedAt } = await library.exportBackup(path);
  assert.equal((await library.getBackupStatus()).lastBackupAt, null); // 確定送出後才記
  await library.recordBackupDelivered(exportedAt);
  assert.equal((await library.getNotificationGlobals()).lastBackupAt, exportedAt);
  await rejects('backup_failed', library.exportBackup(path)); // 不覆寫既有檔案

  // 之後又改了帳：備份比較舊，要先警告
  clock = new Date('2026-11-25T05:00:00Z');
  await spend(library.current(), 999);
  await library.addLedger('之後才加的');
  const info = await library.inspectBackup(path);
  assert.deepEqual([info.format, info.ledgerNames, info.olderThanCurrent], ['bundle', ['我的帳本', '旅行'], true]);
  await rejects('backup_older', library.restoreBackup(path));
  assert.deepEqual(await library.restoreBackup(path, { allowOlder: true }), { ledgers: 2 });

  const ledgers = await library.listLedgers();
  assert.deepEqual(ledgers.map((l) => l.name), ['我的帳本', '旅行']);
  assert.equal(library.currentLedgerId(), ledgers[0].id);
  assert.deepEqual((await library.current().getDayTransactions('2026-11-20')).map((x) => x.amount), [111]);
  const travel = await library.switchLedger(ledgers[1].id);
  assert.deepEqual((await travel.getDayTransactions('2026-11-20')).map((x) => x.amount), [222]);
  assert.ok(existsSync(path)); // 使用者的檔案不動
});

test('舊的單本備份檔可匯入：匯入後只剩那一本；不是備份檔的檔案拒絕且帳不動', async (t) => {
  const dir = folder(t);
  const single = join(dir, 'old-single.db');
  const source = await openLedger(openNodeDatabase(join(dir, 'source.db')), { now: () => NOW,
    backupFiles: nodeFiles(dir) });
  await spend(source, 555);
  await source.exportBackup(single);
  await source.close();

  const library = await openLedgerLibrary({ files: nodeFiles(dir), now: () => new Date('2026-11-26T04:00:00Z') });
  t.after(() => library.close());
  await library.addLedger('另一本');
  const junk = join(dir, 'junk.db');
  writeFileSync(junk, 'not a database');
  await rejects('invalid_backup', library.inspectBackup(junk));
  assert.equal((await library.listLedgers()).length, 2);

  const info = await library.inspectBackup(single);
  assert.deepEqual([info.format, info.ledgerNames], ['single', ['我的帳本']]);
  await library.restoreBackup(single, { allowOlder: true });
  assert.deepEqual((await library.listLedgers()).map((l) => l.name), ['我的帳本']);
  assert.deepEqual((await library.current().getDayTransactions('2026-11-20')).map((x) => x.amount), [555]);
});

test('通知：全 App 共用的記帳與備份提醒取代帳本自己的設定', async (t) => {
  const dir = folder(t);
  const library = await openLedgerLibrary({ files: nodeFiles(dir), now: () => NOW });
  t.after(() => library.close());
  await library.saveReminders({ entry: true, entryTime: '20:15', backupAfterClose: false, backupOverdue: true });
  const plan = await library.current().getNotificationPlan({ now: NOW, hasEntitlement: false, globals: await library.getNotificationGlobals(),
    through: new Date(NOW.getTime() + 36 * 86_400_000) });
  assert.ok(plan.some((p) => p.kind === 'entry' && p.fireAt === '2026-11-25T12:15:00.000Z'));
  assert.ok(plan.some((p) => p.kind === 'backupOverdue'));
  await rejects('invalid_date', library.saveReminders({ entry: true, entryTime: '25:00', backupAfterClose: false, backupOverdue: false }));
});
