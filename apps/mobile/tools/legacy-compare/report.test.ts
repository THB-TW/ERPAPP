// 報告與摘要文字的測試（純函式）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BudgetComparison, Difference, TransactionComparison } from './compare.ts';
import { buildReport, buildSummary, type ReportContext } from './report.ts';

const budget = (differences: Difference[] = []): BudgetComparison => ({
  differences, checks: { 'Property 資料表': 1, 'budget 資料表': 1, 'BudgetCap 資料表': 1, '來源財務文件': 1, '來源交易表': 0, '來源信用卡表': 0 }, months: ['2026-01'], legacyDifferenceMonths: [],
  coverage: {
    propertyMonths: 1, budgetRowMonths: 1, capRowMonths: 1, withoutBudgetRow: [], withoutCapRow: [], withoutPropertyRow: [], orphanBudgetRows: [], orphanCapRows: [], staleCapRows: [],
    cumulativeRowChecked: false, cumulative: { month: null, total: null, categorySum: null, propertyReserve: null }, documentRevisions: 0,
  },
  monthListDiffers: false, legacyDifferenceMonthCount: { actual: 0, expected: 0 },
});
const transactions = (differences: Difference[] = []): TransactionComparison => ({ differences, sourceCount: 1, appCount: 1, totals: [], months: 1, mergedNames: [] });
const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({
  date: '2026-11-12', tool: { commit: 'abc', dirty: false }, manifestSha256: 'f'.repeat(64), sourceDatabase: 'db', sourceCommit: 'c', ledgerSha256: 'e'.repeat(64),
  budget: budget(), transactions: transactions(), cardStatements: { differences: [], sourceCount: 1, appCount: 1, sourceSum: 999, appSum: 999 }, recompute: { months: [] }, ...over,
});
const diff = (i: number): Difference => ({ scope: '2026-01', kind: '當月收入', field: `欄位${i}`, source: '來源財務文件', expected: i, actual: i + 1 });

test('結論包含信用卡明細，並註明尚未涵蓋投資（摘要與完整報告都有）', () => {
  const summary = buildSummary(ctx()).join('\n');
  const report = buildReport(ctx());
  for (const text of [summary, report]) {
    assert.match(text, /已比對範圍（逐月數字、交易、信用卡明細）全部通過，0 差異/);
    assert.match(text, /尚未涵蓋：投資（票 20）/);
  }
  assert.doesNotMatch(buildSummary(ctx({ budget: budget([diff(1)]) })).join('\n'), /全部通過/);
});

test('完整報告列出全部差異，不設 500 筆上限', () => {
  const many = Array.from({ length: 650 }, (_, i) => diff(i));
  const report = buildReport(ctx({ budget: budget(many) }));
  assert.ok(report.includes('| 2026-01 | 欄位649 |'));
  assert.doesNotMatch(report, /未列出/);
});

test('重算限制說明：開頭先說差異不代表 App 算錯，並列出沿用前期上限、期初基準差額、手動輸入的早期收入、手動調整', () => {
  const report = buildReport(ctx());
  const section = report.slice(report.indexOf('## 三、重算報告'));
  assert.ok(section.indexOf('重算有差異不代表 App 算錯') < section.indexOf('限制：'));
  for (const phrase of ['沿用前期上限版本', '期初基準差額', '使用者手動輸入', '手動調整']) assert.ok(section.includes(phrase), phrase);
  assert.match(section, /各月 Changes|當月儲備變動/);
});

test('摘要的有差異位置只有範圍與欄位類別，交易差異帶月份', () => {
  const tx: Difference = { scope: '交易', month: '2026-08', kind: '交易（分月）', field: '分月 2026-08 支出 筆數', source: '來源交易表', expected: 5, actual: 6 };
  const summary = buildSummary(ctx({ transactions: transactions([tx]) })).join('\n');
  assert.match(summary, /交易 2026-08：交易（分月）（1 項）/);
  assert.ok(!summary.includes('分月 2026-08 支出'));
});
