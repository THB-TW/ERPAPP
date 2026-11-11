// 信用卡比對的端到端驗證：假匯出轉換後，經帳本服務讀取，不直接改資料表。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparableExport, fictionalBaseline, writeFictionalExport } from '../legacy-convert/testExport.ts';
import { setup } from './testSupport.ts';
import { ConversionStopped } from '../legacy-convert/source.ts';

test('信用卡明細同筆數同加總時通過，完整報告列金額而摘要只列計數', async () => {
  const t = await setup();
  try {
    const result = await t.run();
    assert.equal(result.passed, true);
    assert.match(result.summary.join('\n'), /信用卡明細：來源 1 筆、App 1 筆；筆數與金額加總相同/);
    assert.match(readFileSync(result.reportPath, 'utf8'), /信用卡明細金額加總.*999/);
    assert.ok(!result.summary.join('\n').includes('999'));
  } finally { t.cleanup(); }
});

test('來源多一筆信用卡明細時拒絕驗收，明列兩邊筆數與金額加總差異', async () => {
  const t = await setup();
  try {
    const other = comparableExport();
    other.cardStatements = [
      { Date: '2026-09-03', Item: '虛構店家', Amount: 999 },
      { Date: '2026-09-03', Item: '虛構店家', Amount: 999 },
    ];
    const exportDirectory = writeFictionalExport(t.priv, other);
    const result = await t.run({ exportDirectory, expectedBaseline: fictionalBaseline(other) });
    assert.equal(result.passed, false);
    const report = readFileSync(result.reportPath, 'utf8');
    assert.match(report, /信用卡明細總筆數 \| 2 \| 1/);
    assert.match(report, /信用卡明細金額加總 \| 1,998 \| 999/);
    assert.match(result.summary.join('\n'), /信用卡明細.*有.*差異/);
  } finally { t.cleanup(); }
});

test('來源信用卡明細合計超過安全整數時明確停止，不能拿捨入值比對', async () => {
  const t = await setup();
  try {
    const other = comparableExport();
    other.cardStatements = [
      { Date: '2026-09-03', Item: '虛構店家', Amount: 4_503_599_627_370_496 },
      { Date: '2026-09-04', Item: '虛構店家', Amount: 4_503_599_627_370_496 },
    ];
    const exportDirectory = writeFictionalExport(t.priv, other);
    await assert.rejects(t.run({ exportDirectory, expectedBaseline: fictionalBaseline(other) }),
      (error: unknown) => error instanceof ConversionStopped && /安全整數/.test(error.message));
  } finally { t.cleanup(); }
});
