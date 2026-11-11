// 舊帳比對：已驗證的匯出 ＋ 轉換出來的帳本檔 → 完整報告（私人位置）＋摘要（無金額）。只給翰陞在 Mac 上跑，不打包進 App。
// 帳本檔不會被改動：只讀它在私人位置的暫時副本（跑完刪掉），並在前後各算一次 SHA-256 確認原檔位元組不變。
// 所有數字都經由帳本服務查詢；不直接對資料表下 SQL。
import { execFileSync } from 'node:child_process';
import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defaultPrivateRoot, insidePrivate, repositoryRoot, sha256 } from '../../../../tools/lib/verify-export.mjs';
import { parseBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { taipeiDate } from '../../src/calc/dates.ts';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { inspectLedgerFile, openLedger, type BudgetMonthView } from '../../src/ledger/index.ts';
import { OutputWriteError, writeNewFiles } from '../common.ts';
import { LegacyExportError } from '../legacy-convert/legacyData.ts';
import type { BaselineIdentity } from '../legacy-convert/baseline.ts';
import { assertGitIgnored, assertPrivateOutput, OutputPathError } from '../legacy-convert/output.ts';
import { ConversionStopped, loadVerifiedSource } from '../legacy-convert/source.ts';
import { compareBudgetMonths, compareTransactions } from './compare.ts';
import { compareCardStatements } from './cardStatements.ts';
import { compareInvestments } from './investments.ts';
import { COMPARE_EXPECTATIONS_20261108, type CompareExpectations } from './expectations.ts';
import { bucketExpensesByMonth, recomputeMonths, type TransactionsOfMonth } from './recompute.ts';
import { TEMP_PREFIX, guardTempDir, removeStaleTemps } from './tempCopy.ts';
import { buildReport, buildSummary, thresholdDifferences, type ReportContext } from './report.ts';
import { readIndependentSources, readRawDocument } from './sources.ts';

export interface CompareOptions {
  /** 已驗證的私人匯出目錄（含 manifest.json）。 */
  exportDirectory: string;
  /** 票 04 轉換程式輸出的帳本檔（在私人位置之下）。 */
  ledgerPath: string;
  /** 完整報告的輸出路徑（私人位置之下、尚不存在）。摘要寫在同一個資料夾，檔名為「<報告檔名>-summary<副檔名>」。 */
  reportPath: string;
  privateRoot?: string;
  /** 預期的舊帳基準身分；預設是 baseline.md 的 2026-11-08 基準。只有程式介面（測試）能換。 */
  expectedBaseline?: BaselineIdentity;
  expectedManifestSha256?: string;
  /** 比對工具自己多釘的預期值（歷史總資產差異月數 17）；只有程式介面（測試）能換。 */
  expectations?: CompareExpectations;
  /** 測試用：換掉重算（驗證重算出錯不影響門檻結論）。 */
  recompute?: typeof recomputeMonths;
  /** 測試用：換掉寫檔（驗證寫檔失敗時仍保留門檻結論）。 */
  writeFiles?: typeof writeNewFiles;
  now?: () => Date;
  /** 工具版本資訊；預設問 git。測試傳固定值。 */
  toolVersion?: { commit: string | null; dirty: boolean | null };
  log?: (line: string) => void;
}

export interface CompareOutcome {
  /** 門檻項目全部 0 差異。重算報告不影響它。 */
  passed: boolean;
  thresholdDifferences: number;
  reportPath: string;
  summaryPath: string;
  summary: string[];
}

/** 寫出報告或摘要失敗。已經算出的門檻差異數不會因此丟掉：差異數大於 0 時命令列仍以結束代碼 3 結束。 */
export class ReportWriteFailed extends Error {
  thresholdDifferences: number;
  /** 失敗後仍然存在的輸出檔（理想上是空的）。 */
  existingFiles: string[];
  /** 摘要文字（不含金額與名稱，可以印在終端機）。 */
  summary: string[];
  constructor(message: string, thresholdDifferences: number, existingFiles: string[], summary: string[]) {
    super(message);
    this.name = 'ReportWriteFailed';
    this.thresholdDifferences = thresholdDifferences;
    this.existingFiles = existingFiles;
    this.summary = summary;
  }
}

export function summaryPathFor(reportPath: string): string {
  const parsed = path.parse(reportPath);
  return path.join(parsed.dir, `${parsed.name}-summary${parsed.ext}`);
}

function gitVersion(): { commit: string | null; dirty: boolean | null } {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { commit: git('rev-parse', '--short=12', 'HEAD'), dirty: git('status', '--porcelain', '--', 'apps/mobile', 'tools').length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

const fileSha256 = (file: string) => sha256(readFileSync(file));

const inside = (file: string, directory: string) => {
  const relative = path.relative(directory, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/** 輸出檔所在資料夾解開符號連結後的完整路徑（資料夾不存在就用原路徑；詳細的存在檢查在 assertPrivateOutput）。 */
function resolvedOutput(file: string): string {
  const resolved = path.resolve(file);
  try {
    return path.join(realpathSync(path.dirname(resolved)), path.basename(resolved));
  } catch {
    return resolved;
  }
}

export async function compareLegacy(options: CompareOptions): Promise<CompareOutcome> {
  const log = options.log ?? (() => {});
  const privateRoot = options.privateRoot ?? defaultPrivateRoot;

  // 1. 輸入與輸出的位置（還沒碰任何資料之前先擋）
  let exportReal: string;
  try {
    exportReal = insidePrivate(options.exportDirectory, privateRoot);
  } catch {
    throw new ConversionStopped(existsSync(options.exportDirectory)
      ? `匯出目錄必須在私人資料夾（${privateRoot}）之下：${options.exportDirectory}`
      : `找不到匯出目錄：${options.exportDirectory}。請確認路徑，匯出要放在私人資料夾（${privateRoot}）之下。`);
  }
  let ledgerFile: string;
  try {
    if (!existsSync(options.ledgerPath) || !lstatSync(options.ledgerPath).isFile()) throw new Error('not a file');
    ledgerFile = insidePrivate(options.ledgerPath, privateRoot);
  } catch {
    throw new ConversionStopped(`帳本檔必須是私人資料夾（${privateRoot}）之下已存在的檔案：${options.ledgerPath}`);
  }
  const wanted = [resolvedOutput(options.reportPath), resolvedOutput(summaryPathFor(options.reportPath))];
  if (wanted[0] === wanted[1]) throw new OutputPathError('報告檔與摘要檔不能是同一個檔案。');
  for (const file of wanted) {
    if (file === ledgerFile) throw new OutputPathError(`輸出檔不能就是帳本檔：${file}`);
    if (inside(file, exportReal)) throw new OutputPathError(`輸出檔不能放在匯出目錄裡面（會改動來源匯出的內容）：${file}。請放在 .private/ 之下的別處，例如 .private/app-ledger/。`);
  }
  const reportFinal = assertPrivateOutput(options.reportPath, privateRoot);
  const summaryFinal = assertPrivateOutput(summaryPathFor(options.reportPath), privateRoot);
  if (options.privateRoot === undefined) {
    assertGitIgnored(reportFinal);
    assertGitIgnored(summaryFinal);
  }
  for (const suffix of ['-wal', '-journal', '-shm', '.partial']) {
    if (existsSync(ledgerFile + suffix)) {
      throw new ConversionStopped(`帳本檔旁邊有殘留的 ${path.basename(ledgerFile + suffix)}，代表它可能沒有正常寫完或關閉，不能保證副本與原檔一致。請重新轉換出一份新的帳本檔再比對。`);
    }
  }
  const staleTemps = removeStaleTemps(privateRoot);
  if (staleTemps.length > 0) log(`偵測到上次被中斷留下的暫時副本（內含完整帳本），已刪除 ${staleTemps.length} 個：${staleTemps.join('、')}`);

  // 2. 來源驗證（與轉換程式共用同一份）
  log('驗證來源匯出的清冊與每個檔案的 SHA-256 ...');
  const { verified, legacy } = loadVerifiedSource({
    exportDirectory: options.exportDirectory, privateRoot, expectedBaseline: options.expectedBaseline, expectedManifestSha256: options.expectedManifestSha256,
  });
  let sources, raw;
  try {
    sources = readIndependentSources(verified);
    raw = readRawDocument(legacy.document);
  } catch (e) {
    if (e instanceof LegacyExportError) throw new ConversionStopped(e.message);
    throw e;
  }

  // 3. 開帳本檔的暫時副本來讀；原檔前後雜湊必須相同
  const ledgerHashBefore = fileSha256(ledgerFile);
  const tempDir = mkdtempSync(path.join(realpathSync(privateRoot), TEMP_PREFIX));
  const release = guardTempDir(tempDir); // Ctrl-C／被終止時也要把副本刪掉
  const tempFile = path.join(tempDir, 'ledger-copy.sqlite');
  let budget, transactions, cardStatements, investments, recompute: ReportContext['recompute'];
  try {
    copyFileSync(ledgerFile, tempFile, constants.COPYFILE_EXCL);
    chmodSync(tempFile, 0o600);
    const db = openNodeDatabase(tempFile);
    try {
      const check = await inspectLedgerFile(db);
      if (!check.ok) {
        throw new ConversionStopped(`這個檔案不是 App 的帳本檔（${LEDGER_FILE_PROBLEM[check.reason]}），沒有產生報告。請確認第二個參數是轉換程式輸出的帳本檔。`);
      }
      const ledger = await openLedger(db);
      log('透過帳本服務查詢 App 的月結數字與交易 ...');
      const listed = await ledger.listBudgetMonths();
      const views = new Map<string, BudgetMonthView>();
      for (const m of listed) views.set(m.month, await ledger.getBudgetMonth(m.month));
      const exportedDocument = await ledger.exportFinanceDocument();
      budget = compareBudgetMonths(views, listed.map((m) => m.month), sources, raw, {
        expectedLegacyDifferenceMonths: (options.expectations ?? COMPARE_EXPECTATIONS_20261108).legacyDifferenceMonths,
        exportedDocument, sourceDocument: legacy.document,
      });
      const all = await ledger.listTransactions('0001-01-01', '9999-12-31');
      transactions = compareTransactions(all, legacy.transactions);
      cardStatements = compareCardStatements(await ledger.listCardStatements(), legacy.cardStatements ?? []);
      if (!legacy.cutoffMonth || !legacy.investments) throw new ConversionStopped('來源缺少投資或搬遷截止月，無法完成驗收比對。');
      investments = await compareInvestments(ledger, legacy.investments, legacy.cutoffMonth);

      log('重算報告（僅供參考）...');
      try {
        const state = parseBudgetDocument(exportedDocument);
        const incomeByMonth = new Map<string, number>();
        for (const m of state.months) incomeByMonth.set(m.month, await ledger.getMonthIncome(m.month));
        const expensesByMonth = bucketExpensesByMonth(all);
        const of = (month: string): TransactionsOfMonth => ({ income: incomeByMonth.get(month) ?? 0, expenses: expensesByMonth.get(month) ?? [] });
        recompute = { months: (options.recompute ?? recomputeMonths)(state, of) };
      } catch (e) {
        recompute = { error: e instanceof Error ? e.message : String(e) }; // 重算出錯不影響門檻結論
      }
      await ledger.close();
    } finally {
      try { await db.close(); } catch { /* 已經關了 */ }
    }
  } finally {
    release();
    rmSync(tempDir, { recursive: true, force: true }); // 暫時副本一定刪掉
  }
  if (fileSha256(ledgerFile) !== ledgerHashBefore) {
    throw new Error('帳本檔在比對過程中被改動（SHA-256 前後不同）。比對結果不可信，沒有產生報告。');
  }

  // 4. 先算好門檻差異數，再寫報告與摘要（兩個檔一起成功才留下，不覆寫）
  const ctx: ReportContext = {
    date: taipeiDate((options.now ?? (() => new Date()))()),
    tool: options.toolVersion ?? gitVersion(),
    manifestSha256: verified.manifestSha256,
    sourceDatabase: String(verified.manifest.sourceDatabase ?? ''),
    sourceCommit: String(verified.manifest.sourceCommit ?? ''),
    ledgerSha256: ledgerHashBefore,
    budget, transactions, cardStatements, investments, recompute,
  };
  const count = thresholdDifferences(ctx).length;
  const summary = buildSummary(ctx);
  try {
    (options.writeFiles ?? writeNewFiles)([
      { path: reportFinal, text: buildReport(ctx) },
      { path: summaryFinal, text: summary.join('\n') + '\n' },
    ]);
  } catch (e) {
    const existing = e instanceof OutputWriteError ? e.existing : [];
    const cause = e instanceof Error ? e.message : String(e);
    throw new ReportWriteFailed(
      `寫出報告或摘要失敗：${cause}。${existing.length > 0 ? `失敗後仍存在的檔案：${existing.join('、')}（請自行確認後刪除，否則重跑會被擋）。` : '沒有留下任何報告或摘要檔。'}`
      + (count > 0 ? `門檻項目有 ${count} 項差異（報告沒能寫出，差異月份見下方摘要）。` : '門檻項目沒有差異，但沒有報告可留存，請排除寫檔問題後重跑。'),
      count, existing, summary,
    );
  }
  return { passed: count === 0, thresholdDifferences: count, reportPath: reportFinal, summaryPath: summaryFinal, summary };
}

const LEDGER_FILE_PROBLEM = {
  empty: '空的資料庫，沒有任何資料表',
  not_ledger: '裡面沒有帳本的資料表',
  too_new: '它的結構版本比這個工具新',
  not_sqlite: '不是 SQLite 檔',
} as const;
