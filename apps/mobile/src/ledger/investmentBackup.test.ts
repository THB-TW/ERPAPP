import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { openLedger, type Ledger } from './index.ts';
import { ledgerMigrations } from './migrations.ts';
import type { Migration } from '../db/migrate.ts';

const access = { hasEntitlement: true };
function workspace(t: TestContext) {
  const directory = mkdtempSync(join(process.cwd(), '.investment-backup-'));
  const ledgers: Ledger[] = [];
  t.after(async () => { for (const l of ledgers) await l.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, async open(name: string, migrations?: readonly Migration[]) {
    const ledger = await openLedger(openNodeDatabase(join(directory, name)), { migrations,
      now: () => new Date('2026-11-11T04:00:00Z'),
      backupFiles: { directory, open: async (path) => openNodeDatabase(path), remove: async (path) => { rmSync(path, { force: true }); } },
    });
    ledgers.push(ledger); return ledger;
  } };
}
async function queries(ledger: Ledger) {
  return { portfolio: await ledger.getInvestmentPortfolio(), opening: await ledger.getInvestmentOpening(),
    transactions: await ledger.listInvestmentTransactions(), valuations: await ledger.listInvestmentValuations(), balances: await ledger.listAccountBalances() };
}

test('v13 投資四表隨整本備份還原，成本、歷史、淨額與帳戶餘額一致，取代前另存可復原', async (t) => {
  const w = workspace(t); const source = await w.open('source.db');
  const stock = await source.addInvestmentHolding({ assetClass: 'stock', symbol: '5678', name: '合成股票' }, access);
  const crypto = await source.addInvestmentHolding({ assetClass: 'crypto', name: '合成幣桶' }, access);
  await source.setInvestmentOpening({ asOfMonth: '2026-09', netDeployed: 30 }, access);
  await source.addInvestmentTransaction({ holdingId: stock.id, txType: 'opening', date: '2026-09-30', quantity: '0.1', amount: 10, fundSource: 'external' }, access);
  await source.addInvestmentTransaction({ holdingId: stock.id, txType: 'buy', date: '2026-10-01', quantity: '0.2', amount: 20, fundSource: 'internal', accountId: 2 }, access);
  await source.addInvestmentTransaction({ holdingId: crypto.id, txType: 'buy', date: '2026-10-01', amount: 30, fundSource: 'external' }, access);
  await source.addInvestmentTransaction({ holdingId: crypto.id, txType: 'sell', date: '2026-10-02', amount: 40, fundSource: 'external' }, access);
  for (const unitPrice of ['100', '120.5']) await source.addInvestmentValuation({ holdingId: stock.id, asOf: '2026-10-02T04:00:00Z', unitPrice }, access);
  await source.addInvestmentValuation({ holdingId: crypto.id, asOf: '2026-10-02T12:00:00', marketValue: 15 }, access);
  const snapshot = await queries(source);
  const exported = await source.exportBackup(join(w.directory, 'investment.db'));
  assert.equal((await source.inspectBackup(exported.path)).schemaVersion, 13);
  assert.equal((await source.getBackupStatus()).lastModifiedAt, '2026-11-11T04:00:00.000Z');
  const target = await w.open('target.db');
  await target.addInvestmentHolding({ assetClass: 'crypto', name: '取代前的合成桶' }, access);
  const previous = await queries(target);
  const result = await target.restoreBackup(exported.path, { allowOlder: true });
  assert.deepEqual(await queries(target), snapshot);
  await target.restoreBackup(result.safetyCopyPath, { allowOlder: true });
  assert.deepEqual(await queries(target), previous);
});

test('v11 舊備份補上 v13；v13 已存在時仍能後補 v12，重開不重做', async (t) => {
  const w = workspace(t); const old = await w.open('old.db', ledgerMigrations.filter((m) => m.version < 13));
  await old.updateAccount(2, { openingBalance: 700 });
  const oldFile = await old.exportBackup(join(w.directory, 'old-backup.db'));
  const current = await w.open('current.db');
  await current.restoreBackup(oldFile.path, { allowOlder: true });
  assert.deepEqual(await current.listInvestmentTransactions(), []);
  await current.addInvestmentHolding({ assetClass: 'crypto', name: '補版保留的桶' }, access);
  const exported = await current.exportBackup(join(w.directory, 'v13.db'));
  const with12 = [...ledgerMigrations.filter((m) => m.version < 12), { version: 12, async up(tx) {
    await tx.run("UPDATE accounts SET opening_balance=opening_balance+9 WHERE kind='bank'");
  } } satisfies Migration, ...ledgerMigrations.filter((m) => m.version > 12)];
  const future = await w.open('future.db', with12);
  await future.restoreBackup(exported.path, { allowOlder: true });
  assert.equal((await future.listAccountBalances()).find((a) => a.id === 2)!.balance, 709);
  assert.deepEqual((await future.getInvestmentPortfolio()).positions, (await current.getInvestmentPortfolio()).positions);
  const reopened = await w.open('future.db', with12);
  assert.equal((await reopened.listAccountBalances()).find((a) => a.id === 2)!.balance, 709);
});
