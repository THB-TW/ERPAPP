// 比對工具的逐項檢查測試：每一道檢查各有自己的測試（只動舊表那一側、只動來源文件那一側、只動帳本那一側）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { OutputPathError } from '../legacy-convert/output.ts';
import { ConversionStopped } from '../legacy-convert/source.ts';
import { comparableExport, comparableState, projectionsFor, type FictionalExport } from '../legacy-convert/testExport.ts';
import { EXIT, main } from './cli.ts';
import { COMPARE_EXPECTATIONS_20261108 } from './expectations.ts';
import { ReportWriteFailed } from './run.ts';
import { TEMP_PREFIX } from './tempCopy.ts';
import { setup } from './testSupport.ts';

type Doc = any;
const month = (doc: Doc, m: string) => doc.Months.find((x: Doc) => x.Month === m);
const sources = (o: { differences: { source: string }[] } | undefined) => new Set(o?.differences.map((d) => d.source));

/** 比對後讀報告表格的每一列（月份／範圍、欄位、來源值、App 值、比對來源）。 */
function reportRows(reportPath: string) {
  return readFileSync(reportPath, 'utf8').split('\n').filter((l) => l.startsWith('| ')).map((l) => l.split(' | ').map((c) => c.replace(/^\| /, '').replace(/ \|$/, '')));
}
const diffRows = (reportPath: string) => reportRows(reportPath).filter((r) => r.length === 6 && r[0] !== '月份／範圍');
const sourcesOf = (rows: string[][]) => new Set(rows.map((r) => r[4]));
const hasRow = (rows: string[][], kindWord: string, source: string) => rows.some((r) => r[1].includes(kindWord) && r[4] === source);

// ---- 每個月結欄位：三種單獨竄改 ----

interface DocSpec {
  name: string;
  month: string;
  mutate: (doc: Doc) => void;
  /** 差異欄位名稱要包含的字 */
  field: string;
  /** 來源財務文件那一道的欄位名稱（與 field 不同時才給） */
  docField?: string;
  /** 帳本單獨被改時，獨立舊表那一道（Property／budget／BudgetCap）也該抓到：[欄位字, 比對來源] */
  independent?: [string, string];
}

const DOC_SPECS: DocSpec[] = [
  { name: '當月收入', month: '2026-09', mutate: (d) => { month(d, '2026-09').Income += 1; }, field: '當月收入', independent: ['當月收入', 'Property 資料表'] },
  { name: '當月盈餘', month: '2026-09', mutate: (d) => { month(d, '2026-09').Surplus += 1; }, field: '當月盈餘', independent: ['當月盈餘', 'budget 資料表'] },
  { name: '可用餘額（原始）', month: '2026-09', mutate: (d) => { month(d, '2026-09').RawSpare += 1; }, field: '可用餘額', independent: ['可用餘額', 'Property 資料表'] },
  { name: '學費儲備', month: '2026-09', mutate: (d) => { month(d, '2026-09').Tuition += 1; }, field: '學費儲備', independent: ['學費儲備', 'Property 資料表'] },
  { name: '各分類儲備（含總儲備金）', month: '2026-09', mutate: (d) => { month(d, '2026-09').Balances.food += 1; }, field: '總儲備金', independent: ['總儲備金', 'Property 資料表'] },
  { name: '歷史總資產差異', month: '2026-09', mutate: (d) => { month(d, '2026-09').LegacyTotalDifference += 1; }, field: '歷史總資產差異', independent: ['歷史總資產差異', 'Property 資料表'] },
  { name: '歷史月份標記', month: '2026-09', mutate: (d) => { month(d, '2026-09').Migrated = false; }, field: 'migrated' },
  { name: '上限快照：版本編號', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Id = 'other-id'; }, field: '版本編號' },
  { name: '上限快照：版本月份', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Month = '2026-09'; }, field: '版本月份' },
  { name: '上限快照：學費提撥', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Tuition += 1; }, field: '學費儲備提撥', independent: ['學費儲備提撥', 'BudgetCap 資料表'] },
  { name: '上限快照：飲食上限', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Limits.find((l: Doc) => l.CategoryId === 'food').Amount += 1; }, field: '上限 飲食', docField: '各分類上限', independent: ['上限 飲食', 'BudgetCap 資料表'] },
  { name: '上限快照：電話網路上限（第 11 欄）', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Limits.find((l: Doc) => l.CategoryId === 'phone').Amount += 1; }, field: '上限 電話網路', docField: '各分類上限', independent: ['上限 電話網路', 'BudgetCap 資料表'] },
  { name: '上限快照：第 12 欄（gogoro）', month: '2026-10', mutate: (d) => { d.Categories.push({ Id: 'gogoro', Name: '機車', Kind: 'fixed' }); month(d, '2026-10').Revision.Limits.push({ CategoryId: 'gogoro', Amount: 5 }); }, field: '上限 機車', docField: '各分類上限', independent: ['上限 gogoro', 'BudgetCap 資料表'] },
  { name: '上限快照：BudgetCap 沒有的欄位必須是 0', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Limits.find((l: Doc) => l.CategoryId === 'water').Amount = 5; }, field: '上限 水費', docField: '各分類上限', independent: ['BudgetCap 無此欄', 'BudgetCap 資料表'] },
  { name: '上限快照：分類歸屬', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision.Mapping['飲食'] = 'other'; }, field: '分類歸屬' },
  { name: '上限快照：有無', month: '2026-10', mutate: (d) => { month(d, '2026-10').Revision = null; }, field: '上限快照有無', independent: ['上限快照有無', 'BudgetCap 資料表'] },
];

