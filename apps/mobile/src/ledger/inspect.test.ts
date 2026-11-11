// 帳本檔檢查（給比對工具擋掉「不是帳本檔」的輸入）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { inspectLedgerFile, openLedger } from './index.ts';

test('剛開好的帳本是帳本；空資料庫、別的 App 的資料庫、比這版新的帳本都不是', async () => {
  const good = openNodeDatabase(':memory:');
  await openLedger(good);
  assert.deepEqual(await inspectLedgerFile(good), { ok: true });

  const empty = openNodeDatabase(':memory:');
  assert.deepEqual(await inspectLedgerFile(empty), { ok: false, reason: 'empty' });

  const foreign = openNodeDatabase(':memory:');
  await foreign.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY); PRAGMA user_version = 2');
  assert.deepEqual(await inspectLedgerFile(foreign), { ok: false, reason: 'not_ledger' });

  const noVersion = openNodeDatabase(':memory:');
  await noVersion.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY)');
  assert.deepEqual(await inspectLedgerFile(noVersion), { ok: false, reason: 'not_ledger' });

  const newer = openNodeDatabase(':memory:');
  await openLedger(newer);
  await newer.exec('PRAGMA user_version = 99');
  assert.deepEqual(await inspectLedgerFile(newer), { ok: false, reason: 'too_new' });
});
