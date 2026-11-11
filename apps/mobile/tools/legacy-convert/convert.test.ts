// 轉換程式的端到端測試：虛構匯出 → 帳本檔，再經帳本服務讀回來驗證。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { openLedger } from '../../src/ledger/index.ts';
import { serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { ConversionStopped, convertLegacy, formatSummary, type ConvertOptions } from './convert.ts';
import { BASELINE_20261108 } from './baseline.ts';
import { FICTIONAL_PASSWORD, fictionalBaseline, fictionalExport, fictionalState, writeFictionalExport, type FictionalExport } from './testExport.ts';

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'legacy-convert-'));
  const priv = path.join(root, '.private');
  mkdirSync(priv);
  return { root, priv, out: path.join(priv, 'ledger.sqlite'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** 回答「信用卡」的開帳餘額問題；其他問題一律視為測試錯誤。 */
const answers = (map: Record<string, string> = {}) => async (question: string) => {
  for (const [key, answer] of Object.entries(map)) if (question.includes(key)) return answer;
  throw new Error(`沒預期的詢問：${question}`);
};

async function convert(over: Partial<ConvertOptions> & { priv: string; out: string; data?: FictionalExport }) {
  const { priv, out, data, ...rest } = over;
  const exportDirectory = writeFictionalExport(priv, data);
  return convertLegacy({
    exportDirectory, outputPath: out, privateRoot: priv, ask: answers({ 信用卡: '-300' }), log: () => {},
    expectedBaseline: fictionalBaseline(data), ...rest,
  });
}

async function stopped(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof ConversionStopped, `預期 ConversionStopped，實際 ${String(e)}`);
    return e.message;
  }
  assert.fail('預期轉換停下，但成功了');
}

test('端到端：交易（含重複列）、分類、帳戶、成員、財務文件都搬進輸出檔，並回傳摘要', async () => {
  const t = setup();
  try {
    const summary = await convert(t);
    assert.deepEqual(
      [summary.transactions, summary.accounts, summary.categories, summary.members, summary.months, summary.monthsWithLegacyDifference],
      [5, 3, 4, 1, 2, 1],
    );
    assert.equal(summary.incomeTotal, 40000);
    assert.equal(summary.expenseTotal, 150 + 150 + 80 + 60);
    assert.equal(summary.openingDate, '2026-11-01');
    assert.equal(summary.cutoffMonth, '2026-10');

    const ledger = await openLedger(openNodeDatabase(t.out));
    assert.deepEqual((await ledger.listCategories()).map((c) => [c.name, c.flow]), [
      ['飲食', 'expense'], ['薪資', 'income'], ['沒用到的分類', 'expense'], ['表外分類', 'expense'],
    ]);
    assert.deepEqual((await ledger.listAccounts()).map((a) => [a.name, a.kind, a.openingBalance]), [
      ['現金', 'cash', 1060], ['銀行', 'bank', 20000], ['信用卡', 'credit_card', -300],
    ]);
    assert.equal(await ledger.getOpeningDate(), '2026-11-01');
    const sept = await ledger.getDayTransactions('2026-09-02');
    assert.deepEqual(sept.map((d) => [d.amount, d.accountName, d.memberName]), [[150, '現金', '小明'], [150, '現金', '小明']]);
    assert.equal((await ledger.getDayTransactions('2026-10-15'))[0].memberName, null);
    assert.equal((await ledger.getDayTransactions('2026-11-03')).length, 1);
    // 58 個月的對應：這裡是 2 個月，原樣、不重算，歷史差異保留
    assert.deepEqual((await ledger.listBudgetMonths()).map((m) => [m.month, m.total]), [['2026-09', 5800], ['2026-10', 6912]]);
    assert.deepEqual(JSON.parse(await ledger.exportFinanceDocument()), JSON.parse(serializeBudgetDocument(fictionalState())));
    await ledger.close();
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('ledger')), ['ledger.sqlite']); // 沒有殘留的 .partial
  } finally { t.cleanup(); }
});

test('不搬員工、密碼、信用卡明細、投資：輸出檔沒有這些資料表，也找不到密碼', async () => {
  const t = setup();
  try {
    await convert(t);
    const db = openNodeDatabase(t.out);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);
    assert.deepEqual(tables, ['accounts', 'categories', 'finance_document', 'ledger_meta', 'members', 'settings', 'transactions']);
    await db.close();
    assert.ok(!readFileSync(t.out).includes(Buffer.from(FICTIONAL_PASSWORD)));
    assert.ok(!readFileSync(t.out).includes(Buffer.from('虛構店家')));
  } finally { t.cleanup(); }
});