for (const spec of DOC_SPECS) {
  test(`只有來源財務文件那一側不同（${spec.name}）：只有「來源財務文件」那一道抓到`, async () => {
    const data = comparableExport();
    const doc = JSON.parse(serializeBudgetDocument(data.state));
    spec.mutate(doc);
    data.documentText = JSON.stringify(doc);
    const t = await setup(data);
    try {
      // 帳本換回原本的文件：帳本與舊表一致，只有來源文件不同
      await t.tamper('UPDATE finance_document SET document = ? WHERE id = 1', [serializeBudgetDocument(comparableState())]);
      const outcome = await t.run();
      assert.equal(outcome.passed, false);
      const rows = diffRows(outcome.reportPath);
      assert.deepEqual([...sourcesOf(rows)], ['來源財務文件'], rows.map((r) => r.join(' | ')).join('\n'));
      assert.ok(rows.some((r) => r[0] === spec.month && r[1].includes(spec.docField ?? spec.field)), `找不到 ${spec.month} 的「${spec.docField ?? spec.field}」`);
    } finally { t.cleanup(); }
  });

  test(`只有帳本那一側不同（${spec.name}）：來源財務文件那一道抓到${spec.independent ? `，獨立舊表（${spec.independent[1]}）也抓到` : ''}`, async () => {
    const t = await setup();
    try {
      await t.editDocument(spec.mutate);
      const outcome = await t.run();
      assert.equal(outcome.passed, false);
      const rows = diffRows(outcome.reportPath);
      assert.ok(rows.some((r) => r[0] === spec.month && r[1].includes(spec.docField ?? spec.field) && r[4] === '來源財務文件'), `來源財務文件沒抓到 ${spec.month} 的「${spec.docField ?? spec.field}」`);
      if (spec.independent) {
        assert.ok(rows.some((r) => r[0] === spec.month && r[1].includes(spec.independent![0]) && r[4] === spec.independent![1]), `${spec.independent[1]} 沒抓到`);
      }
    } finally { t.cleanup(); }
  });
}

