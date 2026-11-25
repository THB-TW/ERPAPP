// 轉換計畫（純函式）的測試：分類收支別、不合規定的列、名稱衝突。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LegacyData, RawTransaction } from './legacyData.ts';
import { buildPlan } from './plan.ts';

let n = 0;
function tx(p: Partial<RawTransaction> = {}): RawTransaction {
  n += 1;
  return { row: n, id: n, date: '2026-08-05T00:00:00', category: '甲', amount: 100, member: '小明', account: '錢包', type: '支', ...p };
}
function data(transactions: RawTransaction[], over: Partial<LegacyData> = {}): LegacyData {
  return {
    transactions,
    categories: [{ id: 1, name: '甲', type: '支' }, { id: 2, name: '乙', type: '收' }],
    accounts: [{ id: 1, name: '錢包' }],
    members: [{ id: 1, name: '小明' }],
    document: '{}', cutoffMonth: '2026-09', months: 0, checks: [],
    ...over,
  };
}

test('交易原樣轉成計畫：保留合法重複列與順序，日期取日期部分，備註為空', () => {
  const a = tx({ id: 5 });
  const b = tx({ id: 5, row: a.row + 1 }); // 完全相同的合法重複列
  const c = tx({ id: 2, date: '2026-08-04', type: '收', category: '乙', amount: 9 });
  const result = buildPlan(data([a, b, c]), { mixedFlow: 'stop' });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.plan!.transactions.map((t) => [t.date, t.category, t.flow, t.amount]), [
    ['2026-08-04', '乙', 'income', 9], ['2026-08-05', '甲', 'expense', 100], ['2026-08-05', '甲', 'expense', 100],
  ]);
});

test('交易用到但分類表沒有的名稱也會建立分類；收支別以交易實際用法為準；表上沒用到的分類保留', () => {
  const result = buildPlan(
    data([tx({ category: '表外支出' }), tx({ category: '表外收入', type: '收' })], {
      categories: [{ id: 1, name: '甲', type: '支' }, { id: 2, name: '乙', type: '收' }],
    }),
    { mixedFlow: 'stop' },
  );
  assert.deepEqual(result.plan!.categories, [
    { name: '甲', flow: 'expense' }, { name: '乙', flow: 'income' }, { name: '表外支出', flow: 'expense' }, { name: '表外收入', flow: 'income' },
  ]);
  assert.deepEqual(result.plan!.accounts, ['錢包']);
});

test('分類表的收支別與交易實際用法不同時，以交易為準並列為注意事項（不阻擋）', () => {
  const result = buildPlan(data([tx({ category: '乙', type: '支' })]), { mixedFlow: 'stop' });
  assert.equal(result.plan!.categories.find((c) => c.name === '乙')!.flow, 'expense');
  assert.ok(result.notices.some((m) => m.includes('乙') && m.includes('分類表')));
});

test('同一分類名稱同時用在收入與支出：預設停下並列出名稱與兩邊筆數', () => {
  const result = buildPlan(data([tx(), tx(), tx(), tx({ type: '收' })]), { mixedFlow: 'stop' });
  assert.equal(result.plan, undefined);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /甲/);
  assert.match(result.problems[0], /收入 1 筆/);
  assert.match(result.problems[0], /支出 3 筆/);
});

test('--mixed-flow split：只拆收入那一邊成「原名（收入）」，支出名稱永遠保留，金額與正負不變', () => {
  const incomeMinority = buildPlan(data([tx(), tx(), tx({ type: '收', amount: 7 })]), { mixedFlow: 'split' });
  assert.deepEqual(incomeMinority.plan!.transactions.map((t) => [t.category, t.flow, t.amount]), [
    ['甲', 'expense', 100], ['甲', 'expense', 100], ['甲（收入）', 'income', 7],
  ]);
  assert.deepEqual(incomeMinority.plan!.categories.filter((c) => c.name.startsWith('甲')), [
    { name: '甲', flow: 'expense' }, { name: '甲（收入）', flow: 'income' },
  ]);
  assert.ok(incomeMinority.notices.some((m) => m.includes('甲（收入）')));

  // 收入是多數時也一樣拆收入；不會出現「X（支出）」
  const incomeMajority = buildPlan(data([tx({ category: '乙', type: '收' }), tx({ category: '乙', type: '收' }), tx({ category: '乙', type: '支' })]),
    { mixedFlow: 'split' });
  assert.deepEqual(incomeMajority.plan!.transactions.map((t) => [t.category, t.flow]), [['乙（收入）', 'income'], ['乙（收入）', 'income'], ['乙', 'expense']]);
  assert.deepEqual(incomeMajority.plan!.categories.filter((c) => c.name.startsWith('乙')), [
    { name: '乙', flow: 'expense' }, { name: '乙（收入）', flow: 'income' },
  ]);
  assert.ok(!incomeMajority.plan!.categories.some((c) => c.name.includes('（支出）')));

  // 筆數相同：拆出收入那一邊，讓支出名稱維持原樣（預算歸屬用支出名稱）
  const tie = buildPlan(data([tx(), tx({ type: '收' })]), { mixedFlow: 'split' });
  assert.deepEqual(tie.plan!.transactions.map((t) => t.category), ['甲', '甲（收入）']);
});

