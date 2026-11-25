// 引擎規則補充測試：C# 測試入口沒覆蓋、但 BudgetEngine.cs 有的驗證與拒絕條件，訊息照 C#。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BudgetRuleError, applyBudgetCommand, commandFingerprint, latestMonth, openMonth, position } from './budgetEngine.ts';
import { emptyBudgetState } from './budgetDocument.ts';
import type { BudgetCommand, BudgetExpense, BudgetState } from './budgetTypes.ts';

const TIME = '2026-11-07T12:00:00+08:00';
const rev = (month: string, limits: [string, number][], mapping: Record<string, string>, tuition = 0) => ({
  id: 'r-' + month, month, limits: limits.map(([categoryId, amount]) => ({ categoryId, amount })), mapping, tuition, reason: '', actor: '', time: '',
});
const closed = (month: string, p: Partial<BudgetState['months'][number]> = {}) => ({
  id: month, month, income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
  migrated: false, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '', ...p,
});
function base(): BudgetState {
  return {
    ...emptyBudgetState(),
    categories: [
      { id: 'r1', name: '旅遊', kind: 'reserve' },
      { id: 'r2', name: '保險', kind: 'reserve' },
      { id: 'f1', name: '房租', kind: 'fixed' },
      { id: 'a1', name: '餐費', kind: 'actual' },
    ],
    revisions: [rev('2026-10', [['r1', 1000], ['r2', 500], ['f1', 0], ['a1', 0]], { 旅遊: 'r1', 保險: 'r2', 房租: 'f1', 餐飲: 'a1' }, 200)],
    months: [closed('2026-09', { rawSpare: 10000, balances: { r1: 100, r2: 50 } })],
  };
}
const cmd = (p: Partial<BudgetCommand> & { action: string; month: string }): BudgetCommand =>
  ({ operationId: randomUUID(), version: 0, reason: '虛構原因', ...p });
const run = (s: BudgetState, c: BudgetCommand, expenses?: BudgetExpense[]) => applyBudgetCommand(s, c, { actor: 'app', time: TIME, expenses });
function refuse(kind: 'argument' | 'operation' | 'overflow', message: string | RegExp, fn: () => unknown) {
  assert.throws(fn, (e: unknown) => {
    assert.ok(e instanceof BudgetRuleError, String(e));
    assert.equal(e.kind, kind);
    if (typeof message === 'string') assert.equal(e.message, message); else assert.match(e.message, message);
    return true;
  });
}

test('操作識別碼：缺少、全零、格式不對都拒絕', () => {
  const s = base();
  refuse('argument', '缺少操作識別碼，請重新載入頁面。', () => run(s, cmd({ action: 'correct', month: '2026-10', operationId: '' })));
  refuse('argument', '缺少操作識別碼，請重新載入頁面。', () => run(s, cmd({ action: 'correct', month: '2026-10', operationId: '00000000-0000-0000-0000-000000000000' })));
  refuse('argument', '操作識別碼格式不正確。', () => run(s, cmd({ action: 'correct', month: '2026-10', operationId: 'abc' })));
});

test('重送：同識別碼同內容回傳同一份狀態；內容不同被拒；識別碼大小寫視為相同', () => {
  const s = base();
  const c = cmd({ action: 'correct', month: '2026-10', amount: -5 });
  const once = run(s, c);
  assert.equal(run(once, c), once);
  assert.equal(run(once, { ...c, operationId: c.operationId.toUpperCase() }), once);
  refuse('operation', '操作識別碼已用於其他內容，請重新載入。', () => run(once, { ...c, amount: -6 }));
});

test('版本過期被拒；原因必填 1～300 字（前後空白不算）', () => {
  const s = base();
  refuse('operation', '資料已被其他操作更新，請重新載入後再試。', () => run(s, cmd({ action: 'correct', month: '2026-10', amount: 1, version: 3 })));
  refuse('argument', '請填寫 1～300 字的原因。', () => run(s, cmd({ action: 'correct', month: '2026-10', amount: 1, reason: '   ' })));
  refuse('argument', '請填寫 1～300 字的原因。', () => run(s, cmd({ action: 'correct', month: '2026-10', amount: 1, reason: '字'.repeat(301) })));
  run(s, cmd({ action: 'correct', month: '2026-10', amount: 1, reason: ' ' + '字'.repeat(300) + ' ' }));
});

