// 比對工具的端到端測試：虛構匯出 → 轉換 → 比對。資料全部虛構；測試裡直接改帳本檔是「製造壞資料」，不是工具行為。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../../../tools/lib/verify-export.mjs';
import { OutputPathError } from '../legacy-convert/output.ts';
import { ConversionStopped } from '../legacy-convert/source.ts';
import { comparableExport, fictionalBaseline, writeFictionalExport } from '../legacy-convert/testExport.ts';
import { summaryPathFor } from './run.ts';
import { setup } from './testSupport.ts';

const NUMBERS = /(?<![0-9A-Za-z])-?\d{1,3}(?:,\d{3})+(?![0-9A-Za-z])|(?<![0-9A-Za-z.-])-?\d{4,}(?![0-9A-Za-z-])/g;

test('虛構匯出轉換後比對：門檻全部 0 差異，歷史差異同額，交易相同', async () => {
  const t = await setup();
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
    assert.equal(outcome.thresholdDifferences, 0);
    const text = outcome.summary.join('\n');
    assert.match(text, /結論：已比對範圍（逐月數字、交易、信用卡明細）全部通過，0 差異/);
    assert.match(text, /尚未涵蓋：投資（票 20）/);
    assert.match(text, /4 個月/);
    assert.match(text, /歷史總資產差異：資產表推得 2 個月、來源財務文件 2 個月、App 2 個月有差異；每月同額：是；預期 2 個月（相符）/);
    assert.match(text, /來源 15 筆、App 15 筆/);
    assert.match(text, /資產表 4 個月；預算表逐月列 3 個月；預算表累計列已比對；上限表 2 個月/);
    assert.match(text, /當月盈餘 1 個、上限快照 2 個、資產欄位 0 個/);
    assert.match(text, /執行日期：2026-11-12/);
    assert.match(text, /commit abc123def456/);
    // 重算：2026-07 無前月、2026-08／10 一致、2026-09 有差異
    assert.match(text, /共 4 個月，可重算 3 個月，其中 1 個月有差異；無法重算 1 個月/);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /重算有差異不代表 App 算錯/);
    assert.match(report, /\| 2026-09 \| 有 \d+ 項差異/);
    assert.match(report, /\| 2026-07 \| 無法重算 \|/);
    assert.match(report, /\| 2026-08 \| 一致 \|/);
  } finally { t.cleanup(); }
});

test('改帳本某月某分類的儲備：失敗並指出月份與欄位，摘要不含金額', async () => {
  const t = await setup();
  try {
    await t.editDocument((doc) => { doc.Months.find((m: any) => m.Month === '2026-09').Balances.food += 1; });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /\| 2026-09 \| 各分類儲備：飲食 \| 1,500 \| 1,501 \| 來源財務文件 \|/);
    assert.ok(outcome.summary.some((l) => l.includes('2026-09：各分類儲備')));
    assert.match(outcome.summary.join('\n'), /結論：門檻項目未通過/);
    assert.ok(!outcome.summary.some((l) => l.includes('2026-10：')), '只有被改的月份有差異');
  } finally { t.cleanup(); }
});

test('最近月份的各分類儲備：舊 budget 表的累計列（新增類別併入「其他」）獨立比對', async () => {
  const t = await setup();
  try {
    await t.editDocument((doc) => { doc.Months.find((m: any) => m.Month === '2026-10').Balances.pet += 7; });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /\| 2026-10 \| 各分類儲備（budget 累計列，最近月份）：其他 \| 1,300 \| 1,307 \| budget 資料表 \|/);
    assert.match(report, /\| 2026-10 \| 各分類儲備：寵物 \| 300 \| 307 \| 來源財務文件 \|/);
  } finally { t.cleanup(); }
});

test('改可用餘額：Property 與來源財務文件兩道比對都會抓到', async () => {
  const t = await setup();
  try {
    await t.editDocument((doc) => { doc.Months.find((m: any) => m.Month === '2026-08').RawSpare += 5; });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /\| 2026-08 \| 可用餘額 \| 11,450 \| 11,455 \| Property 資料表 \|/);
    assert.match(report, /\| 2026-08 \| 帳面總資產（含歷史差異） \|/);
  } finally { t.cleanup(); }
});

