import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateRoot = path.join(repository, '.private');
const hash = value => createHash('sha256').update(value).digest('hex');
const identifier = name => '"' + name.replaceAll('"', '""') + '"';
const normalized = value => typeof value === 'boolean' ? Number(value) : value;
const integerType = type => ['int', 'smallint', 'tinyint', 'bit'].includes(type);
const secretColumn = (table, column) => table === 'Employee' && column.toLowerCase() === 'password';
const sqlValue = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) :
  `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`;

function insidePrivate(directory) {
  const resolved = realpathSync(directory);
  const relative = path.relative(realpathSync(privateRoot), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Input and output must be in a child directory of .private.');
  }
  return resolved;
}

export function prepareBaseline(exportDirectory, outputDirectory) {
  const input = insidePrivate(exportDirectory);
  const output = path.resolve(outputDirectory);
  insidePrivate(path.dirname(output));
  if (existsSync(output)) throw new Error('Output already exists; refusing to overwrite.');
  if (existsSync(path.join(input, 'INCOMPLETE'))) throw new Error('Incomplete export.');
  const manifest = JSON.parse(readFileSync(path.join(input, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.readOnlySource !== true || manifest.notForUpload !== true ||
      !Array.isArray(manifest.tables) || !Array.isArray(manifest.files) ||
      manifest.validation?.historicalAssetMismatches !== 0) {
    throw new Error('Unsupported or unverified baseline manifest.');
  }
  const verified = new Map();
  for (const file of manifest.files) {
    if (!/^[\w.-]+\.json$/.test(file.file) || verified.has(file.file)) throw new Error('Invalid export filename.');
    const bytes = readFileSync(path.join(input, file.file));
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Checksum differs: ${file.file}`);
    verified.set(file.file, bytes.toString('utf8'));
  }
  if (!verified.has('schema.json')) throw new Error('Verified schema is missing.');
  const schema = JSON.parse(verified.get('schema.json'));
  const seenTables = new Set();
  const staging = manifest.tables.map(table => {
    if (!/^\w+\.\w+$/.test(table.table) || seenTables.has(table.table)) throw new Error('Invalid or duplicate table.');
    seenTables.add(table.table);
    if (!verified.has(table.file) || hash(verified.get(table.file)) !== table.sha256) throw new Error('Unverified table.');
    const [sourceSchema, sourceTable] = table.table.split('.');
    if (sourceSchema !== 'dbo') throw new Error('Unexpected schema; explicit mapping required.');
    const allColumns = schema.filter(column => column.schema === sourceSchema && column.table === sourceTable)
      .sort((left, right) => left.ordinal - right.ordinal);
    if (!allColumns.length || allColumns.some(column => column.name === '__migration_row')) throw new Error('Invalid columns.');
    const columns = allColumns.filter(column => !secretColumn(sourceTable, column.name));
    const rows = JSON.parse(verified.get(table.file));
    if (!Array.isArray(rows) || rows.length !== table.rows) throw new Error('Table row count differs.');
    for (const row of rows) {
      for (const column of allColumns) {
        if (!Object.hasOwn(row, column.name)) throw new Error('Missing source field.');
        const value = row[column.name];
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Unsupported field value.');
        if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Lossy numeric source value.');
        if (value !== null && ['decimal', 'numeric', 'money', 'smallmoney', 'bigint'].includes(column.type) && typeof value !== 'string') {
          throw new Error('Exact numeric values must use string encoding.');
        }
      }
    }
    return { source: table.table, name: 'legacy_' + sourceTable, columns, rows,
      omittedColumns: allColumns.filter(column => secretColumn(sourceTable, column.name)).map(column => column.name) };
  });
  const knownTables = new Set(schema.map(column => column.schema + '.' + column.table));
  if (knownTables.size !== seenTables.size || [...knownTables].some(name => !seenTables.has(name))) throw new Error('Schema/table inventory differs.');

  mkdirSync(output);
  writeFileSync(path.join(output, 'INCOMPLETE'), 'Not verified; do not import or upload.');
  const databasePath = path.join(output, 'baseline.sqlite');
  const database = new DatabaseSync(databasePath);
  const schemaStatements = [];
  const dataStatements = [];
  try {
    database.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
    for (const table of staging) {
      const definitions = table.columns.map(column => {
        const type = integerType(column.type) ? 'INTEGER' : 'TEXT';
        return `${identifier(column.name)} ${type}${column.nullable ? '' : ' NOT NULL'}`;
      });
      const create = `CREATE TABLE ${identifier(table.name)} ("__migration_row" INTEGER PRIMARY KEY,${definitions.join(',')}) STRICT;`;
      database.exec(create);
      schemaStatements.push(create);
      const columnNames = ['__migration_row', ...table.columns.map(column => column.name)].map(identifier).join(',');
      const insertPrefix = `INSERT INTO ${identifier(table.name)} (${columnNames}) VALUES `;
      const insert = database.prepare(insertPrefix + `(${Array(table.columns.length + 1).fill('?').join(',')})`);
      table.rows.forEach((row, index) => {
        const values = [index + 1, ...table.columns.map(column => normalized(row[column.name]))];
        insert.run(...values);
        dataStatements.push(insertPrefix + '(' + values.map(sqlValue).join(',') + ');');
      });
    }
    database.exec('COMMIT;');
  } catch (error) {
    try { database.exec('ROLLBACK;'); } catch { /* Transaction may not have started. */ }
    throw error;
  } finally { database.close(); }
  const schemaSql = schemaStatements.join('\n') + '\n';
  const dataSql = dataStatements.join('\n') + '\n';
  writeFileSync(path.join(output, 'schema.sql'), schemaSql);
  writeFileSync(path.join(output, 'data.sql'), dataSql);

  // Independently execute the emitted D1-compatible SQL, then compare every field to the source.
  const replay = new DatabaseSync(':memory:');
  const report = [];
  try {
    replay.exec(schemaSql);
    replay.exec(dataSql);
    for (const table of staging) {
      // node:sqlite currently truncates returned TEXT at embedded NUL. Read UTF-8 bytes instead.
      const comparisonColumns = table.columns.map(column => integerType(column.type) ? identifier(column.name) :
        `CAST(${identifier(column.name)} AS BLOB) AS ${identifier(column.name)}`).join(',');
      const actual = replay.prepare(`SELECT ${comparisonColumns} FROM ${identifier(table.name)} ORDER BY "__migration_row"`).all();
      if (actual.length !== table.rows.length) throw new Error('SQL replay row count differs.');
      const expectedHash = createHash('sha256');
      const actualHash = createHash('sha256');
      for (let index = 0; index < actual.length; index++) {
        const expectedValues = table.columns.map(column => normalized(table.rows[index][column.name]));
        const actualValues = table.columns.map(column => {
          const value = actual[index][column.name];
          return value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : value;
        });
        expectedHash.update(JSON.stringify(expectedValues) + '\n');
        actualHash.update(JSON.stringify(actualValues) + '\n');
      }
      const sourceHash = expectedHash.digest('hex');
      const targetHash = actualHash.digest('hex');
      if (sourceHash !== targetHash) throw new Error('SQL replay values differ.');
      report.push({ source: table.source, target: table.name, rows: actual.length, omittedColumns: table.omittedColumns,
        sourceHash, targetHash, equal: true });
    }
  } finally { replay.close(); }
  const result = { formatVersion: 1, sourceCommit: manifest.sourceCommit, sourceManifestSha256: hash(readFileSync(path.join(input, 'manifest.json'))),
    generatedAt: new Date().toISOString(), allTablesEqual: true, cloudUploaded: false,
    credentialPolicy: 'Employee.Password remains in the private SQL backup/export only; omitted from D1 staging.', tables: report };
  writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2));
  // Verify the file on disk independently as well, not only the SQL replay.
  const diskDatabase = new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (diskDatabase.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('SQLite integrity check failed.');
  } finally { diskDatabase.close(); }
  // Retain the completion marker until all validations and file writes succeed.
  writeFileSync(path.join(output, 'COMPLETE'), 'Verified locally. Private data; not uploaded.\n');
  unlinkSync(path.join(output, 'INCOMPLETE'));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node tools/prepare-d1-baseline.mjs <private-export-directory> <new-private-output-directory>');
    const result = prepareBaseline(process.argv[2], process.argv[3]);
    console.log(JSON.stringify({ tables: result.tables.length, rows: result.tables.reduce((sum, table) => sum + table.rows, 0),
      allTablesEqual: result.allTablesEqual, cloudUploaded: result.cloudUploaded }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