interface LegacySpec { name: string; mutate: (data: FictionalExport) => void; field: string; source: string }
const prop = (d: FictionalExport, m: string) => d.projections!.property.find((r) => String(r.date).startsWith(m))!;
const budgetRow = (d: FictionalExport, m: string) => d.projections!.budget.find((r) => String(r.date).startsWith(m))!;
const capRow = (d: FictionalExport, m: string) => d.projections!.budgetCap.find((r) => String(r.month).startsWith(m))!;
const bump = (row: Record<string, unknown>, key: string, by = 1) => { row[key] = (row[key] as number) + by; };
const LEGACY_SPECS: LegacySpec[] = [
  { name: 'Property 當月收入', mutate: (d) => bump(prop(d, '2026-09'), 'own'), field: '當月收入', source: 'Property 資料表' },
  { name: 'Property 可用餘額', mutate: (d) => bump(prop(d, '2026-09'), 'sparemoney'), field: '可用餘額', source: 'Property 資料表' },
  { name: 'Property 學費儲備', mutate: (d) => bump(prop(d, '2026-09'), 'tuitionfee'), field: '學費儲備', source: 'Property 資料表' },
  { name: 'Property 總儲備金', mutate: (d) => bump(prop(d, '2026-09'), 'budget'), field: '總儲備金', source: 'Property 資料表' },
  { name: 'Property 帳面總資產', mutate: (d) => bump(prop(d, '2026-09'), 'totalproperty'), field: '帳面總資產', source: 'Property 資料表' },
  { name: 'budget 當月盈餘', mutate: (d) => bump(budgetRow(d, '2026-09'), 'gete'), field: '當月盈餘', source: 'budget 資料表' },
  { name: 'BudgetCap 學費提撥', mutate: (d) => bump(capRow(d, '2026-10'), 'tuition'), field: '學費儲備提撥', source: 'BudgetCap 資料表' },
  { name: 'BudgetCap 飲食上限', mutate: (d) => bump(capRow(d, '2026-10'), 'food'), field: '上限 飲食', source: 'BudgetCap 資料表' },
  { name: 'BudgetCap 電話網路上限（第 11 欄）', mutate: (d) => bump(capRow(d, '2026-10'), 'phone'), field: '上限 電話網路', source: 'BudgetCap 資料表' },
  { name: 'BudgetCap 第 12 欄（gogoro）', mutate: (d) => bump(capRow(d, '2026-10'), 'gogoro'), field: '上限 gogoro', source: 'BudgetCap 資料表' },
  ...['food', 'car', 'fun', 'study', 'cloth', 'articles', 'furniture', 'hair', 'health', 'other'].map((id): LegacySpec => ({
    name: `budget 累計列 ${id}`, mutate: (d) => bump(budgetRow(d, '1911-01'), id), field: '各分類儲備（budget 累計列', source: 'budget 資料表',
  })),
];

for (const spec of LEGACY_SPECS) {
  test(`只有舊表那一側不同（${spec.name}）：只有那張舊表抓到`, async () => {
    const data = comparableExport();
    spec.mutate(data);
    const t = await setup(data);
    try {
      const outcome = await t.run();
      assert.equal(outcome.passed, false);
      const rows = diffRows(outcome.reportPath);
      assert.deepEqual([...sourcesOf(rows)], [spec.source], rows.map((r) => r.join(' | ')).join('\n'));
      assert.ok(rows.some((r) => r[1].includes(spec.field)), `找不到「${spec.field}」`);
      if (spec.name.startsWith('budget 累計列')) assert.equal(rows.length, 1, '累計列的每一個類別各自獨立檢查');
    } finally { t.cleanup(); }
  });
}

// ---- 月份清單 ----

test('Property 少一個月：月份清單差異標「Property 資料表」；摘要提示帳本可能不是這份匯出轉出', async () => {
  const data = comparableExport();
  data.projections!.property = data.projections!.property.filter((r) => !String(r.date).startsWith('2026-08'));
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const rows = diffRows(outcome.reportPath).filter((r) => r[1].startsWith('月份清單'));
    assert.deepEqual(rows.map((r) => [r[0], r[4]]), [['2026-08', 'Property 資料表']]);
    assert.match(outcome.summary.join('\n'), /帳本檔可能不是由這份匯出轉出/);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /帳本檔可能不是由這份匯出轉出/);
    // 摘要檔不放操作指示；怎麼處理只寫在完整報告
    assert.doesNotMatch(outcome.summary.join('\n'), /manifest-sha256/);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /manifest-sha256/);
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('report')).sort(), ['report-summary.md', 'report.md']);
  } finally { t.cleanup(); }
});