test('月份格式與範圍', () => {
  const s = base();
  refuse('argument', '月份格式不正確，請用 YYYY-MM。', () => run(s, cmd({ action: 'correct', month: '2026-13', amount: 1 })));
  refuse('argument', '月份格式不正確，請用 YYYY-MM。', () => run(s, cmd({ action: 'correct', month: '2026/10', amount: 1 })));
  refuse('argument', '月份超出範圍。', () => run(s, cmd({ action: 'correct', month: '1899-12', amount: 1 })));
  refuse('argument', '不支援的操作。', () => run(s, cmd({ action: 'nope', month: '2026-10' })));
});

test('caps：欄位須與使用中類別相符、範圍 0～1,000,000、照實支不設上限、只能改開放月份', () => {
  const s = base();
  const full = (over: Record<string, number> = {}) => ['r1', 'r2', 'f1', 'a1'].map((id) => ({ categoryId: id, amount: over[id] ?? 0 }));
  refuse('operation', '只能設定開放月份的類別與上限。', () => run(s, cmd({ action: 'caps', month: '2026-12', limits: full() })));
  refuse('argument', '上限欄位與目前使用中的類別不符，請重新載入。', () => run(s, cmd({ action: 'caps', month: '2026-10', limits: full().slice(1) })));
  refuse('argument', '每項上限須為 0～1,000,000 的整數。', () => run(s, cmd({ action: 'caps', month: '2026-10', limits: full({ r1: 1_000_001 }) })));
  refuse('argument', '每項上限須為 0～1,000,000 的整數。', () => run(s, cmd({ action: 'caps', month: '2026-10', limits: full(), tuition: -1 })));
  refuse('argument', '照實支類別不設定上限。', () => run(s, cmd({ action: 'caps', month: '2026-10', limits: full({ a1: 5 }) })));
  const ok = run(s, cmd({ action: 'caps', month: '2026-10', limits: full({ r1: 1_000_000 }), tuition: 300 }));
  assert.equal(ok.revisions.length, 2);
  assert.equal(ok.revisions[1].tuition, 300);
});

test('add：名稱 1～30 字且不重複（不分大小寫，含已停用）、用途須正確、照實支上限寫 0', () => {
  const s = base();
  const add = (p: Partial<BudgetCommand>) => cmd({ action: 'add', month: '2026-10', name: '新類別', kind: 'reserve', amount: 100, ...p });
  const msg = '請填寫不重複的類別名稱（1～30 字，含已停用名稱）。';
  refuse('argument', msg, () => run(s, add({ name: '  ' })));
  refuse('argument', msg, () => run(s, add({ name: '字'.repeat(31) })));
  refuse('argument', msg, () => run(s, add({ name: '旅遊' })));
  refuse('argument', '類別用途不正確。', () => run(s, add({ kind: 'weird' })));
  refuse('argument', '每項上限須為 0～1,000,000 的整數。', () => run(s, add({ amount: -1 })));
  const withActual = run(s, add({ name: 'Eat', kind: 'actual', amount: 999 }));
  assert.equal(withActual.revisions[1].limits.at(-1)!.amount, 0);
  refuse('argument', msg, () => run(withActual, add({ name: 'EAT', version: withActual.version })));
});

test('map：來源分類 1～50 字、目標須是使用中的預算類別；歸屬可指向固定與照實支', () => {
  const s = base();
  const map = (p: Partial<BudgetCommand>) => cmd({ action: 'map', month: '2026-10', sourceCategory: '咖啡', to: 'a1', ...p });
  const msg = '請選擇有效的交易分類與使用中的預算類別。';
  refuse('argument', msg, () => run(s, map({ sourceCategory: '' })));
  refuse('argument', msg, () => run(s, map({ sourceCategory: 'x'.repeat(51) })));
  refuse('argument', msg, () => run(s, map({ to: 'zzz' })));
  refuse('operation', '只能設定開放月份的類別與上限。', () => run(s, map({ month: '2026-11' })));
  assert.equal(run(s, map({})).revisions[1].mapping['咖啡'], 'a1');
});

