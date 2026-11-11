// 舊帳轉換：已驗證的匯出目錄 → App 的帳本檔（SQLite）。只給翰陞在 Mac 上跑，不打包進 App。
// 所有資料都經由帳本服務寫入（importLegacyLedger），不直接對資料表下 SQL；
// 先寫到暫存檔，全部檢查通過才以「不覆寫」的方式改成正式檔名，失敗不留任何輸出。
import { deepStrictEqual } from 'node:assert/strict';
import { chmodSync, linkSync, unlinkSync } from 'node:fs';
import { defaultPrivateRoot, verifyExport, type VerifiedExport } from '../../../../tools/lib/verify-export.mjs';
import { shiftMonth } from '../../src/calc/dates.ts';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { ledgerMigrations } from '../../src/ledger/migrations.ts';
import { LedgerError, openLedger, type LegacyImportData } from '../../src/ledger/index.ts';
import { ACCOUNT_KINDS, type AccountKind } from '../../src/ledger/defaults.ts';
import { guessKind, deriveOpeningBalances } from './accounts.ts';
import { LegacyExportError, readLegacyExport, type LegacyData } from './legacyData.ts';
import { BASELINE_20261108, baselineDifferences, type BaselineIdentity } from './baseline.ts';
import { assertGitIgnored, assertPrivateOutput } from './output.ts';
import { buildPlan, type MixedFlowMode } from './plan.ts';

/** 需要人處理才能繼續的情況（衝突、不合規定的列、缺少回答…）。message 是給翰陞看的完整說明。 */
export class ConversionStopped extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionStopped';
  }
}

export interface ConvertOptions {
  /** 已驗證的私人匯出目錄（含 manifest.json）。 */
  exportDirectory: string;
  /** 輸出的帳本檔路徑：必須在私人位置之下、尚不存在。 */
  outputPath: string;
  /** 私人位置；預設為 repo 的 .private/。只有測試會傳別的。 */
  privateRoot?: string;
  /** 同一分類名稱同時有收入與支出時的處理：stop（預設，停下列出）或 split。 */
  mixedFlow?: MixedFlowMode;
  /** 帳戶名稱 → 種類（命令列 --account）。 */
  accountKinds?: Record<string, AccountKind>;
  /** 帳戶名稱 → 搬遷截止月月底的餘額（命令列 --opening）。 */
  openingBalances?: Record<string, number>;
  /**
   * 預期的舊帳基準身分；預設是 docs/cloudflare/baseline.md 記錄的 2026-11-08 基準（baseline.ts）。
   * 只給程式介面（測試）用，命令列沒有關閉這項檢查的旗標。
   */
  expectedBaseline?: BaselineIdentity;
  /** 若給，匯出清冊（manifest.json）的 SHA-256 必須相同，用來釘住「就是那一份」匯出。 */
  expectedManifestSha256?: string;
  /** 執行時詢問；沒給時，需要詢問的地方會停下並列出缺少的項目。 */
  ask?: (question: string) => Promise<string>;
  log?: (line: string) => void;
}

export interface OpeningSummary { account: string; amount: number; source: string }

export interface ConvertSummary {
  outputPath: string;
  manifestSha256: string;
  sourceCommit: string;
  sourceDatabase: string;
  cutoffMonth: string;
  openingDate: string;
  transactions: number;
  accounts: number;
  categories: number;
  members: number;
  months: number;
  monthsWithLegacyDifference: number;
  documentVersion: number;
  incomeTotal: number;
  expenseTotal: number;
  firstDate: string | null;
  lastDate: string | null;
  openings: OpeningSummary[];
  /** 舊系統帳戶表的 Balance（原字串）；僅供參考，未用於計算。 */
  legacyAccountBalances: { account: string; balance: string }[];
  /** 匯出裡沒有搬入的資料表與列數（員工、信用卡明細、投資…）。 */
  notMigrated: { table: string; rows: number }[];
  notices: string[];
}

const KIND_QUESTION =
  '可填：cash（現金）、bank（銀行）、credit_card（信用卡）、e_wallet（電子支付）';
const KIND_WORDS = new Map<string, AccountKind>([
  ...ACCOUNT_KINDS.map((k): [string, AccountKind] => [k, k]),
  ['現金', 'cash'], ['銀行', 'bank'], ['信用卡', 'credit_card'], ['電子支付', 'e_wallet'],
]);
const MIGRATED_TABLES = ['transactions', 'transaction', 'categories', 'category', 'accounts', 'account', 'members', 'member', 'financeworkspace'];
const ATTEMPTS = 3;