test('來源財務文件少一個月（Property 還有）：標「Property 資料表」，不標來源財務文件', async () => {
  const data = comparableExport();
  data.state.months = data.state.months.filter((m) => m.month !== '2026-07');
  const t = await setup(data);
  try {
    const outcome = await t.run();
    const rows = diffRows(outcome.reportPath).filter((r) => r[1].startsWith('月份清單'));
    assert.deepEqual(rows.map((r) => [r[0], r[4]]), [['2026-07', 'Property 資料表']]);
  } finally { t.cleanup(); }
});

test('來源財務文件多一個月（Property 沒有）：標「Property 資料表」', async () => {
  const data = comparableExport();
  const extra = structuredClone(data.state.months[0]);
  extra.id = 'm6'; extra.month = '2026-06';
  data.state.months.unshift(extra);
  const t = await setup(data);
  try {
    const outcome = await t.run();
    const rows = diffRows(outcome.reportPath).filter((r) => r[1].startsWith('月份清單'));
    assert.deepEqual(rows.map((r) => [r[0], r[4]]), [['2026-06', 'Property 資料表']]);
  } finally { t.cleanup(); }
});

test('帳本少一個月、Property 也沒有：標「來源財務文件」，不標 Property', async () => {
  const data = comparableExport();
  data.projections!.property = data.projections!.property.filter((r) => !String(r.date).startsWith('2026-07'));
  const t = await setup(data);
  try {
    await t.editDocument((d) => { d.Months = d.Months.filter((m: Doc) => m.Month !== '2026-07'); });
    const outcome = await t.run();
    const rows = diffRows(outcome.reportPath).filter((r) => r[1].startsWith('月份清單'));
    assert.deepEqual(rows.map((r) => [r[0], r[4]]), [['2026-07', '來源財務文件']]);
  } finally { t.cleanup(); }
});

test('App 才有的分類儲備（來源沒有）：抓到', async () => {
  const t = await setup();
  try {
    await t.editDocument((d) => { d.Categories.push({ Id: 'zzz', Name: '只在App', Kind: 'reserve' }); month(d, '2026-09').Balances.zzz = 5; });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    assert.ok(diffRows(outcome.reportPath).some((r) => r[1] === '各分類儲備：zzz' && r[2] === '0' && r[3] === '5' && r[4] === '來源財務文件'));
  } finally { t.cleanup(); }
});

test('來源有儲備、App 的月份裡沒有那個分類：抓到（只列 App 有的分類會漏掉）', async () => {
  const t = await setup();
  try {
    await t.editDocument((d) => { delete month(d, '2026-09').Balances.other; });
    const outcome = await t.run();
    assert.ok(diffRows(outcome.reportPath).some((r) => r[0] === '2026-09' && r[1] === '各分類儲備：其他' && r[3] === '0'));
  } finally { t.cleanup(); }
});

// ---- 整份財務文件（#13）----

test('根層上限版本（例如尚未月結的開放月份上限）被帳本改壞：只有「整份財務文件」那一項抓到', async () => {
  const data = comparableExport();
  data.state.revisions.push({
    id: 'caps-open', month: '2026-11', tuition: 130, reason: '開放月份上限', actor: 'app', time: '2026-11-02T00:00:00+08:00', mapping: { 飲食: 'food' },
    limits: [{ categoryId: 'food', amount: 5600 }],
  });
  const t = await setup(data);
  try {
    assert.equal((await t.run({ reportPath: path.join(t.priv, 'r0.md') })).passed, true, '沒動過時整份相同');
    await t.editDocument((d) => { d.Revisions.find((r: Doc) => r.Id === 'caps-open').Tuition += 1; });
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    assert.equal(outcome.thresholdDifferences, 1);
    const rows = diffRows(outcome.reportPath);
    assert.deepEqual(rows.map((r) => [r[0], r[4]]), [['財務文件', '來源財務文件']]);
  } finally { t.cleanup(); }
});

