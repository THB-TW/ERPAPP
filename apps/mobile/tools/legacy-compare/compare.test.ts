// 比對各部分的單元測試（純函式）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { position } from '../../src/calc/budgetEngine.ts';
import type { DayTransaction } from '../../src/ledger/index.ts';
import type { RawTransaction } from '../legacy-convert/legacyData.ts';
import { comparableState } from '../legacy-convert/testExport.ts';
import { serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { compareTransactions } from './compare.ts';
import { expectedPositions } from './expected.ts';
import { recomputeMonths } from './recompute.ts';
import { readRawDocument } from './sources.ts';

const raw = () => readRawDocument(serializeBudgetDocument(comparableState()));

test('獨立算法（讀原始 JSON）與 App 引擎的 position 逐月、逐分類相同', () => {
  const state = comparableState();
  const expected = expectedPositions(raw());
  assert.equal(expected.size, 4);
  for (const m of state.months) {
    const p = position(state, m.month);
    const e = expected.get(m.month)!;
    assert.deepEqual([e.income, e.spare, e.tuition, e.reserve, e.total, e.legacyTotalDifference], [p.income, p.spare, p.tuition, p.reserve, p.total, p.legacyTotalDifference]);
    assert.deepEqual(Object.fromEntries([...e.balances].sort()), Object.fromEntries(Object.entries(p.balances).sort()));
  }
  // 手算：2026-10 可用餘額＝17,300－50（更正）－300（補入）
  assert.equal(expected.get('2026-10')!.spare, 16950);
});

test('不認得的調整種類：停下，不猜', () => {
  const state = comparableState();
  state.adjustments[0].kind = 'mystery';
  assert.throws(() => expectedPositions(readRawDocument(serializeBudgetDocument(state))), /mystery/);
});

test('原始文件格式不對：停下', () => {
  assert.throws(() => readRawDocument('{'), /JSON/);
  assert.throws(() => readRawDocument(JSON.stringify({ Months: [{ Month: '2026-01', Income: 'x' }] })), /Income/);
});

const tx = (date: string, flow: 'income' | 'expense', category: string, amount: number): DayTransaction =>
  ({ id: 1, date, flow, amount, note: '', categoryId: 1, categoryName: category, accountId: 1, accountName: '現金', memberName: null });
const rawTx = (date: string, type: '收' | '支', category: string, amount: number): RawTransaction =>
  ({ row: 1, id: 1, date: date + 'T00:00:00', category, amount, member: null, account: '現金', type });

test('交易比對：「原名（收入）」拆分分類併回原名；來源本來就有同名分類時不併', () => {
  const source = [rawTx('2026-01-02', '收', '退款', 30), rawTx('2026-01-03', '支', '退款', 10)];
  const split = [tx('2026-01-02', 'income', '退款（收入）', 30), tx('2026-01-03', 'expense', '退款', 10)];
  assert.deepEqual(compareTransactions(split, source).differences, []);
  // 來源真的有叫「退款（收入）」的分類：不當成拆分，兩邊要直接相同
  const literal = [rawTx('2026-01-02', '收', '退款（收入）', 30)];
  assert.deepEqual(compareTransactions([tx('2026-01-02', 'income', '退款（收入）', 30)], literal).differences, []);
  assert.ok(compareTransactions([tx('2026-01-02', 'income', '退款', 30)], literal).differences.length > 0);
});

test('交易比對：金額互換（筆數、總額都相同）也會被分月與逐筆抓到', () => {
  const source = [rawTx('2026-01-02', '支', 'A', 10), rawTx('2026-02-02', '支', 'A', 20)];
  const app = [tx('2026-01-02', 'expense', 'A', 20), tx('2026-02-02', 'expense', 'A', 10)];
  const result = compareTransactions(app, source);
  assert.ok(result.differences.length > 0);
  assert.ok(!result.differences.some((d) => d.field === '交易總筆數' || d.field.startsWith('交易總金額')));
  assert.ok(result.differences.some((d) => d.field.startsWith('分月 2026-01')));
});

test('重算：無前月、無上限快照、有支出分類沒歸屬、引擎拒絕，各自標無法重算與原因', () => {
  const state = comparableState();
  const base = (month: string) => ({ income: 9000, expenses: [{ category: '飲食', amount: 100 }] });
  const byMonth = (rs: ReturnType<typeof recomputeMonths>) => Object.fromEntries(rs.map((r) => [r.month, r]));

  const r1 = byMonth(recomputeMonths(state, base));
  assert.equal(r1['2026-07'].code, 'no_prior_month');
  assert.equal(r1['2026-08'].status, 'differs');

  const noCap = comparableState();
  noCap.months.find((m) => m.month === '2026-09')!.revision = null;
  assert.equal(byMonth(recomputeMonths(noCap, base))['2026-09'].code, 'no_cap_snapshot');

  const unmapped = byMonth(recomputeMonths(state, (m) => ({ income: 0, expenses: m === '2026-10' ? [{ category: '沒歸屬', amount: 5 }] : [] })));
  assert.equal(unmapped['2026-10'].code, 'unmapped_expense');
  assert.match(unmapped['2026-10'].detail!, /沒歸屬/);

  const refused = comparableState();
  refused.months.find((m) => m.month === '2026-10')!.revision!.limits.push({ categoryId: 'ghost', amount: 1 });
  const r4 = byMonth(recomputeMonths(refused, base))['2026-10'];
  assert.equal(r4.code, 'engine_refused');
  assert.equal(r4.status, 'not_recomputable');
});

test('重算：前一個月有歷史差異時照樣重算（期初差異當 0），且不改動傳入的狀態', () => {
  const state = comparableState();
  const before = serializeBudgetDocument(state);
  const rs = recomputeMonths(state, (m) => (m === '2026-10' ? { income: 10000, expenses: [{ category: '飲食', amount: 5100 }, { category: '其他', amount: 700 }, { category: '電話網路', amount: 280 }] } : { income: 0, expenses: [] }));
  const oct = rs.find((r) => r.month === '2026-10')!;
  assert.equal(oct.status, 'match'); // 2026-09 有差異 12，仍可重算
  assert.equal(serializeBudgetDocument(state), before);
});
