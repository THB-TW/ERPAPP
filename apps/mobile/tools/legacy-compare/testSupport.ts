// 比對工具測試共用：虛構匯出 → 轉換 → 比對的準備。資料全部虛構；tamper／editDocument 是測試製造壞資料，不是工具行為。
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { convertLegacy } from '../legacy-convert/convert.ts';
import { comparableExport, fictionalBaseline, writeFictionalExport, type FictionalExport } from '../legacy-convert/testExport.ts';
import { compareLegacy, type CompareOptions } from './run.ts';

export const TOOL = { commit: 'abc123def456', dirty: false };

export async function setup(data: FictionalExport = comparableExport(), convertOptions: Partial<Parameters<typeof convertLegacy>[0]> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'legacy-compare-'));
  const priv = path.join(root, '.private');
  mkdirSync(priv);
  const exportDirectory = writeFictionalExport(priv, data);
  const ledgerPath = path.join(priv, 'ledger.sqlite');
  await convertLegacy({
    exportDirectory, outputPath: ledgerPath, privateRoot: priv, ask: async () => '-300', log: () => {}, expectedBaseline: fictionalBaseline(data), ...convertOptions,
  });
  const run = (over: Partial<CompareOptions> = {}) => compareLegacy({
    exportDirectory, ledgerPath, reportPath: path.join(priv, 'report.md'), privateRoot: priv, expectedBaseline: fictionalBaseline(data),
    toolVersion: TOOL, expectations: { legacyDifferenceMonths: 2 }, now: () => new Date('2026-11-12T01:00:00Z'), ...over,
  });
  /** 直接對帳本檔下 SQL 做壞資料（測試用）。 */
  const tamper = async (sql: string, params: (string | number)[] = []) => {
    const db = openNodeDatabase(ledgerPath);
    await db.run(sql, params);
    await db.close();
  };
  const editDocument = async (edit: (doc: any) => void) => {
    const db = openNodeDatabase(ledgerPath);
    const row = await db.get<{ document: string }>('SELECT document FROM finance_document WHERE id = 1');
    const doc = JSON.parse(row!.document);
    edit(doc);
    await db.run('UPDATE finance_document SET document = ? WHERE id = 1', [JSON.stringify(doc)]);
    await db.close();
  };
  return { root, priv, exportDirectory, ledgerPath, run, tamper, editDocument, data, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