// ---- 17 個月（#23）----

test('有歷史總資產差異的月份數要等於預期：不符就是門檻差異（只有這一項）', async () => {
  const t = await setup();
  try {
    const outcome = await t.run({ expectations: { legacyDifferenceMonths: 17 } });
    assert.equal(outcome.passed, false);
    assert.equal(outcome.thresholdDifferences, 1);
    const rows = diffRows(outcome.reportPath);
    assert.deepEqual(rows.map((r) => [r[0], r[2], r[3]]), [['歷史總資產差異月數', '17', '2']]);
    assert.match(outcome.summary.join('\n'), /預期 17 個月（不符，列入差異）/);
    // 真實基準的預期值是 17
    assert.equal(COMPARE_EXPECTATIONS_20261108.legacyDifferenceMonths, 17);
  } finally { t.cleanup(); }
});

test('恰好一項門檻差異：結束代碼 3', async () => {
  const t = await setup();
  try {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(['a', 'b', 'c'], () => t.run({ expectations: { legacyDifferenceMonths: 17 } }), { out: (l) => out.push(l), err: (l) => err.push(l) });
    assert.equal(code, EXIT.differences);
    assert.match(err.join('\n'), /1 項差異/);
  } finally { t.cleanup(); }
});

// ---- 重算與寫檔失敗不改變結論（#1、#2、#20、#24）----

test('重算段落丟例外：passed、差異數、結束代碼都不變，報告說重算失敗', async () => {
  const boom = () => { throw new Error('重算壞了'); };
  const t = await setup();
  try {
    const run = async (over = {}, reportName = 'r.md') => {
      const outcome = await t.run({ recompute: boom, reportPath: path.join(t.priv, reportName), ...over });
      const code = await main(['a', 'b', 'c'], async () => outcome, { out: () => {}, err: () => {} });
      return { outcome, code };
    };
    const ok = await run();
    assert.equal(ok.outcome.passed, true);
    assert.equal(ok.outcome.thresholdDifferences, 0);
    assert.equal(ok.code, EXIT.ok);
    assert.match(readFileSync(ok.outcome.reportPath, 'utf8'), /重算過程發生錯誤，沒有結果（不影響門檻結論）：重算壞了/);
    assert.match(ok.outcome.summary.join('\n'), /重算過程發生錯誤/);

    await t.tamper('UPDATE transactions SET amount = amount + 1 WHERE id = 1');
    const normal = await t.run({ reportPath: path.join(t.priv, 'r2.md') });
    const failing = await run({}, 'r3.md');
    assert.equal(failing.outcome.passed, false);
    assert.equal(failing.outcome.thresholdDifferences, normal.thresholdDifferences);
    assert.equal(failing.code, EXIT.differences);
  } finally { t.cleanup(); }
});

test('寫報告失敗而且有門檻差異：丟帶差異數的專用錯誤（命令列結束代碼 3），沒有留下半套檔案', async () => {
  const t = await setup();
  try {
    await t.tamper('UPDATE transactions SET amount = amount + 1 WHERE id = 1');
    const before = readdirSync(t.priv).sort();
    const failure = await t.run({ writeFiles: () => { throw new Error('disk full'); } }).catch((e) => e);
    assert.ok(failure instanceof ReportWriteFailed);
    assert.ok(failure.thresholdDifferences > 0);
    assert.match(failure.message, /disk full/);
    assert.match(failure.message, /沒有留下任何報告或摘要檔/);
    assert.ok(failure.summary.length > 0);
    assert.deepEqual(readdirSync(t.priv).sort(), before);
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(['a', 'b', 'c'], async () => { throw failure; }, { out: (l) => out.push(l), err: (l) => err.push(l) });
    assert.equal(code, EXIT.differences);
    assert.match(err.join('\n'), /disk full/);
    assert.ok(out.length > 0, '摘要仍印在終端機');
  } finally { t.cleanup(); }
});