async function askUntil<T>(ask: (q: string) => Promise<string>, question: string, parse: (answer: string) => T | null): Promise<T> {
  for (let i = 0; i < ATTEMPTS; i += 1) {
    const value = parse((await ask(question)).trim());
    if (value !== null) return value;
  }
  throw new ConversionStopped(`連續 ${ATTEMPTS} 次回答的格式不對，已停止：${question}`);
}

export const parseMoney = (answer: string): number | null => {
  const cleaned = answer.replaceAll(',', '');
  return /^-?\d+$/.test(cleaned) && Number.isSafeInteger(Number(cleaned)) ? Number(cleaned) : null;
};

export async function convertLegacy(options: ConvertOptions): Promise<ConvertSummary> {
  const log = options.log ?? (() => {});
  const privateRoot = options.privateRoot ?? defaultPrivateRoot;

  // 1. 輸出位置（還沒碰任何資料之前先擋）
  const final = assertPrivateOutput(options.outputPath, privateRoot);
  if (options.privateRoot === undefined) assertGitIgnored(final);

  // 2. 來源驗證：任何不符就拋錯，什麼都不產生
  log('驗證來源匯出的清冊與每個檔案的 SHA-256 ...');
  const verified = verifyExport(options.exportDirectory, { privateRoot });
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
  if (legacy.cutoffMonth === null) throw new ConversionStopped('財務文件裡沒有任何月結月份，無法決定搬遷截止月與開帳日。');
  const cutoffMonth = legacy.cutoffMonth;
  const openingDate = `${shiftMonth(cutoffMonth, 1)}-01`;

  // 3. 整理成帶入計畫；有任何要人裁決的問題就停下
  const planned = buildPlan(legacy, { mixedFlow: options.mixedFlow ?? 'stop' });
  if (!planned.plan) {
    throw new ConversionStopped(['舊帳有需要你決定的地方，已停止，沒有產生任何輸出：', ...planned.problems.map((p) => `- ${p}`)].join('\n'));
  }
  const plan = planned.plan;

  // 4. 帳戶種類與開帳餘額
  const givenKinds = new Map(Object.entries(options.accountKinds ?? {}));
  const givenOpenings = new Map(Object.entries(options.openingBalances ?? {}));
  for (const key of [...givenKinds.keys(), ...givenOpenings.keys()]) {
    if (!plan.accounts.includes(key)) {
      throw new ConversionStopped(`參數裡的帳戶「${key}」不在舊帳裡。舊帳的帳戶有：${plan.accounts.map((a) => `「${a}」`).join('、')}。`);
    }
  }
  const missing: string[] = [];
  const kinds = new Map<string, AccountKind>();
  for (const name of plan.accounts) {
    const known = givenKinds.get(name) ?? guessKind(name);
    if (known) {
      kinds.set(name, known);
    } else if (options.ask) {
      const kind = await askUntil(options.ask, `帳戶「${name}」是哪一種？${KIND_QUESTION}`, (a) => KIND_WORDS.get(a) ?? null);
      kinds.set(name, kind);
    } else {
      missing.push(`帳戶「${name}」的種類（加參數 --account ${name}=cash|bank|credit_card|e_wallet）`);
    }
  }
  const derived = deriveOpeningBalances(legacy.checks, cutoffMonth, plan.accounts);
  const openings: OpeningSummary[] = [];
  for (const name of plan.accounts) {
    const given = givenOpenings.get(name);
    if (given !== undefined) {
      openings.push({ account: name, amount: given, source: '命令列參數' });
    } else if (derived.balances.has(name)) {
      const d = derived.balances.get(name)!;
      openings.push({ account: name, amount: d.amount, source: d.source });
    } else if (options.ask) {
      const hint = kinds.get(name) === 'credit_card' ? '（信用卡填未繳金額的負數）' : '';
      const amount = await askUntil(
        options.ask,
        `帳戶「${name}」在 ${cutoffMonth} 月底（開帳日 ${openingDate} 前一刻）的餘額是多少？新台幣整數${hint}`,
        parseMoney,
      );
      openings.push({ account: name, amount, source: '執行時輸入' });
    } else {
      missing.push(`帳戶「${name}」在 ${cutoffMonth} 月底的餘額（加參數 --opening ${name}=金額）`);
    }
  }
  if (missing.length > 0) {
    throw new ConversionStopped(['還缺少下列資料，而且沒有辦法詢問（或已設定不詢問），已停止：', ...missing.map((m) => `- ${m}`), ...derived.notes.map((n) => `  說明：${n}`)].join('\n'));
  }
  const openingOf = new Map(openings.map((o) => [o.account, o.amount]));

  // 5. 寫入暫存檔（只經由帳本服務）→ 檢查 → 改成正式檔名（不覆寫）
  const data: LegacyImportData = {
    openingDate,
    accounts: plan.accounts.map((name) => ({ name, kind: kinds.get(name)!, openingBalance: openingOf.get(name)! })),
    categories: plan.categories,
    members: plan.members,
    transactions: plan.transactions,
    document: legacy.document,
  };
  const partial = `${final}.partial`;
  log('寫入帳本檔 ...');
  let committed = false;
  let db: ReturnType<typeof openNodeDatabase> | undefined;
  const oldMask = process.umask(0o077); // 私人資料：只有自己能讀寫
  try {
    db = openNodeDatabase(partial);
    chmodSync(partial, 0o600);
    const ledger = await openLedger(db);
    let result;
    try {
      result = await ledger.importLegacyLedger(data);
    } catch (e) {
      if (e instanceof LedgerError) throw new ConversionStopped(`帳本服務拒絕了這批舊帳，已停止，沒有產生輸出：${e.message}`);
      throw e;
    }

    // 與計畫獨立重算的數字相互核對
    const income = plan.transactions.filter((t) => t.flow === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = plan.transactions.filter((t) => t.flow === 'expense').reduce((s, t) => s + t.amount, 0);
    deepStrictEqual(
      [result.transactions, result.incomeTotal, result.expenseTotal, result.accounts, result.categories, result.members, result.months],
      [plan.transactions.length, income, expense, plan.accounts.length, plan.categories.length, plan.members.length, legacy.months],
    );
    await ledger.close();
    db = undefined;

    // 關檔後重新開啟輸出檔，只透過帳本服務的查詢讀回，與計畫逐項比對
    await verifyReopened(partial, data, legacy);

    linkSync(partial, final); // 目的檔若剛好出現就會失敗，不會覆寫
    committed = true;

    const dates = plan.transactions.map((t) => t.date).sort();
    return {
      outputPath: final,
      manifestSha256: verified.manifestSha256,
      sourceCommit: String(verified.manifest.sourceCommit ?? ''),
      sourceDatabase: String(verified.manifest.sourceDatabase ?? ''),
      cutoffMonth,
      openingDate,
      transactions: result.transactions,
      accounts: result.accounts,
      categories: result.categories,
      members: result.members,
      months: result.months,
      monthsWithLegacyDifference: result.monthsWithLegacyDifference,
      documentVersion: result.version,
      incomeTotal: result.incomeTotal,
      expenseTotal: result.expenseTotal,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      openings,
      legacyAccountBalances: legacy.accounts
        .filter((a) => typeof a.name === 'string')
        .map((a) => ({ account: a.name as string, balance: String(a.balance ?? '') })),
      notMigrated: notMigrated(verified),
      notices: [...planned.notices, ...derived.notes],
    };
  } finally {
    process.umask(oldMask);
    try { await db?.close(); } catch { /* 已經關了 */ }
    try { unlinkSync(partial); } catch { /* 沒有暫存檔也沒關係 */ }
    if (!committed) try { unlinkSync(`${partial}-journal`); } catch { /* 同上 */ }
  }
}

const FULL_RANGE: [string, string] = ['0001-01-01', '9999-12-31'];

/** 重新開啟輸出檔並讀回全部內容（帳戶、分類、成員、開帳日、交易、財務文件、結構版本），與要寫入的資料比對。 */
async function verifyReopened(file: string, data: LegacyImportData, legacy: LegacyData): Promise<void> {
  const db = openNodeDatabase(file);
  try {
    const ledger = await openLedger(db);
    const fail = (what: string): never => {
      throw new Error(`重新開啟輸出檔讀回的${what}與要寫入的不同，已停止，沒有產生輸出。`);
    };
    const version = await db.get<{ user_version: number }>('PRAGMA user_version');
    if (version?.user_version !== ledgerMigrations.length) fail('結構版本');
    const integrity = await db.get<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity?.integrity_check !== 'ok' || (await db.all('PRAGMA foreign_key_check')).length > 0) fail('完整性檢查結果');
    const same = (a: unknown, b: unknown) => {
      try { deepStrictEqual(a, b); return true; } catch { return false; }
    };
    if (!same((await ledger.listAccounts()).map((a) => [a.name, a.kind, a.openingBalance]), data.accounts.map((a) => [a.name, a.kind, a.openingBalance]))) fail('帳戶');
    if (!same((await ledger.listCategories()).map((c) => [c.name, c.flow]), data.categories.map((c) => [c.name, c.flow]))) fail('分類');
    if (!same((await ledger.listMembers()).map((m) => m.name), data.members)) fail('成員');
    if ((await ledger.getOpeningDate()) !== data.openingDate) fail('開帳日');
    // 交易：多重集合（日期、分類、帳戶、收支別、金額、成員）逐筆比對
    const key = (t: [string, string, string, string, number, string | null]) => JSON.stringify(t);
    const counts = new Map<string, number>();
    for (const t of data.transactions) counts.set(key([t.date, t.category, t.account, t.flow, t.amount, t.member]), (counts.get(key([t.date, t.category, t.account, t.flow, t.amount, t.member])) ?? 0) + 1);
    const stored = await ledger.listTransactions(...FULL_RANGE);
    if (stored.length !== data.transactions.length) fail('交易筆數');
    for (const t of stored) {
      const k = key([t.date, t.categoryName, t.accountName, t.flow, t.amount, t.memberName]);
      const left = counts.get(k) ?? 0;
      if (left === 0) fail('交易內容');
      counts.set(k, left - 1);
    }
    if ((await ledger.listBudgetMonths()).length !== legacy.months) fail('月結月份數');
    if (!sameDocument(await ledger.exportFinanceDocument(), legacy.document)) {
      throw new ConversionStopped('財務文件經帳本服務讀回後與來源不同（可能含有帳本不認得的欄位），為免悄悄改動舊帳，已停止。請把這個情況回報。');
    }
    await ledger.close();
  } finally {
    try { await db.close(); } catch { /* 已經關了 */ }
  }
}