test('拆分後的名稱若已被使用就停下', () => {
  const result = buildPlan(data([tx(), tx({ type: '收' }), tx({ category: '甲（收入）' })]), { mixedFlow: 'split' });
  assert.equal(result.plan, undefined);
  assert.match(result.problems.join('\n'), /甲（收入）/);
});

test('不合 App 限制的列：停下並依原因列出筆數與編號，不丟棄不修改', () => {
  const result = buildPlan(
    data([
      tx({ id: 11, amount: 0 }), tx({ id: 12, amount: -5 }), tx({ id: 13, amount: 1.5 }),
      tx({ id: 14, account: null }), tx({ id: 15, account: '  ' }), tx({ id: 16, category: '' }),
      tx({ id: 17, date: null }), tx({ id: 18, date: '2026-02-30T00:00:00' }), tx({ id: 19, date: '2026-08-05T13:00:00' }),
      tx({ id: 20, type: '轉' }), tx({ id: 21, type: null }), tx(),
    ]),
    { mixedFlow: 'stop' },
  );
  assert.equal(result.plan, undefined);
  const text = result.problems.join('\n');
  assert.match(text, /金額不是大於 0 的整數：3 筆/);
  assert.match(text, /11/);
  assert.match(text, /帳戶為空：2 筆/);
  assert.match(text, /分類為空：1 筆/);
  assert.match(text, /日期缺漏或格式不認得：3 筆/);
  assert.match(text, /收支別不是「收」或「支」：2 筆/);
});

test('成員空白視為沒有成員；交易裡有但成員表沒有的成員也會建立', () => {
  const result = buildPlan(data([tx({ member: null }), tx({ member: '' }), tx({ member: '小華' })]), { mixedFlow: 'stop' });
  assert.deepEqual(result.plan!.transactions.map((t) => t.member), [null, null, '小華']);
  assert.deepEqual(result.plan!.members, ['小明', '小華']);
  assert.ok(result.notices.some((m) => m.includes('沒有成員') && m.includes('2')));
});

test('名稱只差大小寫或前後空白時停下，不自行合併', () => {
  const result = buildPlan(data([tx({ category: 'Food' }), tx({ category: 'food ' })]), { mixedFlow: 'stop' });
  assert.equal(result.plan, undefined);
  assert.match(result.problems.join('\n'), /Food/);
});

test('分類表上沒用到、收支別又不認得的分類停下', () => {
  const result = buildPlan(data([tx()], { categories: [{ id: 1, name: '甲', type: '支' }, { id: 2, name: '怪', type: '?' }] }), { mixedFlow: 'stop' });
  assert.equal(result.plan, undefined);
  assert.match(result.problems.join('\n'), /怪/);
});

test('名稱表有完全同名的兩列：不悄悄合併，列出名稱與列數（不阻擋）', () => {
  const result = buildPlan(
    data([tx()], {
      categories: [{ id: 1, name: '甲', type: '支' }, { id: 2, name: '甲', type: '支' }],
      accounts: [{ id: 1, name: '錢包' }, { id: 2, name: '錢包' }, { id: 3, name: '錢包' }],
      members: [{ id: 1, name: '小明' }, { id: 2, name: '小明' }],
    }),
    { mixedFlow: 'stop' },
  );
  assert.deepEqual(result.plan!.categories.map((c) => c.name), ['甲']);
  const text = result.notices.join('\n');
  assert.match(text, /分類表有 2 列都叫「甲」/);
  assert.match(text, /帳戶表有 3 列都叫「錢包」/);
  assert.match(text, /成員表有 2 列都叫「小明」/);
});
