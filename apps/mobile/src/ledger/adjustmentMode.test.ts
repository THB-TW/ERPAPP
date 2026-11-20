import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { openLedger } from './index.ts';

test('調整畫面預設圖像、切換清單隨帳本備份還原，無效值不寫入', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'adjustment-mode-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ledger = await openLedger(openNodeDatabase(join(dir, 'ledger.db')), { backupFiles: {
    directory: dir, open: async path => openNodeDatabase(path), remove: async path => { rmSync(path, { force: true }); },
  } });
  t.after(() => ledger.close());
  assert.equal(await ledger.getAdjustmentViewMode(), 'visual');
  await ledger.setAdjustmentViewMode('list');
  const backup = await ledger.exportBackup(join(dir, 'backup.db'));
  await ledger.setAdjustmentViewMode('visual');
  await ledger.restoreBackup(backup.path, { allowOlder: true });
  assert.equal(await ledger.getAdjustmentViewMode(), 'list');
  await assert.rejects(ledger.setAdjustmentViewMode('invalid' as 'visual'), /顯示模式/);
  assert.equal(await ledger.getAdjustmentViewMode(), 'list');
});
