// docs/cloudflare/baseline.md 記錄的 2026-11-08 舊帳基準身分。轉換程式預設要求輸入的匯出與它相符，
// 否則拒絕：這是「輸入與 baseline.md 記錄不符時拒絕執行」的實作。
// 只有程式介面（測試）能傳入別的預期值；命令列沒有關閉這項檢查的旗標。
import type { VerifiedExport } from '../../../../tools/lib/verify-export.mjs';
import type { LegacyData } from './legacyData.ts';

export interface BaselineIdentity {
  sourceDatabase: string;
  /** 匯出的資料表張數。 */
  tables: number;
  /** 所有資料表的總列數。 */
  totalRows: number;
  transactions: number;
  /** 財務文件的月結月份數（清冊 validation.workspaceMonths，也要等於文件實際月數）。 */
  workspaceMonths: number;
  historicalAssetMismatches: number;
}

export const BASELINE_20261108: BaselineIdentity = {
  sourceDatabase: 'ERPDB_CloudflareBaseline_20261108_115129',
  tables: 16,
  totalRows: 7823,
  transactions: 7033,
  workspaceMonths: 58,
  historicalAssetMismatches: 0,
};

/** 回傳與預期不符的項目（空陣列代表相符）。 */
export function baselineDifferences(verified: VerifiedExport, legacy: LegacyData, expected: BaselineIdentity): string[] {
  const validation = (verified.manifest.validation ?? {}) as Record<string, unknown>;
  const actual: [string, unknown, unknown][] = [
    ['來源資料庫', verified.manifest.sourceDatabase, expected.sourceDatabase],
    ['資料表張數', verified.tables.length, expected.tables],
    ['總列數', verified.tables.reduce((sum, t) => sum + t.rows.length, 0), expected.totalRows],
    ['交易筆數', legacy.transactions.length, expected.transactions],
    ['清冊記錄的月結月份數', validation.workspaceMonths, expected.workspaceMonths],
    ['財務文件實際月結月份數', legacy.months, expected.workspaceMonths],
    ['歷史資產差異月數', validation.historicalAssetMismatches, expected.historicalAssetMismatches],
  ];
  return actual.filter(([, got, want]) => got !== want).map(([what, got, want]) => `${what}：預期 ${String(want)}，實際 ${String(got)}`);
}