test('改一筆交易金額：筆數相同但金額加總與逐筆不同，失敗', async () => {
  const t = await setup();
  try {
    await t.tamper('UPDATE transactions SET amount = amount + 1 WHERE date = ? AND amount = ?', ['2026-08-06', 4700]);
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /\| 交易 \| 交易總金額（收入＋支出）/);
    assert.match(report, /\| 交易 \| 分月 2026-08 支出 金額加總 \|/);
    assert.match(report, /逐筆 2026-08-06 飲食 現金 支出 4700/);
    assert.ok(outcome.summary.some((l) => l.includes('交易逐筆內容')));
    // 筆數沒有差異
    assert.doesNotMatch(report, /交易總筆數 \|/);
  } finally { t.cleanup(); }
});

test('少一筆交易：筆數差異', async () => {
  const t = await setup();
  try {
    await t.tamper('DELETE FROM transactions WHERE date = ?', ['2026-11-03']);
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /交易總筆數 \| 15 \| 14/);
  } finally { t.cleanup(); }
});

test('歷史總資產差異：被改掉或抹掉都失敗；同額重現才通過', async () => {
  const t = await setup();
  try {
    await t.editDocument((doc) => { doc.Months.find((m: any) => m.Month === '2026-09').LegacyTotalDifference = 0; });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /\| 2026-09 \| 歷史總資產差異 \| 12 \| 0 \| Property 資料表 \|/);
    assert.match(report, /\| 2026-09 \| 帳面總資產（含歷史差異） \|/);
    assert.match(outcome.summary.join('\n'), /每月同額：否/);
  } finally { t.cleanup(); }
});

test('匯出的 Property 與文件不一致（來源被動過）：抓得到獨立舊表的差異', async () => {
  const data = comparableExport();
  data.projections!.property[1].tuitionfee = (data.projections!.property[1].tuitionfee as number) + 9;
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /\| 2026-08 \| 學費儲備 \| 209 \| 200 \| Property 資料表 \|/);
  } finally { t.cleanup(); }
});

test('上限快照：與 BudgetCap 那一列或文件不同都失敗', async () => {
  const t = await setup();
  try {
    await t.editDocument((doc) => {
      const m = doc.Months.find((x: any) => x.Month === '2026-10');
      m.Revision.Limits.find((l: any) => l.CategoryId === 'food').Amount += 100;
    });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const report = readFileSync(outcome.reportPath, 'utf8');
    assert.match(report, /\| 2026-10 \| 上限快照：上限 飲食 \| 5,500 \| 5,600 \| BudgetCap 資料表 \|/);
    assert.match(report, /上限快照：各分類上限/);
  } finally { t.cleanup(); }
});

test('重算有差異（2026-09）仍以成功結束；重算段落不影響結論', async () => {
  const t = await setup();
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true);
    const report = readFileSync(outcome.reportPath, 'utf8');
    // 2026-09：交易算出盈餘 3,100，存檔 2,600
    assert.match(report, /\| 當月盈餘 \| 2,600 \| 3,100 \| 500 \|/);
    assert.match(report, /\| 原始可用餘額（不含調整） \| 14,100 \| 14,600 \| 500 \|/);
  } finally { t.cleanup(); }
});

test('原帳本檔位元組不變，暫時副本已刪除，只多報告與摘要兩個檔', async () => {
  const t = await setup();
  try {
    const before = sha256(readFileSync(t.ledgerPath));
    const files = readdirSync(t.priv).sort();
    const outcome = await t.run();
    assert.equal(sha256(readFileSync(t.ledgerPath)), before);
    assert.match(outcome.summary.join('\n'), new RegExp(before));
    assert.deepEqual(readdirSync(t.priv).sort(), [...files, 'report-summary.md', 'report.md'].sort());
    assert.equal(outcome.summaryPath, summaryPathFor(path.join(t.priv, 'report.md')));
  } finally { t.cleanup(); }
});

test('就算比對失敗，原帳本檔也不變，暫時副本也刪除', async () => {
  const t = await setup();
  try {
    await t.tamper('UPDATE transactions SET amount = amount + 1 WHERE id = 1');
    const before = sha256(readFileSync(t.ledgerPath));
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    assert.equal(sha256(readFileSync(t.ledgerPath)), before);
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.includes('tmp') || f.includes('copy')), []);
  } finally { t.cleanup(); }
});

