// 比對各部分的單元測試（純函式）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { position } from '../../src/calc/budgetEngine.ts';
import type { DayTransaction } from '../../src/ledger/index.ts';
import type { RawTransaction } from '../legacy-convert/legacyData.ts';
import { comparableState } from '../legacy-convert/testExport.ts';
import { serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { openLedger, type BudgetMonthView } from '../../src/ledger/index.ts';
import { projectionsFor } from '../legacy-convert/testExport.ts';
import { compareBudgetMonths, compareTransactions } from './compare.ts';
import { expectedPositions } from './expected.ts';
import { bucketExpensesByMonth, recomputeMonths } from './recompute.ts';
import { readRawDocument, type IndependentSources } from './sources.ts';

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

test('所屬月份不在已結月份內（例如已撤銷）的調整：不算進任何月份，與 App 的 position 相同', () => {
  const state = comparableState();
  // 2026-06 沒有月結（不晚於任何已結月份，只有「所屬月份未結」這條規則會把它排除）
  state.adjustments.push({ id: 'adj-x', month: '2026-06', kind: 'correct', amount: 999, from: null, to: null, reason: '虛構', actor: 'app', time: '2026-11-02T00:00:00+08:00', reverses: null, changes: [] });
  const expected = expectedPositions(readRawDocument(serializeBudgetDocument(state)));
  const plain = expectedPositions(readRawDocument(serializeBudgetDocument(comparableState())));
  for (const m of state.months) {
    assert.equal(expected.get(m.month)!.spare, plain.get(m.month)!.spare, m.month);
    assert.equal(expected.get(m.month)!.spare, position(state, m.month).spare, m.month);
  }
});

test('支出依月份分桶：只算支出，收入不算，依交易日期的月份', () => {
  const buckets = bucketExpensesByMonth([
    tx('2026-01-02', 'expense', 'A', 10), tx('2026-01-30', 'expense', 'B', 20), tx('2026-01-31', 'income', 'S', 999), tx('2026-02-01', 'expense', 'A', 5),
  ]);
  assert.deepEqual([...buckets.keys()].sort(), ['2026-01', '2026-02']);
  assert.deepEqual(buckets.get('2026-01'), [{ category: 'A', amount: 10 }, { category: 'B', amount: 20 }]);
  assert.deepEqual(buckets.get('2026-02'), [{ category: 'A', amount: 5 }]);
});

test('交易比對：只有「來源把 X 當支出分類用、App 這邊是收入」才把「X（收入）」併回 X，並記下併回的名稱', () => {
  const source = [rawTx('2026-01-02', '收', '退款', 30), rawTx('2026-01-03', '支', '退款', 10)];
  const merged = compareTransactions([tx('2026-01-02', 'income', '退款（收入）', 30), tx('2026-01-03', 'expense', '退款', 10)], source);
  assert.deepEqual(merged.differences, []);
  assert.deepEqual(merged.mergedNames, ['退款（收入）']);
  // 來源根本沒有用 X 當支出分類（只有收入）：不併，名稱不同就是差異
  const onlyIncome = compareTransactions([tx('2026-01-02', 'income', '兼職（收入）', 30)], [rawTx('2026-01-02', '收', '兼職', 30)]);
  assert.ok(onlyIncome.differences.length > 0);
  assert.deepEqual(onlyIncome.mergedNames, []);
  // App 這邊是「支出」類別叫「X（收入）」：絕不併回（來源 X 是支出，兩邊其實不同）
  const expenseSide = compareTransactions([tx('2026-01-02', 'expense', '退款（收入）', 30)], [rawTx('2026-01-02', '支', '退款', 30)]);
  assert.ok(expenseSide.differences.length > 0);
  assert.deepEqual(expenseSide.mergedNames, []);
  // 來源的「支出」分類本來就叫「X（收入）」：兩邊相同，不動
  const literal = compareTransactions([tx('2026-01-02', 'expense', '退款（收入）', 30), tx('2026-01-03', 'expense', '退款', 1)], [rawTx('2026-01-02', '支', '退款（收入）', 30), rawTx('2026-01-03', '支', '退款', 1)]);
  assert.deepEqual(literal.differences, []);
});

// ---- 月份層級的逐欄隔離（純函式；View 取自帳本服務，舊表由投影列組成）----

async function fixture() {
  const state = comparableState();
  const db = openNodeDatabase(':memory:');
  const ledger = await openLedger(db);
  await ledger.importFinanceDocument(serializeBudgetDocument(state));
  const listed = await ledger.listBudgetMonths();
  const views = new Map<string, BudgetMonthView>();
  for (const m of listed) views.set(m.month, await ledger.getBudgetMonth(m.month));
  const p = projectionsFor(state);
  const sources: IndependentSources = {
    property: new Map(p.property.map((r) => [String(r.date).slice(0, 7), { income: Number(r.own), spare: Number(r.sparemoney), tuition: Number(r.tuitionfee), reserve: Number(r.budget), total: Number(r.totalproperty) }])),
    budgetSurplus: new Map(p.budget.filter((r) => !String(r.date).startsWith('1911')).map((r) => [String(r.date).slice(0, 7), Number(r.gete)])),
    cumulative: new Map(Object.entries(p.budget.find((r) => String(r.date).startsWith('1911'))!).filter(([k]) => ['food', 'car', 'fun', 'study', 'cloth', 'articles', 'furniture', 'hair', 'health', 'other'].includes(k)).map(([k, v]) => [k, Number(v)])),
    cumulativeTotal: null,
    caps: new Map(p.budgetCap.map((r) => [String(r.month).slice(0, 7), { tuition: Number(r.tuition), limits: new Map(['food', 'car', 'fun', 'study', 'cloth', 'articles', 'furniture', 'hair', 'health', 'other', 'phone', 'gogoro'].map((id) => [id, Number(r[id])])) }])),
  };
  const raw = readRawDocument(serializeBudgetDocument(state));
  const compare = () => compareBudgetMonths(views, listed.map((m) => m.month), sources, raw, { expectedLegacyDifferenceMonths: 2, exportedDocument: serializeBudgetDocument(state), sourceDocument: serializeBudgetDocument(state) });
  return { views, sources, compare };
}

test('逐月比對（純函式）：沒動過沒有差異；帳面總資產只有來源財務文件的算式不同時，也只有它抓到', async () => {
  const f = await fixture();
  assert.deepEqual(f.compare().differences, []);
  // 帳面總資產單獨被改（分項都沒動）：Property 與文件兩道都抓到
  f.views.get('2026-09')!.total += 1;
  assert.deepEqual(f.compare().differences.filter((d) => d.kind === '帳面總資產').map((d) => d.source).sort(), ['Property 資料表', '來源財務文件']);
  // Property 那一列也跟著改成一樣：只剩來源財務文件那一道
  f.sources.property.get('2026-09')!.total += 1;
  const only = f.compare().differences.filter((d) => d.kind === '帳面總資產');
  assert.deepEqual(only.map((d) => d.source), ['來源財務文件']);
});
