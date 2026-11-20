// 唯讀備份匯出的驗證（清冊、檔案雜湊、欄位完整性）。prepare-d1-baseline.mjs 與
// apps/mobile/tools/legacy-convert 共用這一份，避免兩邊各寫一套而不一致。
// 驗證失敗一律丟 Error；呼叫端在驗證全部通過前不得產生任何輸出。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const defaultPrivateRoot = path.join(repositoryRoot, '.private');

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const integerType = type => ['int', 'smallint', 'tinyint', 'bit'].includes(type);
const secretColumn = (table, column) => table === 'Employee' && column.toLowerCase() === 'password';

/** 目錄必須存在，且是 privateRoot 的子目錄（解開符號連結後判斷）。回傳解開後的實際路徑。 */
export function insidePrivate(directory, privateRoot = defaultPrivateRoot) {
  const resolved = realpathSync(directory);
  const relative = path.relative(realpathSync(privateRoot), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Input and output must be in a child directory of .private.');
  }
  return resolved;
}

/**
 * 驗證匯出目錄並讀出全部資料表。
 * 回傳 { input, manifest, manifestSha256, schema, tables }；tables 每項為
 * { source: 'dbo.X', sourceTable: 'X', name: 'legacy_X', columns（已去除密碼欄）, rows, omittedColumns }。
 */
export function verifyExport(exportDirectory, { privateRoot = defaultPrivateRoot } = {}) {
  const input = insidePrivate(exportDirectory, privateRoot);
  if (existsSync(path.join(input, 'INCOMPLETE'))) throw new Error('Incomplete export.');
  const manifestBytes = readFileSync(path.join(input, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.formatVersion !== 1 || manifest.readOnlySource !== true || manifest.notForUpload !== true ||
      !Array.isArray(manifest.tables) || !Array.isArray(manifest.files) ||
      manifest.validation?.historicalAssetMismatches !== 0) {
    throw new Error('Unsupported or unverified baseline manifest.');
  }
  const verified = new Map();
  for (const file of manifest.files) {
    if (!/^[\w.-]+\.json$/.test(file.file) || verified.has(file.file)) throw new Error('Invalid export filename.');
    const bytes = readFileSync(path.join(input, file.file));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Checksum differs: ${file.file}`);
    verified.set(file.file, bytes.toString('utf8'));
  }
  if (!verified.has('schema.json')) throw new Error('Verified schema is missing.');
  const schema = JSON.parse(verified.get('schema.json'));
  const seenTables = new Set();
  const tables = manifest.tables.map(table => {
    if (!/^\w+\.\w+$/.test(table.table) || seenTables.has(table.table)) throw new Error('Invalid or duplicate table.');
    seenTables.add(table.table);
    if (!verified.has(table.file) || sha256(verified.get(table.file)) !== table.sha256) throw new Error('Unverified table.');
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
    return { source: table.table, sourceTable, name: 'legacy_' + sourceTable, columns, rows,
      omittedColumns: allColumns.filter(column => secretColumn(sourceTable, column.name)).map(column => column.name) };
  });
  const knownTables = new Set(schema.map(column => column.schema + '.' + column.table));
  if (knownTables.size !== seenTables.size || [...knownTables].some(name => !seenTables.has(name))) throw new Error('Schema/table inventory differs.');
  return { input, manifest, manifestSha256: sha256(manifestBytes), schema, tables };
}

