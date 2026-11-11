// 命令列入口：node tools/legacy-compare/cli.ts <匯出目錄> <帳本檔> <報告檔> [選項]
// 只給翰陞在 Mac 上跑；用法見 docs/legacy-migration.md「比對」一節。
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ConversionStopped } from '../legacy-convert/source.ts';
import { OutputPathError } from '../legacy-convert/output.ts';
import { compareLegacy, type CompareOptions, type CompareOutcome } from './run.ts';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** 結束代碼：0 門檻全過；3 門檻有差異（報告與摘要仍會寫出）；2 輸入驗證或位置問題；1 其他錯誤；64 用法錯誤。 */
export const EXIT = { ok: 0, failed: 1, stopped: 2, differences: 3, usage: 64 } as const;

export const USAGE = `用法：node tools/legacy-compare/cli.ts <匯出目錄> <帳本檔> <報告檔> [選項]
  <匯出目錄>   已驗證的私人匯出（在 .private/ 之下，含 manifest.json）；與轉換時用的是同一份
  <帳本檔>     轉換程式輸出的帳本檔（在 .private/ 之下）；比對只讀它的暫時副本，不會改動它
  <報告檔>     完整報告的輸出路徑（在 .private/ 之下、尚不存在，例如 .private/app-ledger/compare.md）；
               摘要會寫在旁邊，檔名為 <報告檔名>-summary<副檔名>
選項：
  --manifest-sha256 <雜湊>     若給，匯出清冊（manifest.json）的 SHA-256 必須相同`;

export function parseCliArgs(argv: string[]): Pick<CompareOptions, 'exportDirectory' | 'ledgerPath' | 'reportPath' | 'expectedManifestSha256'> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { 'manifest-sha256': { type: 'string' } } });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  if (parsed.positionals.length !== 3) throw new UsageError('需要剛好三個位置參數：<匯出目錄> <帳本檔> <報告檔>。');
  const [exportDirectory, ledgerPath, reportPath] = parsed.positionals;
  return { exportDirectory, ledgerPath, reportPath, expectedManifestSha256: parsed.values['manifest-sha256']?.toLowerCase() };
}

interface Io { out(line: string): void; err(line: string): void }
const consoleIo: Io = { out: (l) => console.log(l), err: (l) => console.error(l) };

export async function main(
  argv: string[],
  compare: (options: CompareOptions) => Promise<CompareOutcome> = compareLegacy,
  io: Io = consoleIo,
): Promise<number> {
  try {
    const outcome = await compare({ ...parseCliArgs(argv), log: io.out });
    for (const line of outcome.summary) io.out(line);
    io.out('');
    io.out(`完整報告（私人，含金額，不要放進 Git）：${outcome.reportPath}`);
    io.out(`摘要檔：${outcome.summaryPath}`);
    if (outcome.passed) return EXIT.ok;
    io.err(`門檻項目有 ${outcome.thresholdDifferences} 項差異，比對未通過（結束代碼 ${EXIT.differences}）。月份與欄位見上方摘要，金額見完整報告。`);
    return EXIT.differences;
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`${e.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    if (e instanceof ConversionStopped || e instanceof OutputPathError) {
      io.err(e.message);
      return EXIT.stopped;
    }
    io.err(`比對失敗，沒有產生報告：${e instanceof Error ? e.message : String(e)}\n（若訊息提到 Checksum、manifest 或 inventory，代表來源匯出未通過驗證，請重新取得已驗證的匯出，不要修改它。）`);
    return EXIT.failed;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
