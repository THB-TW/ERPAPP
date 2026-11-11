// 舊帳比對：已驗證的匯出 ＋ 轉換出來的帳本檔 → 完整報告（私人位置）＋摘要（無金額）。只給翰陞在 Mac 上跑，不打包進 App。
// 帳本檔不會被改動：只讀它在私人位置的暫時副本（跑完刪掉），並在前後各算一次 SHA-256 確認原檔位元組不變。
// 所有數字都經由帳本服務查詢；不直接對資料表下 SQL。
import { execFileSync } from 'node:child_process';
import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultPrivateRoot, insidePrivate, repositoryRoot, sha256 } from '../../../../tools/lib/verify-export.mjs';
import { parseBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { taipeiDate } from '../../src/calc/dates.ts';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { openLedger, type BudgetMonthView } from '../../src/ledger/index.ts';
import { LegacyExportError } from '../legacy-convert/legacyData.ts';
import type { BaselineIdentity } from '../legacy-convert/baseline.ts';
import { assertGitIgnored, assertPrivateOutput, OutputPathError } from '../legacy-convert/output.ts';
import { ConversionStopped, loadVerifiedSource } from '../legacy-convert/source.ts';
import { compareBudgetMonths, compareTransactions } from './compare.ts';
import { recomputeMonths, type TransactionsOfMonth } from './recompute.ts';
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

function writeNew(file: string, text: string): void {
  writeFileSync(file, text, { flag: 'wx', mode: 0o600 }); // 已存在就失敗，不覆寫
  chmodSync(file, 0o600);
}

export async function compareLegacy(options: CompareOptions): Promise<CompareOutcome> {
  const log = options.log ?? (() => {});
  const privateRoot = options.privateRoot ?? defaultPrivateRoot;

  // 1. 輸出位置與輸入帳本檔的位置（還沒碰任何資料之前先擋）
  const reportFinal = assertPrivateOutput(options.reportPath, privateRoot);
  const summaryFinal = assertPrivateOutput(summaryPathFor(options.reportPath), privateRoot);
  if (options.privateRoot === undefined) {
    assertGitIgnored(reportFinal);
    assertGitIgnored(summaryFinal);
  }
  let ledgerFile: string;
  try {
    if (!existsSync(options.ledgerPath) || !lstatSync(options.ledgerPath).isFile()) throw new Error('not a file');
    ledgerFile = insidePrivate(options.ledgerPath, privateRoot);
  } catch {
    throw new OutputPathError(`帳本檔必須是私人資料夾（${privateRoot}）之下已存在的檔案：${options.ledgerPath}`);
  }
  for (const suffix of ['-wal', '-journal', '-shm', '.partial']) {
    if (existsSync(ledgerFile + suffix)) {
      throw new ConversionStopped(`帳本檔旁邊有殘留的 ${path.basename(ledgerFile + suffix)}，代表它可能沒有正常寫完或關閉，不能保證副本與原檔一致。請重新轉換出一份新的帳本檔再比對。`);
    }
  }

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
  const tempDir = mkdtempSync(path.join(realpathSync(privateRoot), 'legacy-compare-tmp-'));
  const tempFile = path.join(tempDir, 'ledger-copy.sqlite');
  let budget, transactions, recompute: ReportContext['recompute'];
  try {
    copyFileSync(ledgerFile, tempFile, constants.COPYFILE_EXCL);
    chmodSync(tempFile, 0o600);
    const db = openNodeDatabase(tempFile);
    try {
      const ledger = await openLedger(db);
      log('透過帳本服務查詢 App 的月結數字與交易 ...');
      const listed = await ledger.listBudgetMonths();
      const views = new Map<string, BudgetMonthView>();
      for (const m of listed) views.set(m.month, await ledger.getBudgetMonth(m.month));
      budget = compareBudgetMonths(views, listed.map((m) => m.month), sources, raw);
      const all = await ledger.listTransactions('0001-01-01', '9999-12-31');
      transactions = compareTransactions(all, legacy.transactions);

      log('重算報告（僅供參考）...');
      try {
        const state = parseBudgetDocument(await ledger.exportFinanceDocument());
        const incomeByMonth = new Map<string, number>();
        for (const m of state.months) incomeByMonth.set(m.month, await ledger.getMonthIncome(m.month));
        const expensesByMonth = new Map<string, { category: string; amount: number }[]>();
        for (const t of all) {
          if (t.flow !== 'expense') continue;
          const month = t.date.slice(0, 7);
          expensesByMonth.set(month, [...(expensesByMonth.get(month) ?? []), { category: t.categoryName, amount: t.amount }]);
        }
        const of = (month: string): TransactionsOfMonth => ({ income: incomeByMonth.get(month) ?? 0, expenses: expensesByMonth.get(month) ?? [] });
        recompute = { months: recomputeMonths(state, of) };
      } catch (e) {
        recompute = { error: e instanceof Error ? e.message : String(e) }; // 重算出錯不影響門檻結論
      }
      await ledger.close();
    } finally {
      try { await db.close(); } catch { /* 已經關了 */ }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true }); // 暫時副本一定刪掉
  }
  if (fileSha256(ledgerFile) !== ledgerHashBefore) {
    throw new Error('帳本檔在比對過程中被改動（SHA-256 前後不同）。比對結果不可信，沒有產生報告。');
  }

  // 4. 報告與摘要（不覆寫）
  const ctx: ReportContext = {
    date: taipeiDate((options.now ?? (() => new Date()))()),
    tool: options.toolVersion ?? gitVersion(),
    manifestSha256: verified.manifestSha256,
    sourceDatabase: String(verified.manifest.sourceDatabase ?? ''),
    sourceCommit: String(verified.manifest.sourceCommit ?? ''),
    ledgerSha256: ledgerHashBefore,
    budget, transactions, recompute,
  };
  const summary = buildSummary(ctx);
  writeNew(reportFinal, buildReport(ctx));
  writeNew(summaryFinal, summary.join('\n') + '\n');
  const count = thresholdDifferences(ctx).length;
  return { passed: count === 0, thresholdDifferences: count, reportPath: reportFinal, summaryPath: summaryFinal, summary };
}