test('輸出檔就是合格的備份檔：用「匯入備份檔」在全新手機上還原，內容與輸出檔相同（票 16）', async () => {
  const t = setup();
  try {
    await convert(t);
    const files = {
      directory: t.priv,
      open: async (p: string) => openNodeDatabase(p),
      remove: async (p: string) => rmSync(p, { force: true }),
    };
    const phone = await openLedger(openNodeDatabase(path.join(t.priv, 'phone.sqlite')), { backupFiles: files });
    const info = await phone.inspectBackup(t.out);
    assert.equal(info.olderThanCurrent, false);
    assert.ok(info.lastModifiedAt);
    await phone.restoreBackup(t.out);

    const original = await openLedger(openNodeDatabase(t.out));
    const all = (l: typeof phone) => l.listTransactions('0001-01-01', '9999-12-31');
    assert.deepEqual(await all(phone), await all(original));
    assert.deepEqual(await phone.listAccounts(), await original.listAccounts());
    assert.equal(await phone.exportFinanceDocument(), await original.exportFinanceDocument());
    await original.close();
    await phone.close();
  } finally { t.cleanup(); }
});

test('來源驗證：竄改、缺檔、formatVersion 不認得都拒絕，且不產生輸出', async () => {
  const t = setup();
  try {
    const run = (dir: string) => convertLegacy({ exportDirectory: dir, outputPath: t.out, privateRoot: t.priv, ask: answers({ 信用卡: '0' }), log: () => {}, expectedBaseline: fictionalBaseline() });
    const tampered = writeFictionalExport(t.priv);
    writeFileSync(path.join(tampered, 'dbo.Transactions.json'), '[]');
    await assert.rejects(run(tampered), /Checksum differs/);

    const missing = writeFictionalExport(t.priv);
    rmSync(path.join(missing, 'dbo.Members.json'));
    await assert.rejects(run(missing), /ENOENT/);

    const wrongVersion = writeFictionalExport(t.priv);
    const manifest = JSON.parse(readFileSync(path.join(wrongVersion, 'manifest.json'), 'utf8'));
    manifest.formatVersion = 2;
    writeFileSync(path.join(wrongVersion, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(run(wrongVersion), /Unsupported or unverified/);

    const unfinished = writeFictionalExport(t.priv);
    writeFileSync(path.join(unfinished, 'INCOMPLETE'), 'x');
    await assert.rejects(run(unfinished), /Incomplete/);

    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('ledger')), []);
  } finally { t.cleanup(); }
});

test('可用 expectedManifestSha256 釘住整份清冊：不符就拒絕', async () => {
  const t = setup();
  try {
    await assert.rejects(convert({ ...t, expectedManifestSha256: '0'.repeat(64) }), /清冊/);
    assert.ok(!existsSync(t.out));
  } finally { t.cleanup(); }
});

test('輸出位置：私人位置以外拒絕；目的檔已存在不覆寫', async () => {
  const t = setup();
  try {
    await assert.rejects(convert({ ...t, out: path.join(t.root, 'ledger.sqlite') }), /私人資料夾/);
    writeFileSync(t.out, 'precious');
    await assert.rejects(convert(t), /已存在/);
    assert.equal(readFileSync(t.out, 'utf8'), 'precious');
  } finally { t.cleanup(); }
});

test('不合 App 限制的列：停下並列出，不產生輸出', async () => {
  const t = setup();
  try {
    const data = fictionalExport();
    data.transactions.push({ Id: 6, date: '2026-10-20T00:00:00', Category: '飲食', Amount: 0, Member: null, Account: '現金', TransactionType: '支' });
    const message = await stopped(convert({ ...t, data }));
    assert.match(message, /金額不是大於 0 的整數：1 筆/);
    assert.ok(!existsSync(t.out));
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('ledger')), []);
  } finally { t.cleanup(); }
});