test('摘要找不到虛構資料的金額與名稱（成功與失敗兩種情況）', async () => {
  const t = await setup();
  try {
    const names = ['飲食', '薪資', '電話網路', '其他', '現金', '銀行', '小明', '寵物', '水費', '虛構店家'];
    const amounts = [8000, 9000, 9500, 10000, 800, 4700, 750, 400, 4800, 300, 5100, 700, 280, 60, 5000, 1000, 5500, 900, 11500, 14100, 17300, 2500, 2600, 3200, 420];
    const check = (lines: string[]) => {
      // 「信用卡明細」是功能名稱；其餘帳戶、分類、成員與店家名稱都不能出現。
      const text = lines.filter((l) => !l.startsWith('尚未涵蓋：')).join('\n');
      for (const n of names) assert.ok(!text.includes(n), `摘要含有名稱 ${n}`);
      const found = (text.match(NUMBERS) ?? []).map((x) => Number(x.replaceAll(',', '')));
      for (const a of amounts) assert.ok(!found.includes(a), `摘要含有金額 ${a}`);
    };
    const ok = await t.run();
    check(ok.summary);
    assert.equal(readFileSync(ok.summaryPath, 'utf8'), ok.summary.join('\n') + '\n');

    await t.editDocument((doc) => { doc.Months.find((m: any) => m.Month === '2026-09').Balances.food += 123; });
    const failed = await t.run({ reportPath: path.join(t.priv, 'report2.md') });
    assert.equal(failed.passed, false);
    check(failed.summary);
    // 完整報告則有金額與名稱
    assert.match(readFileSync(failed.reportPath, 'utf8'), /飲食/);
  } finally { t.cleanup(); }
});

test('報告位置把關：私人位置以外拒絕、已存在不覆寫；帳本檔必須在私人位置內', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.run({ reportPath: path.join(t.root, 'report.md') }), OutputPathError);
    writeFileSync(path.join(t.priv, 'exists.md'), 'precious');
    await assert.rejects(t.run({ reportPath: path.join(t.priv, 'exists.md') }), /已存在/);
    assert.equal(readFileSync(path.join(t.priv, 'exists.md'), 'utf8'), 'precious');
    // 摘要檔已存在也拒絕，且報告不會寫出
    writeFileSync(path.join(t.priv, 'x-summary.md'), 'precious');
    await assert.rejects(t.run({ reportPath: path.join(t.priv, 'x.md') }), /已存在/);
    assert.ok(!existsSync(path.join(t.priv, 'x.md')));
    // 帳本檔在私人位置之外 / 不存在
    const outside = path.join(t.root, 'outside.sqlite');
    writeFileSync(outside, 'x');
    await assert.rejects(t.run({ ledgerPath: outside }), ConversionStopped);
    await assert.rejects(t.run({ ledgerPath: path.join(t.priv, 'nope.sqlite') }), ConversionStopped);
  } finally { t.cleanup(); }
});

test('來源驗證：竄改的匯出拒絕、基準身分不符拒絕；都不產生報告', async () => {
  const t = await setup();
  try {
    writeFileSync(path.join(t.exportDirectory, 'dbo.Property.json'), '[]');
    await assert.rejects(t.run(), /Checksum differs/);
    const other = writeFictionalExport(t.priv, t.data);
    await assert.rejects(t.run({ exportDirectory: other, expectedBaseline: { ...fictionalBaseline(t.data), transactions: 999 } }), ConversionStopped);
    await assert.rejects(t.run({ exportDirectory: other, expectedManifestSha256: '0'.repeat(64) }), /清冊/);
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('report')), []);
  } finally { t.cleanup(); }
});

test('帳本檔旁有殘留的 journal／wal：拒絕', async () => {
  const t = await setup();
  try {
    writeFileSync(t.ledgerPath + '-journal', 'x');
    await assert.rejects(t.run(), ConversionStopped);
  } finally { t.cleanup(); }
});

test('匯出缺少獨立投影表（Property）：停下，不產生報告', async () => {
  const data = comparableExport();
  delete data.projections;
  const t = await setup(data);
  try {
    await assert.rejects(t.run(), /Property/);
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('report')), []);
  } finally { t.cleanup(); }
});

test('轉換時用 --mixed-flow split 拆出「原名（收入）」：依分類比對併回原名，仍通過', async () => {
  const data = comparableExport();
  data.transactions.push({ Id: 16, date: '2026-10-20T00:00:00', Category: '飲食', Amount: 30, Member: null, Account: '現金', TransactionType: '收' });
  const t = await setup(data, { mixedFlow: 'split' });
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
    assert.match(outcome.summary.join('\n'), /來源 16 筆、App 16 筆/);
  } finally { t.cleanup(); }
});
