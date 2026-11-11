// 命令列入口：node tools/legacy-convert/cli.ts <匯出目錄> <輸出檔> [選項]
// 只給翰陞在 Mac 上跑；用法與每個詢問的回答方式見 docs/legacy-migration.md。
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import type { Readable } from 'node:stream';
import { ACCOUNT_KINDS, type AccountKind } from '../../src/ledger/defaults.ts';
import { EXIT, UsageError, consoleIo, isMainModule, type Io as BaseIo } from '../common.ts';
import { OutputPathError } from './output.ts';
import { ConversionStopped, convertLegacy, formatSummary, parseMoney, type ConvertOptions, type ConvertSummary } from './convert.ts';

export { UsageError };

export const USAGE = `用法：node tools/legacy-convert/cli.ts <匯出目錄> <輸出檔> [選項]
  <匯出目錄>   已驗證的私人匯出（在 .private/ 之下，含 manifest.json）
  <輸出檔>     要產生的帳本檔，必須在 .private/ 之下且尚不存在
選項：
  --mixed-flow split          同一分類同時有收入與支出時，把筆數較少的那一邊拆成「原名（收入）」或「原名（支出）」；
                              不加此選項遇到這種分類會停下並列出
  --account 名稱=種類          指定帳戶種類（cash／bank／credit_card／e_wallet），可重複
  --opening 名稱=金額          指定帳戶在搬遷截止月月底的餘額（新台幣整數，信用卡填未繳金額的負數），可重複
  --card-account 名稱         舊信用卡明細全部所屬的信用卡帳戶（多卡時必填或執行時回答；混合多卡不自動分配）
  --manifest-sha256 <雜湊>     若給，匯出清冊（manifest.json）的 SHA-256 必須相同
  --no-prompt                 不詢問；需要回答的地方改為停下並列出缺少的項目`;

function pairs(values: string[] | undefined, flag: string): [string, string][] {
  return (values ?? []).map((v) => {
    const i = v.lastIndexOf('=');
    if (i <= 0 || i === v.length - 1) throw new UsageError(`${flag} 要寫成 名稱=值，收到：${v}`);
    return [v.slice(0, i), v.slice(i + 1)];
  });
}

export function parseCliArgs(argv: string[]): Pick<ConvertOptions, 'exportDirectory' | 'outputPath' | 'mixedFlow' | 'accountKinds' | 'openingBalances' | 'cardStatementAccount' | 'expectedManifestSha256'> & { prompt: boolean } {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'mixed-flow': { type: 'string' },
        account: { type: 'string', multiple: true },
        opening: { type: 'string', multiple: true },
        'card-account': { type: 'string' },
        'manifest-sha256': { type: 'string' },
        'no-prompt': { type: 'boolean' },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 2) throw new UsageError('需要剛好兩個位置參數：<匯出目錄> <輸出檔>。');
  const mixed = values['mixed-flow'];
  if (mixed !== undefined && mixed !== 'split') throw new UsageError('--mixed-flow 目前只支援 split。');
  const accountKinds = new Map<string, AccountKind>();
  for (const [name, kind] of pairs(values.account, '--account')) {
    if (!(ACCOUNT_KINDS as readonly string[]).includes(kind)) throw new UsageError(`--account 的種類只能是 ${ACCOUNT_KINDS.join('、')}，收到：${kind}`);
    accountKinds.set(name, kind as AccountKind);
  }
  const openingBalances = new Map<string, number>();
  for (const [name, text] of pairs(values.opening, '--opening')) {
    const amount = parseMoney(text);
    if (amount === null) throw new UsageError(`--opening 的金額要是整數，收到：${text}`);
    openingBalances.set(name, amount);
  }
  return {
    exportDirectory: positionals[0],
    outputPath: positionals[1],
    mixedFlow: mixed === 'split' ? 'split' : 'stop',
    // fromEntries 會把 '__proto__' 這種名稱也建成自己的屬性
    accountKinds: Object.fromEntries(accountKinds),
    openingBalances: Object.fromEntries(openingBalances),
    cardStatementAccount: values['card-account'],
    expectedManifestSha256: values['manifest-sha256']?.toLowerCase(),
    prompt: values['no-prompt'] !== true,
  };
}

interface Io extends BaseIo {
  /** 輸入是互動終端嗎；預設看 process.stdin.isTTY。不是就不詢問（等同 --no-prompt）。 */
  interactive?: boolean;
  input?: Readable;
}

/** 結束代碼：0 成功；2 需要人處理（已說明原因，沒有輸出）；1 其他錯誤（含來源驗證失敗）；64 用法錯誤。 */
export async function main(
  argv: string[],
  convert: (options: ConvertOptions) => Promise<ConvertSummary> = convertLegacy,
  io: Io = consoleIo,
): Promise<number> {
  let rl: ReturnType<typeof createInterface> | undefined;
  let closed = false;
  try {
    const { prompt, ...args } = parseCliArgs(argv);
    const input: Readable = io.input ?? process.stdin;
    const interactive = io.interactive ?? (process.stdin.isTTY === true);
    const ask = prompt && interactive
      ? async (question: string) => {
          if (!rl) {
            rl = createInterface({ input, output: process.stdout });
            rl.on('close', () => { closed = true; });
          }
          if (closed) throw new ConversionStopped('輸入已關閉，無法回答詢問。請改用 --account／--opening 參數事先指定。');
          const onClose = new Promise<never>((_, reject) => {
            rl!.once('close', () => reject(new ConversionStopped(`輸入已關閉，無法回答詢問：${question}\n請改用 --account／--opening 參數事先指定。`)));
          });
          onClose.catch(() => {}); // 已回答完才關閉時，不要變成未處理的拒絕
          return Promise.race([rl.question(`\n${question}\n> `), onClose]);
        }
      : undefined;
    const summary = await convert({ ...args, ask, log: io.out });
    for (const line of formatSummary(summary)) io.out(line);
    return EXIT.ok;
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`${e.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    if (e instanceof ConversionStopped || e instanceof OutputPathError) {
      io.err(e.message);
      return EXIT.stopped;
    }
    io.err(`轉換失敗，沒有產生輸出：${e instanceof Error ? e.message : String(e)}\n（若訊息提到 Checksum、manifest 或 inventory，代表來源匯出未通過驗證，請重新取得已驗證的匯出，不要修改它。）`);
    return EXIT.failed;
  } finally {
    rl?.close();
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
