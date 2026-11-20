// 付費的預算資料匯出：真 SQLite，資料全部合成。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { readCsv } from '../csv/records.ts';
import { LedgerError, openLedger, type BudgetCommand, type Ledger } from './index.ts';

async function setup(t: TestContext): Promise<Ledger> {
  const directory = mkdtempSync(join(tmpdir(), 'budget-export-test-'));
  const ledger = await openLedger(openNodeDatabase(join(directory, 'ledger.db')), { now: () => new Date('2026-12-11T01:00:00Z') });
  t.after(async () => { try { await ledger.close(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  return ledger;
}

async function command(ledger: Ledger, fields: Partial<BudgetCommand> & { action: string }): Promise<BudgetCommand> {
  const status = await ledger.getBudgetStatus();
  return { operationId: randomUUID(), month: status.openMonth, version: status.version, reason: '合成匯出驗證', ...fields };
}

function decode(bytes: Uint8Array): string[][] {
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  assert.ok(text.startsWith('﻿'));
  return readCsv(text.slice(1)).map((r) => r.cells);
}

test('沒有付費權益時拒絕預算資料匯出，交易 CSV 仍可免費匯出', async (t) => {
  const ledger = await setup(t);
  await assert.rejects(ledger.exportBudgetCsv({ hasEntitlement: false }),
    (e: unknown) => e instanceof LedgerError && e.code === 'entitlement_required');
  assert.ok((await ledger.exportTransactionsCsv()).length > 0);
});

test('預算資料匯出含上限、月結、儲備餘額與貸款，且不改動帳本', async (t) => {
  const ledger = await setup(t);
  await ledger.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(),
    months: [{
      id: 'synthetic-opening', month: '2026-10', income: 0, surplus: 0, rawSpare: 5000, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-11T01:00:00Z', actor: 'test',
    }],
  }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'add', name: '合成旅費', kind: 'reserve', amount: 200 }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'add', name: '合成餐費', kind: 'actual' }));
  await ledger.runBudgetCommand(await command(ledger, { action: 'close', amount: 1000 }));
  await ledger.createLoan({ name: '合成分期', totalAmount: 1200, monthlyPayment: 300, remainingPrincipal: 900,
    expectedEndMonth: '2027-03', hasEntitlement: true, reason: '合成貸款', version: (await ledger.getBudgetStatus()).version });
  const before = await ledger.getBackupStatus();

  const rows = decode(await ledger.exportBudgetCsv({ hasEntitlement: true }));
  assert.deepEqual(rows[0], ['區段', '月份', '項目', '類型', '金額', '備註']);
  const has = (row: string[]) => rows.some((r) => JSON.stringify(r) === JSON.stringify(row));
  assert.ok(has(['預算上限', '2026-12', '合成旅費', '儲備', '200', '']));
  assert.ok(has(['預算上限', '2026-12', '合成餐費', '照實支', '', '']));
  assert.ok(has(['月結', '2026-11', '收入', '', '1000', '']));
  assert.ok(rows.some((r) => r[0] === '月結' && r[1] === '2026-10' && r[5] === '舊帳帶入'));
  assert.ok(has(['儲備餘額', '2026-11', '合成旅費', '儲備', '200', '']));
  assert.ok(has(['貸款', '2026-12', '合成分期', '每月繳款', '300', '預計 2027-03 繳清']));
  assert.ok(has(['貸款', '2026-12', '合成分期', '剩餘本金', '900', '']));
  assert.deepEqual(await ledger.getBackupStatus(), before);
});