test('retire：負儲備須先補足；無儲備可不指定轉入；停用後歸屬一併移除', () => {
  const neg = base();
  neg.months[0].balances = { r1: -5, r2: 50 };
  refuse('operation', '請先補足負儲備，再移除類別。', () => run(neg, cmd({ action: 'retire', month: '2026-10', from: 'r1', to: 'r2' })));
  const zero = base();
  zero.months[0].balances = { r1: 0, r2: 50 };
  const out = run(zero, cmd({ action: 'retire', month: '2026-10', from: 'r1' }));
  assert.equal(out.adjustments.length, 0);
  assert.equal(Object.hasOwn(out.revisions[1].mapping, '旅遊'), false);
  refuse('argument', '類別已停用或不存在。', () => run(zero, cmd({ action: 'retire', month: '2026-10', from: 'nope' })));
  // 有儲備卻沒指定轉入（C# 行為）：轉入類別不是使用中的儲備類別，被挪用規則拒絕
  refuse('operation', '只能在使用中的儲備類別之間挪用。', () => run(base(), cmd({ action: 'retire', month: '2026-10', from: 'r1' })));
  refuse('argument', '請選擇不同的儲備類別與正整數金額。', () => run(base(), cmd({ action: 'retire', month: '2026-10', from: 'r1', to: 'r1' })));
});

test('transfer：只限最近已結月份、不同類別與正整數、使用中儲備類之間、餘額足夠', () => {
  const s = base();
  const t = (p: Partial<BudgetCommand>) => cmd({ action: 'transfer', month: '2026-09', from: 'r1', to: 'r2', amount: 10, ...p });
  // 兩邊都沒選（一個 undefined、一個 null）在 C# 是 null == null，照舊算「相同類別」。
  refuse('argument', '請選擇不同的儲備類別與正整數金額。', () => run(s, t({ from: undefined, to: null })));
  const s2 = { ...s, months: [...s.months, closed('2026-10', { rawSpare: 10000, balances: { r1: 100, r2: 50 } })] };
  refuse('operation', '只能挪用最近已結月份的累計儲備。', () => run(s2, t({})));
  refuse('argument', '請選擇不同的儲備類別與正整數金額。', () => run(s, t({ to: 'r1' })));
  refuse('argument', '請選擇不同的儲備類別與正整數金額。', () => run(s, t({ amount: 0 })));
  refuse('operation', '只能在使用中的儲備類別之間挪用。', () => run(s, t({ to: 'f1' })));
  refuse('operation', '轉出類別的可用儲備不足。', () => run(s, t({ amount: 101 })));
  assert.equal(position(run(s, t({ amount: 100 })), '2026-09').balances.r1, 0);
});

test('fund 與其沖銷：餘額不足、類別不足、非儲備類別都拒絕', () => {
  const s = base();
  refuse('operation', '請選擇使用中的儲備類別。', () => run(s, cmd({ action: 'fund', month: '2026-09', to: 'f1', amount: 5 })));
  refuse('operation', '只能調整最近已結月份的目前餘額。', () => run(s, cmd({ action: 'fund', month: '2026-08', to: 'r1', amount: 5 })));
  refuse('operation', '可用餘額不足，無法補入預備金。', () => run(s, cmd({ action: 'fund', month: '2026-09', to: 'r1', amount: 10001 })));
  const funded = run(s, cmd({ action: 'fund', month: '2026-09', to: 'r1', amount: 10000 }));
  assert.equal(position(funded, '2026-09').spare, 0);
  assert.equal(position(funded, '2026-09').total, position(s, '2026-09').total);
  // 補入後儲備被挪走，沖銷時類別儲備不足
  const moved = run(funded, cmd({ action: 'transfer', month: '2026-09', from: 'r1', to: 'r2', amount: 10100, version: funded.version }));
  refuse('operation', '該類別儲備不足，無法沖銷補入金額。', () =>
    run(moved, cmd({ action: 'reverse', month: '2026-09', reverses: funded.adjustments[0].id, version: moved.version })));
});

