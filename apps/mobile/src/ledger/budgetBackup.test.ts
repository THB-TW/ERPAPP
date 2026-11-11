// 預算與備份合併的服務整合測試：真 SQLite，資料全部合成。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type BudgetCommand, type Ledger } from './index.ts';

async function workspace(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'budget-backup-test-'));
  const ledgers: Ledger[] = [];
  let current = new Date('2026-11-11T01:00:00Z');
  t.after(async () => {
    try { for (const ledger of ledgers) await ledger.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  });
  return {
    directory,
    setTime: (iso: string) => { current = new Date(iso); },
    async open(file: string) {
      const ledger = await openLedger(openNodeDatabase(join(directory, file)), {
        now: () => current,
        backupFiles: {
          directory,
          open: async (path) => openNodeDatabase(path),
          remove: async (path) => { rmSync(path, { force: true }); },
        },
      });
      ledgers.push(ledger);
      return ledger;
    },
  };
}

async function command(ledger: Ledger, fields: Partial<BudgetCommand> & { action: string }): Promise<BudgetCommand> {
  const status = await ledger.getBudgetStatus();
  return { operationId: randomUUID(), month: status.openMonth, version: status.version, reason: '合成備份整合驗證', ...fields };
}

test('預算寫入更新最後修改時間，預覽、查詢、重送與被拒指令不更新', async (t) => {
  const w = await workspace(t);
  const ledger = await w.open('ledger.db');
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, null);
  const add = await command(ledger, { action: 'add', name: '合成預算', kind: 'reserve', amount: 100 });
  await ledger.runBudgetCommand(add);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-11T01:00:00.000Z');

  w.setTime('2026-11-12T01:00:00Z');
  const edit = await command(ledger, { action: 'edit', from: add.operationId, name: '合成新版預算', kind: 'reserve', amount: 200 });
  await ledger.previewBudgetCommand(edit);
  await ledger.getBudgetProgress();
  await ledger.listBudgetRevisions();
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-11T01:00:00.000Z');
  await ledger.runBudgetCommand(edit);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-12T01:00:00.000Z');

  w.setTime('2026-11-13T01:00:00Z');
  assert.equal((await ledger.runBudgetCommand(edit)).replayed, true);
  await assert.rejects(ledger.runBudgetCommand({ ...edit, operationId: randomUUID(), amount: 300 }), /重新載入/);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-12T01:00:00.000Z');

  const caps = await command(ledger, { action: 'caps', limits: [{ categoryId: add.operationId, amount: 250 }], tuition: 0 });
  await ledger.previewBudgetCommand(caps);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-12T01:00:00.000Z');
  await ledger.runBudgetCommand(caps);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-13T01:00:00.000Z');
  w.setTime('2026-11-14T01:00:00Z');
  await ledger.runBudgetCommand(await command(ledger, { action: 'map', sourceCategory: '飲食', to: add.operationId }));
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-14T01:00:00.000Z');
  w.setTime('2026-11-15T01:00:00Z');
  await ledger.runBudgetCommand(await command(ledger, { action: 'retire', from: add.operationId }));
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, '2026-11-15T01:00:00.000Z');
});

async function budgetSnapshot(ledger: Ledger) {
  return {
    status: await ledger.getBudgetStatus(),
    novemberCategories: await ledger.listCategories('2026-11'),
    decemberCategories: await ledger.listCategories('2026-12'),
    november: await ledger.getBudgetProgress('2026-11'),
    december: await ledger.getBudgetProgress('2026-12'),
    closed: await ledger.getBudgetMonth('2026-11'),
    revisions: await ledger.listBudgetRevisions(),
    transactions: await ledger.listTransactions('2026-11-01', '2026-12-31'),
    report: await ledger.getMonthBreakdown('2026-12', 'expense'),
    accounts: await ledger.listAccounts(),
    balances: await ledger.listAccountBalances('2026-12-31'),
    transfers: await ledger.listTransfers('2026-11-01', '2026-12-31'),
  };
}

test('備份還原保留跨月分類啟停、預算、月結與明細，還原後可繼續預覽與寫入', async (t) => {
  const w = await workspace(t);
  const source = await w.open('source.db');
  await source.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(),
    months: [{
      id: 'synthetic-opening', month: '2026-10', income: 0, surplus: 0, rawSpare: 5000, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-11T01:00:00Z', actor: 'test',
    }],
  }));
  const add = await command(source, { action: 'add', name: '合成旅費', kind: 'reserve', amount: 200 });
  await source.runBudgetCommand(add);
  const account = (await source.listAccounts())[0];
  const category = (await source.listCategories()).find((c) => c.name === '合成旅費')!;
  await source.addTransaction({ date: '2026-11-11', categoryId: category.id, accountId: account.id, flow: 'expense', amount: 50 });
  await source.runBudgetCommand(await command(source, { action: 'close', amount: 1000 }));

  w.setTime('2026-12-11T01:00:00Z');
  await source.runBudgetCommand(await command(source, { action: 'edit', from: add.operationId, name: '合成旅遊', kind: 'reserve', amount: 300 }));
  await source.runBudgetCommand(await command(source, { action: 'map', sourceCategory: '交通', to: add.operationId }));
  const traffic = (await source.listCategories()).find((c) => c.name === '交通')!;
  await source.addTransaction({ date: '2026-12-11', categoryId: traffic.id, accountId: account.id, flow: 'expense', amount: 20 });
  const temporary = await command(source, { action: 'add', name: '合成停用分類', kind: 'actual' });
  await source.runBudgetCommand(temporary);
  await source.runBudgetCommand(await command(source, { action: 'retire', from: temporary.operationId }));
  const bank = await source.addAccount({ name: '合成備份銀行', kind: 'bank', openingBalance: 1000 });
  await source.addTransfer({ date: '2026-12-11', fromAccountId: bank.id, toAccountId: account.id, amount: 20, note: '合成領現' });
  await source.updateAccount(bank.id, { name: '合成銀行新版', openingBalance: 1300, active: false });
  const before = await budgetSnapshot(source);
  const modified = (await source.getBackupStatus()).lastModifiedAt;

  w.setTime('2026-12-12T01:00:00Z');
  const exported = await source.exportBackup(join(w.directory, 'export.db'));
  const target = await w.open('target.db');
  await target.restoreBackup(exported.path);
  assert.deepEqual(await budgetSnapshot(target), before);
  assert.equal((await target.getBackupStatus()).lastModifiedAt, modified);

  w.setTime('2026-12-13T01:00:00Z');
  const edit = await command(target, { action: 'edit', from: add.operationId, name: '合成旅遊', kind: 'reserve', amount: 400 });
  await target.previewBudgetCommand(edit);
  assert.equal((await target.getBackupStatus()).lastModifiedAt, modified);
  await target.runBudgetCommand(edit);
  assert.equal((await target.getBackupStatus()).lastModifiedAt, '2026-12-13T01:00:00.000Z');
  assert.equal((await target.getBudgetProgress('2026-12')).rows.find((r) => r.categoryId === add.operationId)!.cap, 400);
  assert.deepEqual(await target.getBudgetMonth('2026-11'), before.closed);
});