test('寫報告失敗但沒有門檻差異：結束代碼 1（沒有報告可留存）', async () => {
  const t = await setup();
  try {
    const failure = await t.run({ writeFiles: () => { throw new Error('disk full'); } }).catch((e) => e);
    assert.ok(failure instanceof ReportWriteFailed);
    assert.equal(failure.thresholdDifferences, 0);
    const err: string[] = [];
    assert.equal(await main(['a', 'b', 'c'], async () => { throw failure; }, { out: () => {}, err: (l) => err.push(l) }), EXIT.failed);
    assert.match(err.join('\n'), /以下錯誤訊息可能含私人資料/);
  } finally { t.cleanup(); }
});

test('帳本檔在比對過程中被改動（雜湊變了）不是門檻差異：維持一般錯誤', async () => {
  // 以 recompute 鉤子在比對中途改動帳本檔位元組
  const t = await setup();
  try {
    const failure = await t.run({ recompute: () => { writeFileSync(t.ledgerPath, Buffer.concat([readFileSync(t.ledgerPath), Buffer.from('x')])); return []; } }).catch((e) => e);
    assert.ok(failure instanceof Error && !(failure instanceof ReportWriteFailed));
    assert.match(failure.message, /被改動/);
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('report')), []);
  } finally { t.cleanup(); }
});

// ---- 假失敗與獨立來源（#3、#4、#11、#12）----

test('舊表裡不屬於已結月份的列（孤兒列）：不算失敗，但數量在摘要、月份在完整報告', async () => {
  const data = comparableExport();
  data.projections!.budget.push({ ...budgetRow(data, '2026-09'), date: '2026-12-01T00:00:00', gete: 777 });
  data.projections!.budgetCap.push({ ...capRow(data, '2026-10'), month: '2026-12-01' });
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
    assert.match(outcome.summary.join('\n'), /舊表裡不屬於已結月份的列（不算失敗）：預算表逐月列 1 列、上限表 1 列/);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /dbo\.budget 逐月列 1 列（2026-12）、dbo\.BudgetCap 1 列（2026-12）/);
  } finally { t.cleanup(); }
});

test('獨立舊表整張沒有資料：不算失敗，但摘要在結論旁寫出只能與來源文件比對的月份數', async () => {
  const data = comparableExport();
  data.projections!.budget = data.projections!.budget.filter((r) => String(r.date).startsWith('1911'));
  data.projections!.budgetCap = [];
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
    const lines = outcome.summary;
    const conclusion = lines.findIndex((l) => l.startsWith('結論：'));
    assert.match(lines[conclusion + 2], /獨立舊表沒有資料、只能與來源財務文件比對的月份數（不算失敗）：當月盈餘 4 個、上限快照 4 個、資產欄位 0 個/);
  } finally { t.cleanup(); }
});

test('BudgetCap 列已過時（該月不是 Migrated，例如撤銷後重結）：不拿來比對，只列為資訊', async () => {
  const data = comparableExport();
  data.state.months.find((m) => m.month === '2026-10')!.migrated = false;
  bump(capRow(data, '2026-10'), 'tuition', 9);
  bump(capRow(data, '2026-10'), 'food', 9);
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
    assert.match(outcome.summary.join('\n'), /沒有拿來比對的月份數（不算失敗）：1 個/);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /BudgetCap 列已過時，舊網站不回寫）、沒有拿來比對的月份：2026-10/);
  } finally { t.cleanup(); }
});

test('累計列「其他」的差額恰等於期初基準差額：仍是門檻差異，但報告註明是舊資料未同步；並顯示累計列的總計欄', async () => {
  const data = comparableExport();
  bump(budgetRow(data, '1911-01'), 'other', -40); // 舊累計列比文件少 40；Property.budget 沒變 → 基準差額 40
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, false);
    const rows = diffRows(outcome.reportPath);
    assert.equal(rows.length, 1);
    assert.match(rows[0][1], /budget 累計列.*其他/);
    assert.match(rows[0][5], /差額等於舊資料的期初基準差額，屬舊資料未同步，不是轉換或 App 的錯/);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /累計列的總計欄：[\d,]+；十個類別合計：[\d,]+；Property\.budget（2026-10）：[\d,]+/);
  } finally { t.cleanup(); }
});

