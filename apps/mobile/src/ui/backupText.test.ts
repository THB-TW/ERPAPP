import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_REMINDER_DAYS, backupFileName, describeLastBackup, fileUriToPath, pathToFileUri, taipeiDateTime } from './backupText.ts';

test('備份檔名用台北時間，只含英數與連字號', () => {
  // 2026-11-11 16:30:45 UTC = 台北 2026-11-12 00:30:45
  assert.equal(backupFileName(new Date('2026-11-11T16:30:45Z')), 'ledger-backup-20261112-003045.db');
});

test('時間顯示成台北時間', () => {
  assert.equal(taipeiDateTime('2026-11-11T16:30:45.000Z'), '2026 年 11 月 12 日 00:30');
});

test('上次備份日期的說明：沒備份過、今天、幾天前、超過 35 天要提醒', () => {
  const now = new Date('2026-11-11T04:00:00Z'); // 台北 11/11 中午
  assert.deepEqual(describeLastBackup(null, now), { text: '還沒有備份過', overdue: true });
  assert.deepEqual(describeLastBackup('2026-11-10T17:00:00.000Z', now), { text: '2026 年 11 月 11 日 01:00（今天）', overdue: false });
  assert.deepEqual(describeLastBackup('2026-11-10T15:00:00.000Z', now), { text: '2026 年 11 月 10 日 23:00（1 天前）', overdue: false });
  assert.equal(BACKUP_REMINDER_DAYS, 35);
  assert.equal(describeLastBackup('2026-10-07T04:00:00.000Z', now).overdue, false); // 剛好 35 天
  assert.deepEqual(describeLastBackup('2026-10-06T04:00:00.000Z', now), { text: '2026 年 10 月 6 日 12:00（36 天前）', overdue: true });
});

test('檔案網址與路徑互轉（含空白與中文）', () => {
  assert.equal(fileUriToPath('file:///var/mobile/Caches/DocumentPicker/%E5%82%99%E4%BB%BD%201.db'), '/var/mobile/Caches/DocumentPicker/備份 1.db');
  assert.equal(fileUriToPath('/already/a/path.db'), '/already/a/path.db');
  assert.equal(pathToFileUri('/var/mobile/Documents/SQLite/備份 1.db'), 'file:///var/mobile/Documents/SQLite/%E5%82%99%E4%BB%BD%201.db');
  assert.equal(fileUriToPath(pathToFileUri('/a/b#c?d%e.db')), '/a/b#c?d%e.db');
});