test('reverse：找不到原調整、已沖銷、本身是沖銷、待重結都拒絕；前期更正的沖銷以相反金額附加', () => {
  const s = base();
  s.months.push(closed('2026-10', { rawSpare: 20000, balances: { r1: 100, r2: 50 } }));
  const corrected = run(s, cmd({ action: 'correct', month: '2026-10', amount: -50 }));
  const orig = corrected.adjustments[0];
  assert.equal(orig.month, '2026-09');
  refuse('operation', '請從最近已結月份沖銷調整。', () => run(corrected, cmd({ action: 'reverse', month: '2026-09', reverses: orig.id, version: 1 })));
  refuse('operation', '找不到原調整紀錄。', () => run(corrected, cmd({ action: 'reverse', month: '2026-10', reverses: 'x', version: 1 })));
  const reversed = run(corrected, cmd({ action: 'reverse', month: '2026-10', reverses: orig.id, version: 1 }));
  assert.equal(reversed.adjustments[1].amount, 50);
  assert.equal(reversed.adjustments[1].reverses, orig.id);
  assert.equal(position(reversed, '2026-10').spare, 20000);
  refuse('operation', '原調整已沖銷，或本身為沖銷紀錄。', () => run(reversed, cmd({ action: 'reverse', month: '2026-10', reverses: orig.id, version: 2 })));
  refuse('operation', '原調整已沖銷，或本身為沖銷紀錄。', () => run(reversed, cmd({ action: 'reverse', month: '2026-10', reverses: reversed.adjustments[1].id, version: 2 })));
  const pending = run(corrected, cmd({ action: 'rollback', month: '2026-10', version: 1 }));
  assert.equal(position(pending, '2026-09').spare, 10000 - 50);
});

test('correct：月份限制、前一月須已結、歷史差異、非零且 10 億內', () => {
  const s = base();
  refuse('operation', '請選擇已結月份或開放月份來更正前期。', () => run(s, cmd({ action: 'correct', month: '2026-12', amount: 1 })));
  refuse('operation', '前一個月尚無已結資料。', () => run(s, cmd({ action: 'correct', month: '2026-09', amount: 1 })));
  refuse('argument', '請填寫非零且範圍內的調整數。', () => run(s, cmd({ action: 'correct', month: '2026-10', amount: 1_000_000_001 })));
  const diff = base();
  diff.months[0].legacyTotalDifference = 3;
  refuse('operation', '影響範圍含有既有資產加總差異，請先核對；本次尚未更正。', () => run(diff, cmd({ action: 'correct', month: '2026-10', amount: 1 })));
});

test('rollback：只能撤銷最近月份並保留期初基準；搬遷月份缺上限須先核對', () => {
  const s = base();
  refuse('operation', '只能撤銷最近月份，且須保留期初基準。', () => run(s, cmd({ action: 'rollback', month: '2026-09' })));
  const two = { ...s, months: [...s.months, closed('2026-10', { migrated: true })] };
  refuse('operation', '這個歷史月份缺少上限或留有資產加總差異，請先核對；原始月結已保留，尚未撤銷。', () => run(two, cmd({ action: 'rollback', month: '2026-10' })));
});

test('close：月份順序、收入非負、缺上限、缺期初基準、前月差異、非正支出、未歸屬分類', () => {
  const s = base();
  const c = (p: Partial<BudgetCommand> = {}) => cmd({ action: 'close', month: '2026-10', amount: 30000, ...p });
  refuse('argument', '當月收入不能為負數。', () => run(s, c({ amount: -1 })));
  refuse('operation', '只能依月份順序進行月結。', () => run(s, c({ month: '2026-11' })));
  refuse('operation', '請先設定本月預算上限。', () => run({ ...s, revisions: [] }, c()));
  const noBase = { ...emptyBudgetState(), categories: s.categories, revisions: s.revisions };
  refuse('operation', '缺少期初基準。', () => run(noBase, c({ month: '2026-11' }), []));
  const diff = base();
  diff.months[0].legacyTotalDifference = 1;
  refuse('operation', '前月留有歷史資產加總差異，請先核對後再月結。', () => run(diff, c()));
  refuse('operation', '支出含有非正整數金額，請先核對交易。', () => run(s, c(), [{ category: '旅遊', amount: 0 }]));
  refuse('operation', '分類「咖啡」尚未設定有效的預算歸屬。', () => run(s, c(), [{ category: '咖啡', amount: 5 }]));
});