test('累計列的差額不等於期初基準差額、或不在「其他」：沒有註明', async () => {
  const data = comparableExport();
  bump(budgetRow(data, '1911-01'), 'other', -40);
  bump(prop(data, '2026-10'), 'budget', 5); // 基準差額變 45，不等於 40
  const t = await setup(data);
  const data2 = comparableExport();
  bump(budgetRow(data2, '1911-01'), 'food', -40); // 差在「飲食」
  const t2 = await setup(data2);
  try {
    for (const run of [t, t2]) {
      const rows = diffRows((await run.run()).reportPath).filter((r) => r[1].includes('budget 累計列'));
      assert.equal(rows.length, 1);
      assert.equal(rows[0][5], '');
    }
  } finally { t.cleanup(); t2.cleanup(); }
});

// ---- 交易（#7、#9、#27）----

test('來源交易帶成員：通過；帳本那邊的成員被改掉就抓到', async () => {
  const data = comparableExport();
  data.transactions[3].Member = '小明'; // 飲食 2026-08-06
  const t = await setup(data);
  try {
    const ok = await t.run();
    assert.equal(ok.passed, true, ok.summary.join('\n'));
    await t.tamper('UPDATE transactions SET member_id = NULL WHERE date = ?', ['2026-08-06']);
    const bad = await t.run({ reportPath: path.join(t.priv, 'bad.md') });
    assert.equal(bad.passed, false);
    assert.ok(diffRows(bad.reportPath).some((r) => r[1].startsWith('逐筆 2026-08-06') && r[1].includes('小明')));
  } finally { t.cleanup(); }
});

test('2022-01-01 以前的交易也要比（查詢範圍涵蓋所有日期）', async () => {
  const data = comparableExport();
  data.transactions.push({ Id: 99, date: '2021-12-30T00:00:00', Category: '飲食', Amount: 33, Member: null, Account: '現金', TransactionType: '支' });
  const t = await setup(data);
  try {
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
    assert.match(outcome.summary.join('\n'), /來源 16 筆、App 16 筆/);
  } finally { t.cleanup(); }
});

test('摘要的交易差異帶月份（分月、逐筆），不帶金額或名稱；報告列出併回的分類名稱', async () => {
  const t = await setup();
  try {
    await t.tamper('UPDATE transactions SET amount = amount + 1 WHERE date = ? AND amount = ?', ['2026-08-06', 4700]);
    const outcome = await t.run();
    const text = outcome.summary.join('\n');
    assert.match(text, /交易 2026-08：交易（分月）/);
    assert.match(text, /交易 2026-08：交易逐筆內容/);
    assert.match(text, /交易：交易總計/);
  } finally { t.cleanup(); }
  const data = comparableExport();
  data.transactions.push({ Id: 16, date: '2026-10-20T00:00:00', Category: '飲食', Amount: 30, Member: null, Account: '現金', TransactionType: '收' });
  const s = await setup(data, { mixedFlow: 'split' });
  try {
    const outcome = await s.run();
    assert.equal(outcome.passed, true);
    assert.match(readFileSync(outcome.reportPath, 'utf8'), /從「X（收入）」併回 X 的分類名稱.*：飲食（收入）/);
    assert.ok(!outcome.summary.join('\n').includes('飲食'));
  } finally { s.cleanup(); }
});

// ---- 輸入保護（#16、#17、#19、#22）----

test('上次被中斷留下的暫時副本：開始時偵測並刪除，並在輸出中說明；跑完自己的副本也不留', async () => {
  const t = await setup();
  try {
    const stale = path.join(t.priv, `${TEMP_PREFIX}old`);
    mkdirSync(stale);
    writeFileSync(path.join(stale, 'ledger-copy.sqlite'), 'x');
    const lines: string[] = [];
    const outcome = await t.run({ log: (l) => lines.push(l) });
    assert.equal(outcome.passed, true);
    assert.ok(!existsSync(stale));
    assert.ok(lines.some((l) => l.includes('偵測到上次被中斷留下的暫時副本') && l.includes(`${TEMP_PREFIX}old`)));
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith(TEMP_PREFIX)), []);
  } finally { t.cleanup(); }
});