function notMigrated(verified: VerifiedExport): { table: string; rows: number }[] {
  return verified.tables
    .filter((t) => !MIGRATED_TABLES.includes(t.sourceTable.toLowerCase()))
    .map((t) => ({ table: t.source, rows: t.rows.length }));
}

/** 比較兩份財務文件 JSON 的內容（屬性順序不計；null 與缺漏視為相同，因為 C# 會輸出 null 而帳本讀回也補 null）。 */
function sameDocument(exported: string, source: string): boolean {
  const strip = (_key: string, value: unknown) => (value === null ? undefined : value);
  try {
    deepStrictEqual(JSON.parse(JSON.stringify(JSON.parse(exported), strip)), JSON.parse(JSON.stringify(JSON.parse(source), strip)));
    return true;
  } catch {
    return false;
  }
}

export function formatSummary(s: ConvertSummary): string[] {
  const yen = (n: number) => n.toLocaleString('en-US');
  return [
    '轉換完成。摘要（供票 05 比對；金額為新台幣元）：',
    `  輸出檔：${s.outputPath}`,
    `  來源：資料庫 ${s.sourceDatabase}、程式版本 ${s.sourceCommit}`,
    `  來源清冊 SHA-256：${s.manifestSha256}`,
    `  交易：${s.transactions} 筆（${s.firstDate ?? '-'} 至 ${s.lastDate ?? '-'}）；收入合計 ${yen(s.incomeTotal)}、支出合計 ${yen(s.expenseTotal)}`,
    `  帳戶 ${s.accounts}、分類 ${s.categories}、成員 ${s.members}`,
    `  財務文件：版本 ${s.documentVersion}，${s.months} 個月結（截止 ${s.cutoffMonth}），其中 ${s.monthsWithLegacyDifference} 個月有歷史總資產差異（原樣保留、未重算）`,
    `  開帳日 ${s.openingDate}，各帳戶開帳餘額：`,
    ...s.openings.map((o) => `    ${o.account}：${yen(o.amount)}（${o.source}）`),
    '  舊系統帳戶表的餘額（舊系統帳戶表的值，僅供參考，未用於計算）：',
    ...s.legacyAccountBalances.map((b) => `    ${b.account}：${b.balance}`),
    `  未搬入的資料表：${s.notMigrated.length ? s.notMigrated.map((t) => `${t.table}（${t.rows} 列）`).join('、') : '無'}`,
    ...(s.notices.length ? ['注意事項：', ...s.notices.map((n) => `  - ${n}`)] : []),
  ];
}
