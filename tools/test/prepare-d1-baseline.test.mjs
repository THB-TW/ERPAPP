import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { prepareBaseline } from '../prepare-d1-baseline.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const privateRoot = path.join(repository, '.private');
mkdirSync(privateRoot, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = mkdtempSync(path.join(privateRoot, 'migration-test-'));
  const input = path.join(root, 'export');
  mkdirSync(input);
  const tables = [
    { name: 'Transactions', columns: [['Id','int'],['Category','nvarchar'],['Amount','int']], rows: [
      { Id: 1, Category: "飲食 O'Brien\n第二行\u0000尾端", Amount: 150 },
      { Id: 2, Category: "飲食 O'Brien\n第二行\u0000尾端", Amount: 150 }
    ] },
    { name: 'InvestmentTransaction', columns: [['Quantity','decimal'],['Version','bigint'],['Note','nvarchar']], rows: [
      { Quantity: '123456789012.123456', Version: '9007199254740993', Note: null }
    ] },
    { name: 'Employee', columns: [['EmployeeId','int'],['Account','nvarchar'],['Password','nvarchar']], rows: [
      { EmployeeId: 1, Account: 'fixture-user', Password: 'NEVER_UPLOAD_THIS_PASSWORD_9743' }
    ] },
    { name: 'creditcard', columns: [['Date','date'],['Item','nvarchar'],['Amount','int']], rows: [] }
  ];
  const schema = tables.flatMap(table => table.columns.map(([name, type], index) => ({ schema: 'dbo', table: table.name,
    ordinal: index + 1, name, type, nullable: name === 'Note' })));
  const files = [];
  function save(name, value) {
    const bytes = Buffer.from(JSON.stringify(value));
    writeFileSync(path.join(input, name), bytes);
    files.push({ file: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  save('schema.json', schema);
  const tableManifest = tables.map(table => {
    const file = `dbo.${table.name}.json`;
    save(file, table.rows);
    return { table: 'dbo.' + table.name, file, rows: table.rows.length, sha256: files.at(-1).sha256 };
  });
  writeFileSync(path.join(input, 'manifest.json'), JSON.stringify({ formatVersion: 1, sourceCommit: 'fixture', readOnlySource: true,
    notForUpload: true, tables: tableManifest, files, validation: { historicalAssetMismatches: 0 } }));
  return { input, output: path.join(root, 'd1-stage') };
}

test('portable migration preserves duplicate transactions, Unicode, null and exact decimal quantities, excluding login passwords', () => {
  const paths = fixture();
  const result = prepareBaseline(paths.input, paths.output);
  assert.equal(result.allTablesEqual, true);
  assert.equal(result.cloudUploaded, false);
  const database = new DatabaseSync(path.join(paths.output, 'baseline.sqlite'), { readOnly: true });
  try {
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM legacy_Transactions').get().n, 2);
    assert.equal(Buffer.from(database.prepare('SELECT CAST(Category AS BLOB) AS Category FROM legacy_Transactions ORDER BY Id LIMIT 1').get().Category).toString('utf8'),
      "飲食 O'Brien\n第二行\u0000尾端");
    const investment = database.prepare('SELECT Quantity,Version,Note FROM legacy_InvestmentTransaction').get();
    assert.equal(investment.Quantity, '123456789012.123456');
    assert.equal(investment.Version, '9007199254740993');
    assert.equal(investment.Note, null);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM legacy_creditcard').get().n, 0);
    assert.ok(!database.prepare('PRAGMA table_info(legacy_Employee)').all().some(column => column.name === 'Password'));
  } finally { database.close(); }
  for (const name of ['data.sql', 'baseline.sqlite']) {
    assert.ok(!readFileSync(path.join(paths.output, name)).includes(Buffer.from('NEVER_UPLOAD_THIS_PASSWORD_9743')));
  }
  assert.ok(existsSync(path.join(paths.output, 'COMPLETE')));
  assert.ok(!existsSync(path.join(paths.output, 'INCOMPLETE')));
  assert.throws(() => prepareBaseline(paths.input, paths.output), /refusing to overwrite/);
});

test('modified source data fails verification before any target is created', () => {
  const paths = fixture();
  writeFileSync(path.join(paths.input, 'dbo.Transactions.json'), '[]');
  assert.throws(() => prepareBaseline(paths.input, paths.output), /Checksum differs/);
  assert.ok(!existsSync(paths.output));
});

test('private exports cannot be written into source/deployment directories', () => {
  const paths = fixture();
  assert.throws(() => prepareBaseline(paths.input, path.join(repository, 'migration-data')), /child directory of .private/);
  assert.ok(!existsSync(path.join(repository, 'migration-data')));
});

test('an export missing a schema table cannot silently discard that table', () => {
  const paths = fixture();
  const manifestFile = path.join(paths.input, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile));
  manifest.tables.pop();
  writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => prepareBaseline(paths.input, paths.output), /inventory differs/);
  assert.ok(!existsSync(paths.output));
});