test('不是 App 帳本檔的輸入（空檔、沒有帳本資料表的 SQLite、不是 SQLite）：清楚拒絕（結束代碼 2 類），沒有報告', async () => {
  const t = await setup();
  try {
    const empty = path.join(t.priv, 'empty.sqlite');
    writeFileSync(empty, '');
    const other = path.join(t.priv, 'other.sqlite');
    const db = openNodeDatabase(other);
    await db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY)');
    await db.close();
    const text = path.join(t.priv, 'text.sqlite');
    writeFileSync(text, 'this is not a database, just text '.repeat(40));
    for (const ledgerPath of [empty, other, text]) {
      const failure = await t.run({ ledgerPath }).catch((e) => e);
      assert.ok(failure instanceof ConversionStopped, String(failure));
      assert.match(failure.message, /不是 App 的帳本檔/);
    }
    assert.deepEqual(readdirSync(t.priv).filter((f) => f.startsWith('report') || f.startsWith(TEMP_PREFIX)), []);
  } finally { t.cleanup(); }
});

test('帳本之後多了表與 application_id（例如備份功能的 ledger_meta）：不影響比對', async () => {
  const t = await setup();
  try {
    await t.tamper('CREATE TABLE ledger_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await t.tamper('PRAGMA application_id = 1234');
    const outcome = await t.run();
    assert.equal(outcome.passed, true, outcome.summary.join('\n'));
  } finally { t.cleanup(); }
});

test('輸出檔不能在匯出目錄裡面、不能就是帳本檔', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.run({ reportPath: path.join(t.exportDirectory, 'r.md') }), (e: Error) => e instanceof OutputPathError && /匯出目錄/.test(e.message));
    assert.deepEqual(readdirSync(t.exportDirectory).filter((f) => f.startsWith('r')), []);
    await assert.rejects(t.run({ reportPath: t.ledgerPath }), (e: Error) => e instanceof OutputPathError && /帳本檔/.test(e.message));
    // 摘要檔的路徑剛好是帳本檔
    const clash = path.join(t.priv, 'ledger-summary.sqlite');
    copyFileSync(t.ledgerPath, clash);
    await assert.rejects(t.run({ ledgerPath: clash, reportPath: path.join(t.priv, 'ledger.sqlite') }), (e: Error) => e instanceof OutputPathError && /帳本檔/.test(e.message));
  } finally { t.cleanup(); }
});

test('匯出目錄不存在、或不在私人位置之下：結束代碼 2 類的錯誤，訊息說得出原因', async () => {
  const t = await setup();
  try {
    const missing = await t.run({ exportDirectory: path.join(t.priv, 'nope') }).catch((e) => e);
    assert.ok(missing instanceof ConversionStopped);
    assert.match(missing.message, /找不到匯出目錄/);
    const outside = await t.run({ exportDirectory: t.root }).catch((e) => e);
    assert.ok(outside instanceof ConversionStopped);
    assert.match(outside.message, /必須在私人資料夾/);
  } finally { t.cleanup(); }
});

// ---- 摘要檔的內容（#31）----

test('摘要檔只有計數與結論：沒有給操作者的指示（那些只印在終端機）', async () => {
  const t = await setup();
  try {
    const outcome = await t.run();
    const file = readFileSync(outcome.summaryPath, 'utf8');
    assert.doesNotMatch(file, /請把|回報|docs\/legacy-acceptance/);
    const out: string[] = [];
    await main(['a', 'b', 'c'], async () => outcome, { out: (l) => out.push(l), err: () => {} });
    assert.match(out.join('\n'), /請把上面的摘要內容回報/);
  } finally { t.cleanup(); }
});

test('預設預期值（17）用在真實基準；虛構資料另外指定', () => {
  assert.deepEqual(COMPARE_EXPECTATIONS_20261108, { legacyDifferenceMonths: 17 });
  assert.ok(projectionsFor(comparableState()).property.length === 4);
});
