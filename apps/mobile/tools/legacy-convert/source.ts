// 來源驗證（轉換程式與比對工具共用）：清冊與逐檔 SHA-256、匯出內容讀取、與 baseline.md 記錄的基準身分比對。
// 任何一項不符就丟錯，呼叫端在驗證全部通過前不得產生任何輸出。
import { verifyExport, type VerifiedExport } from '../../../../tools/lib/verify-export.mjs';
import { BASELINE_20261108, baselineDifferences, type BaselineIdentity } from './baseline.ts';
import { LegacyExportError, readLegacyExport, type LegacyData } from './legacyData.ts';

/** 需要人處理才能繼續的情況（衝突、不合規定的列、缺少回答…）。message 是給翰陞看的完整說明。 */
export class ConversionStopped extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionStopped';
  }
}

export interface LoadSourceOptions {
  /** 已驗證的私人匯出目錄（含 manifest.json）。 */
  exportDirectory: string;
  privateRoot: string;
  /** 預期的舊帳基準身分；預設是 docs/cloudflare/baseline.md 記錄的 2026-11-08 基準。只有程式介面（測試）能換。 */
  expectedBaseline?: BaselineIdentity;
  /** 若給，匯出清冊（manifest.json）的 SHA-256 必須相同。 */
  expectedManifestSha256?: string;
}

export function loadVerifiedSource(options: LoadSourceOptions): { verified: VerifiedExport; legacy: LegacyData } {
  const verified = verifyExport(options.exportDirectory, { privateRoot: options.privateRoot });
  if (options.expectedManifestSha256 !== undefined && options.expectedManifestSha256.toLowerCase() !== verified.manifestSha256) {
    throw new ConversionStopped(`匯出清冊（manifest.json）的 SHA-256 與指定的不同，已拒絕。實際：${verified.manifestSha256}`);
  }
  let legacy: LegacyData;
  try {
    legacy = readLegacyExport(verified);
  } catch (e) {
    if (e instanceof LegacyExportError) throw new ConversionStopped(e.message);
    throw e;
  }
  const differences = baselineDifferences(verified, legacy, options.expectedBaseline ?? BASELINE_20261108);
  if (differences.length > 0) {
    throw new ConversionStopped(['輸入的匯出與 docs/cloudflare/baseline.md 記錄的 2026-11-08 基準不符，已拒絕，沒有產生輸出：', ...differences.map((d) => `- ${d}`)].join('\n'));
  }
  return { verified, legacy };
}