test('同一分類收入與支出並用：預設停下列出衝突；--mixed-flow split 拆出少數那邊', async () => {
  const t = setup();
  try {
    const data = fictionalExport();
    data.transactions.push({ Id: 6, date: '2026-10-20T00:00:00', Category: '飲食', Amount: 30, Member: null, Account: '現金', TransactionType: '收' });
    const message = await stopped(convert({ ...t, data }));
    assert.match(message, /飲食/);
    assert.match(message, /收入 1 筆、支出 3 筆/);
    assert.ok(!existsSync(t.out));

    const summary = await convert({ ...t, data, mixedFlow: 'split' });
    assert.ok(summary.notices.some((n) => n.includes('飲食（收入）')));
    const ledger = await openLedger(openNodeDatabase(t.out));
    const day = await ledger.getDayTransactions('2026-10-20');
    assert.deepEqual([day[0].categoryName, day[0].flow, day[0].amount], ['飲食（收入）', 'income', 30]);
    assert.ok((await ledger.listCategories()).some((c) => c.name === '飲食（收入）' && c.flow === 'income'));
    await ledger.close();
  } finally { t.cleanup(); }
});

test('帳戶種類：猜不出時詢問、可用參數事先指定；沒有詢問管道時停下', async () => {
  const t = setup();
  try {
    const data = fictionalExport();
    data.accounts.push({ AccountId: 4, AccountName: '神秘帳戶', Balance: '0.00' });
    const asked: string[] = [];
    const ask = async (q: string) => {
      asked.push(q);
      return q.includes('哪一種') ? 'e_wallet' : q.includes('餘額') ? '5' : '';
    };
    await convert({ ...t, data, ask });
    assert.ok(asked.some((q) => q.includes('神秘帳戶') && q.includes('哪一種')));
    const ledger = await openLedger(openNodeDatabase(t.out));
    assert.equal((await ledger.listAccounts()).find((a) => a.name === '神秘帳戶')!.kind, 'e_wallet');
    await ledger.close();
    rmSync(t.out);

    // 參數事先指定：不再詢問種類與餘額
    const noAsk = await convert({ ...t, data, ask: undefined, accountKinds: { 神秘帳戶: 'bank' }, openingBalances: { 信用卡: -1, 神秘帳戶: 0 } });
    assert.equal(noAsk.accounts, 4);
    rmSync(t.out);

    const message = await stopped(convert({ ...t, data, ask: undefined }));
    assert.match(message, /神秘帳戶/);
    assert.match(message, /信用卡/);
    assert.ok(!existsSync(t.out));
  } finally { t.cleanup(); }
});

test('開帳餘額：現金與銀行取自最近核對（含倒回）；信用卡詢問；--opening 覆蓋；不是搬遷截止月的核對一律詢問', async () => {
  const t = setup();
  try {
    const asked: string[] = [];
    await convert({ ...t, ask: async (q) => { asked.push(q); return '-300'; } });
    assert.equal(asked.length, 1);
    assert.match(asked[0], /信用卡/);
    assert.match(asked[0], /2026-10/);
    rmSync(t.out);

    const override = await convert({ ...t, openingBalances: { 現金: 7 } });
    assert.equal(override.openings.find((o) => o.account === '現金')!.amount, 7);
    assert.equal(override.openings.find((o) => o.account === '現金')!.source, '命令列參數');
    assert.equal(override.openings.find((o) => o.account === '銀行')!.source, 'check-1');
    rmSync(t.out);

    const data = fictionalExport();
    (data.state.checks[0] as { Month: string }).Month = '2026-09';
    const asked2: string[] = [];
    await convert({ ...t, data, ask: async (q) => { asked2.push(q); return '1'; } });
    assert.equal(asked2.length, 3); // 三個帳戶都要問
  } finally { t.cleanup(); }
});

test('參數裡的帳戶名稱打錯（不在舊帳）就停下', async () => {
  const t = setup();
  try {
    assert.match(await stopped(convert({ ...t, openingBalances: { 不存在: 1 } })), /不存在/);
    assert.match(await stopped(convert({ ...t, accountKinds: { 不存在: 'cash' } })), /不存在/);
    assert.ok(!existsSync(t.out));
  } finally { t.cleanup(); }
});

test('財務文件有問題就拒絕：資料列版本與文件不一致、非 nullable 字串欄位是 null', async () => {
  const t = setup();
  try {
    const mismatch = fictionalExport();
    mismatch.workspaceVersion = '99';
    assert.match(await stopped(convert({ ...t, data: mismatch })), /版本/);

    const nullField = fictionalExport();
    nullField.documentText = serializeBudgetDocument(nullField.state).replace('"Actor":"legacy"', '"Actor":null');
    assert.match(await stopped(convert({ ...t, data: nullField })), /財務文件/);
    assert.ok(!existsSync(t.out));
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('ledger')), []);
  } finally { t.cleanup(); }
});