test('close 計算：儲備類計上限、固定與照實支計實支、學費計入；未提撥的實支留在盈餘', () => {
  const s = base();
  const out = run(s, cmd({ action: 'close', month: '2026-10', amount: 30000 }), [
    { category: '旅遊', amount: 1300 }, { category: '房租', amount: 8000 }, { category: '餐飲', amount: 2500 }, { category: '餐飲', amount: 500 },
  ]);
  const m = out.months.at(-1)!;
  // outlay = 學費 200 + 儲備上限 (1000+500) + 固定實支 8000 + 照實支 3000 = 12700
  assert.equal(m.surplus, 30000 - 12700);
  assert.equal(m.changes.r1, 1000 - 1300);
  assert.equal(m.changes.r2, 500);
  assert.deepEqual(m.expenses, { r1: 1300, f1: 8000, a1: 3000 });
  assert.equal(m.rawSpare, 10000 + 17300);
  assert.equal(m.tuition, 200);
  assert.equal(m.balances.r1, 100 - 300);
  assert.equal(out.closeHistory.length, 1);
  assert.equal(latestMonth(out), '2026-10');
  assert.equal(openMonth(out, '2000-01'), '2026-11');
  // 沿用上期設定時，月結把版本寫成該月自己的快照
  const carried = run(out, cmd({ action: 'close', month: '2026-11', amount: 0, version: out.version }), []);
  assert.equal(carried.months.at(-1)!.revision!.month, '2026-11');
  assert.equal(carried.revisions.at(-1)!.reason, '月結沿用上期設定');
});

test('分類名稱叫 __proto__ 或 constructor 也能歸屬與月結', () => {
  const s = base();
  const mapped = run(s, cmd({ action: 'map', month: '2026-10', sourceCategory: '__proto__', to: 'f1' }));
  const mapped2 = run(mapped, cmd({ action: 'map', month: '2026-10', sourceCategory: 'constructor', to: 'f1', version: 1 }));
  const out = run(mapped2, cmd({ action: 'close', month: '2026-10', amount: 100000, version: 2 }), [
    { category: '__proto__', amount: 7 }, { category: 'constructor', amount: 3 },
  ]);
  assert.equal(out.months.at(-1)!.expenses.f1, 10);
  refuse('operation', '分類「toString」尚未設定有效的預算歸屬。', () => run(s, cmd({ action: 'close', month: '2026-10', amount: 1 }), [{ category: 'toString', amount: 1 }]));
});

test('溢位被拒絕而不是失準；非整數金額被拒', () => {
  const s = base();
  s.months[0].rawSpare = Number.MAX_SAFE_INTEGER;
  refuse('overflow', /超出/, () => run(s, cmd({ action: 'correct', month: '2026-10', amount: 5 })));
  refuse('argument', '指令中的金額與版本必須是整數。', () => run(base(), cmd({ action: 'correct', month: '2026-10', amount: 1.5 })));
  refuse('argument', '指令中的金額與版本必須是整數。', () => run(base(), cmd({ action: 'correct', month: '2026-10', amount: Number.NaN })));
});

test('沒有任何月結時：開放月份取時間所在的台北月份；月結因缺期初基準或上限被拒', () => {
  const empty = emptyBudgetState();
  assert.equal(openMonth(empty, '2026-11'), '2026-11');
  refuse('operation', '請先設定本月預算上限。', () => applyBudgetCommand(empty, cmd({ action: 'close', month: '2026-12', amount: 1 }), { actor: 'app', time: '2026-11-30T20:00:00Z' }));
  // 2026-11-30T20:00Z 是台北 12/01 04:00，開放月份為 2026-12
  refuse('operation', '只能設定開放月份的類別與上限。', () => applyBudgetCommand(empty, cmd({ action: 'add', month: '2026-11', name: 'x' }), { actor: 'app', time: '2026-11-30T20:00:00Z' }));
  const added = applyBudgetCommand(empty, cmd({ action: 'add', month: '2026-12', name: 'x', amount: 1 }), { actor: 'app', time: '2026-11-30T20:00:00Z' });
  refuse('operation', '缺少期初基準。', () => applyBudgetCommand(added, cmd({ action: 'close', month: '2026-12', amount: 1, version: 1 }), { actor: 'app', time: '2026-11-30T20:00:00Z' }));
});

test('指紋：內容不同則不同，且與識別碼大小寫無關', () => {
  const c = cmd({ action: 'fund', month: '2026-10', to: 'r1', amount: 5 });
  assert.equal(commandFingerprint(c), commandFingerprint({ ...c, operationId: c.operationId.toUpperCase() }));
  assert.notEqual(commandFingerprint(c), commandFingerprint({ ...c, amount: 6 }));
});

test('引擎不改動傳入的狀態', () => {
  const s = base();
  const before = JSON.stringify(s);
  run(s, cmd({ action: 'correct', month: '2026-10', amount: 9 }));
  assert.equal(JSON.stringify(s), before);
});