test('基準身分：預設要求符合 baseline.md 的記錄，虛構匯出不符就拒絕；任一項不符都拒絕並指出哪一項', async () => {
  const t = setup();
  try {
    const dir = writeFictionalExport(t.priv);
    const base = { exportDirectory: dir, outputPath: t.out, privateRoot: t.priv, ask: answers({ 信用卡: '0' }), log: () => {} };
    const message = await stopped(convertLegacy(base)); // 沒給預期值 → 用正式的 baseline.md 身分
    assert.match(message, /baseline\.md/);
    assert.match(message, /ERPDB_CloudflareBaseline_20261108_115129/);
    assert.deepEqual(
      [BASELINE_20261108.tables, BASELINE_20261108.totalRows, BASELINE_20261108.transactions, BASELINE_20261108.workspaceMonths],
      [16, 7823, 7033, 58],
    );
    const good = fictionalBaseline();
    for (const [what, over] of [
      ['來源資料庫', { sourceDatabase: 'ERPDB' }], ['資料表張數', { tables: 9 }], ['總列數', { totalRows: 1 }],
      ['交易筆數', { transactions: 7033 }], ['月結月份數', { workspaceMonths: 58 }], ['歷史資產差異', { historicalAssetMismatches: 1 }],
    ] as const) {
      assert.match(await stopped(convertLegacy({ ...base, expectedBaseline: { ...good, ...over } })), new RegExp(what), what);
    }
    assert.ok(!existsSync(t.out));
  } finally { t.cleanup(); }
});

test('財務文件實際月數與清冊記錄的月數不同就拒絕', async () => {
  const t = setup();
  try {
    const data = fictionalExport();
    const dir = writeFictionalExport(t.priv, data);
    const manifestFile = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    manifest.validation.workspaceMonths = 3;
    writeFileSync(manifestFile, JSON.stringify(manifest));
    const message = await stopped(convertLegacy({ exportDirectory: dir, outputPath: t.out, privateRoot: t.priv, log: () => {},
      expectedBaseline: { ...fictionalBaseline(data), workspaceMonths: 3 } }));
    assert.match(message, /財務文件實際月結月份數/);
  } finally { t.cleanup(); }
});

test('輸出檔權限是 600', async () => {
  const t = setup();
  try {
    await convert(t);
    assert.equal(statSync(t.out).mode & 0o777, 0o600);
  } finally { t.cleanup(); }
});

test('帳戶名稱叫 constructor 或 __proto__ 也照常運作（不會誤用物件原型上的屬性）', async () => {
  const t = setup();
  try {
    const data = fictionalExport();
    data.accounts.push({ AccountId: 4, AccountName: 'constructor', Balance: '0.00' }, { AccountId: 5, AccountName: '__proto__', Balance: '0.00' });
    const asked: string[] = [];
    await convert({ ...t, data, ask: async (q) => { asked.push(q); return q.includes('哪一種') ? 'cash' : '3'; } });
    assert.ok(asked.some((q) => q.includes('constructor') && q.includes('哪一種')));
    const ledger = await openLedger(openNodeDatabase(t.out));
    assert.deepEqual((await ledger.listAccounts()).filter((a) => a.name === 'constructor' || a.name === '__proto__').map((a) => [a.name, a.openingBalance]),
      [['constructor', 3], ['__proto__', 3]]);
    await ledger.close();
  } finally { t.cleanup(); }
});

test('財務文件是 null 或月結清單含 null：說明清楚地停下，不丟 TypeError', async () => {
  const t = setup();
  try {
    const a = fictionalExport();
    a.documentText = 'null';
    a.workspaceVersion = 'undefined';
    assert.match(await stopped(convert({ ...t, data: a })), /財務文件/);
    const b = fictionalExport();
    b.documentText = '{"Version":4,"Months":[null]}';
    assert.match(await stopped(convert({ ...t, data: b })), /財務文件/);
  } finally { t.cleanup(); }
});

test('摘要列出舊系統帳戶表的餘額（僅供參考）', async () => {
  const t = setup();
  try {
    const data = fictionalExport();
    data.accounts[0].Balance = '1234.00';
    const summary = await convert({ ...t, data });
    assert.deepEqual(summary.legacyAccountBalances[0], { account: '現金', balance: '1234.00' });
    const text = formatSummary(summary).join('\n');
    assert.match(text, /現金：1234\.00/);
    assert.match(text, /僅供參考，未用於計算/);
  } finally { t.cleanup(); }
});
