// 預算引擎測試：逐一移植自舊系統 tests/Program.cs 在 --integration 之前的純計算案例，期望數字照抄。
// 這些案例是舊帳驗收的門檻之一；每個 C# PASS 區塊對應這裡一個 test。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  BudgetRuleError,
  applyBudgetCommand,
  effectiveRevision,
  latestMonth,
  openMonth,
  position,
} from './budgetEngine.ts';
import type { BudgetCommand, BudgetExpense, BudgetState } from './budgetTypes.ts';

const FIXED_TIME = '2026-11-07T12:00:00+08:00';

function example(): BudgetState {
  return {
    version: 0,
    categories: [
      { id: 'study', name: '學習深造', kind: 'reserve' },
      { id: 'ai', name: 'AI', kind: 'reserve' },
    ],
    revisions: [
      {
        id: 'caps', month: '2026-10', tuition: 15000,
        limits: [{ categoryId: 'study', amount: 22983 }, { categoryId: 'ai', amount: 0 }],
        mapping: { AI: 'ai' }, reason: '', actor: '', time: '',
      },
    ],
    months: [
      month({ id: 'sep', month: '2026-09', rawSpare: 49031, tuition: 60000, balances: { study: 145854 } }),
      month({ id: 'oct', month: '2026-10', income: 51058, surplus: 13075, rawSpare: 62106, tuition: 75000, balances: { study: 149561 } }),
    ],
    closeHistory: [],
    adjustments: [],
    receipts: [],
    checks: [],
  };
}

function month(p: Partial<BudgetState['months'][number]>): BudgetState['months'][number] {
  return {
    id: '', month: '', income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {},
    revision: null, migrated: false, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '', ...p,
  };
}

function cmd(p: Partial<BudgetCommand> & { action: string; month: string }): BudgetCommand {
  return { operationId: randomUUID(), version: 0, reason: '已確認的測試依據', ...p };
}

function apply(state: BudgetState, command: BudgetCommand, expenses?: BudgetExpense[]) {
  return applyBudgetCommand(state, command, { actor: 'test', time: FIXED_TIME, expenses });
}

// 對應 C# 的 Run()：版本取目前狀態、操作識別碼隨機；close 帶 AI 實支。
function run(state: BudgetState, action: string, m: string, amount = 0) {
  return apply(
    state,
    cmd({ action, month: m, amount, version: state.version }),
    action === 'close' ? [{ category: 'AI', amount: m === '2026-09' ? 28419 : 19276 }] : undefined,
  );
}

function rejects(kind: 'argument' | 'operation', fn: () => unknown) {
  assert.throws(fn, (e: unknown) => e instanceof BudgetRuleError && e.kind === kind);
}

test('C# 案例 1 前期更正在撤銷重結後只套用一次', () => {
  let state = example();
  state = run(state, 'correct', '2026-10', -700);
  assert.equal(position(state, '2026-09').spare, 48331);
  assert.equal(position(state, '2026-10').spare, 61406);
  state = run(state, 'rollback', '2026-10');
  assert.equal(position(state, '2026-09').spare, 48331);
  state = run(state, 'close', '2026-10', 51058);
  assert.equal(position(state, '2026-10').spare, 61406);
  assert.equal(position(state, '2026-10').total, 285967);
});

test('C# 案例 2 挪用守恆，重送不重做', () => {
  let state = example();
  const transfer = cmd({ action: 'transfer', month: '2026-10', from: 'study', to: 'ai', amount: 6802, reason: 'AI 超支由學習支應' });
  state = apply(state, transfer);
  assert.equal(position(state, '2026-10').balances.ai, 6802);
  assert.equal(position(state, '2026-10').reserve, 149561);
  assert.equal(position(state, '2026-10').total, 286667);
  state = apply(state, transfer);
  assert.equal(state.adjustments.length, 1);
});

test('C# 案例 3 新類別從開放月份開始，不改舊快照與儲備', () => {
  const state = apply(example(), cmd({ action: 'add', month: '2026-11', name: '旅遊', kind: 'reserve', amount: 2000, reason: '單獨編列旅費' }));
  assert.equal(effectiveRevision(state, '2026-10')!.limits.length, 2);
  assert.equal(effectiveRevision(state, '2026-11')!.limits.length, 3);
  assert.equal(position(state, '2026-10').reserve, 149561);
});

// 後面幾個案例接續 C# 的 categoryState／lifecycle／mappingState，共用同一條建構路線。
function categoryState() {
  return apply(example(), cmd({ action: 'add', month: '2026-11', name: '旅遊', kind: 'reserve', amount: 2000, reason: '單獨編列旅費' }));
}
function lifecycleState() {
  const s = categoryState();
  return apply(s, cmd({
    action: 'caps', month: '2026-11', version: s.version, tuition: 15000, reason: '調高 AI 上限',
    limits: effectiveRevision(s, '2026-11')!.limits.map((l) => ({ categoryId: l.categoryId, amount: l.categoryId === 'ai' ? 3000 : l.amount })),
  }));
}

test('C# 案例 4 儲存上限逐版保留，已結月份用原快照', () => {
  const lifecycle = lifecycleState();
  assert.equal(effectiveRevision(lifecycle, '2026-10')!.limits.find((l) => l.categoryId === 'ai')!.amount, 0);
  assert.equal(effectiveRevision(lifecycle, '2026-11')!.limits.find((l) => l.categoryId === 'ai')!.amount, 3000);
  assert.equal(lifecycle.revisions.length, 3);
});

test('C# 案例 5 沖銷以相反金額附加，不刪原紀錄', () => {
  const transfer = cmd({ action: 'transfer', month: '2026-10', from: 'study', to: 'ai', amount: 6802, reason: 'AI 超支由學習支應' });
  const transferState = apply(example(), transfer);
  const reversed = apply(transferState, cmd({
    action: 'reverse', month: '2026-10', reverses: transfer.operationId, reason: '撤回挪用', version: transferState.version,
  }));
  assert.equal(position(reversed, '2026-10').balances.ai, 0);
  assert.equal(reversed.adjustments.length, 2);
});

test('C# 案例 6 歸屬依月份凍結；停用類別轉出儲備並保留歷史', () => {
  const lifecycle = lifecycleState();
  const mapping = apply(lifecycle, cmd({ action: 'map', month: '2026-11', sourceCategory: 'AI 訂閱', to: 'ai', reason: '統一訂閱支出歸屬', version: lifecycle.version }));
  assert.equal('AI 訂閱' in effectiveRevision(mapping, '2026-10')!.mapping, false);
  assert.equal(effectiveRevision(mapping, '2026-11')!.mapping['AI 訂閱'], 'ai');
  const retired = apply(mapping, cmd({ action: 'retire', month: '2026-11', from: 'study', to: 'ai', reason: '合併儲備用途', version: mapping.version }));
  assert.equal(effectiveRevision(retired, '2026-11')!.limits.some((l) => l.categoryId === 'study'), false);
  assert.equal(position(retired, '2026-10').balances.ai, 149561);
  assert.equal(effectiveRevision(retired, '2026-10')!.limits.length, 2);
});

test('C# 案例 7 更正等原月份重結；沿用的上限在重結時凍結', () => {
  let pending = example();
  pending.months.unshift(month({ id: 'aug', month: '2026-08', rawSpare: 38718, tuition: 45000, balances: { study: 151325 } }));
  pending.revisions.unshift({
    id: 'sep-caps', month: '2026-09', tuition: 15000,
    limits: [{ categoryId: 'study', amount: 22948 }, { categoryId: 'ai', amount: 0 }],
    mapping: { AI: 'ai' }, reason: '', actor: '', time: '',
  });
  pending = run(pending, 'correct', '2026-10', -700);
  pending = run(pending, 'rollback', '2026-10');
  pending = run(pending, 'rollback', '2026-09');
  assert.equal(position(pending, '2026-08').spare, 38718);
  assert.equal(pending.adjustments.length, 1);
  pending = run(pending, 'close', '2026-09', 48261);
  assert.equal(position(pending, '2026-09').spare, 48331);
  pending.revisions = pending.revisions.filter((r) => r.month !== '2026-10');
  pending = run(pending, 'close', '2026-10', 51058);
  assert.equal(pending.months[pending.months.length - 1].revision!.month, '2026-10');
});

test('C# 案例 8 歷史資料不完整時，撤銷與更正都要求先核對', () => {
  const unsafe = example();
  unsafe.months[unsafe.months.length - 1].migrated = true;
  unsafe.months[unsafe.months.length - 1].legacyTotalDifference = 10;
  rejects('operation', () => run(unsafe, 'rollback', '2026-10'));
  rejects('operation', () => run(unsafe, 'correct', '2026-10', -700));
});

test('C# 案例 9 過期寫入、透支、零更正與未歸屬支出都被拒絕', () => {
  const transferState = apply(example(), cmd({ action: 'transfer', month: '2026-10', from: 'study', to: 'ai', amount: 6802, reason: 'AI 超支由學習支應' }));
  rejects('operation', () => apply(transferState, cmd({ action: 'transfer', month: '2026-10', from: 'study', to: 'ai', amount: 1, reason: '過期頁面', version: 0 })));
  rejects('operation', () => apply(example(), cmd({ action: 'transfer', month: '2026-10', from: 'study', to: 'ai', amount: 150000, reason: '不能透支' })));
  rejects('argument', () => run(example(), 'correct', '2026-10', 0));
  const unknown = run(example(), 'rollback', '2026-10');
  rejects('operation', () => apply(unknown, cmd({ action: 'close', month: '2026-10', amount: 51058, reason: '未知分類必須先指定', version: unknown.version }), [{ category: '未指定支出', amount: 100 }]));
});

test('C# 案例 10 可用餘額補入儲備：資產不變；沖銷、重送、重結都只有一次影響', () => {
  const fundBase = example();
  const funding = cmd({ action: 'fund', month: '2026-10', to: 'ai', amount: 2000, reason: '以可用餘額補預備金' });
  const funded = apply(fundBase, funding);
  const base10 = position(fundBase, '2026-10');
  assert.equal(position(funded, '2026-10').spare, base10.spare - 2000);
  assert.equal(position(funded, '2026-10').balances.ai, 2000);
  assert.equal(position(funded, '2026-10').total, base10.total);
  assert.equal(position(funded, '2026-10').tuition, base10.tuition);
  assert.equal(apply(funded, funding).adjustments.length, 1);
  const unfunded = apply(funded, cmd({ action: 'reverse', month: '2026-10', reverses: funding.operationId, version: funded.version, reason: '取消補入' }));
  assert.equal(position(unfunded, '2026-10').spare, base10.spare);
  let waiting = run(funded, 'rollback', '2026-10');
  assert.equal(position(waiting, '2026-09').spare, position(fundBase, '2026-09').spare);
  waiting = run(waiting, 'close', '2026-10', 51058);
  assert.equal(position(waiting, '2026-10').spare, position(funded, '2026-10').spare);
  const unadjustedReclose = run(run(fundBase, 'rollback', '2026-10'), 'close', '2026-10', 51058);
  assert.equal(position(unadjustedReclose, '2026-10').balances.ai + 2000, position(waiting, '2026-10').balances.ai);
  rejects('operation', () => apply(fundBase, cmd({ action: 'fund', month: '2026-10', to: 'ai', amount: 1000000, reason: '不足' })));
  rejects('argument', () => apply(fundBase, cmd({ action: 'fund', month: '2026-10', to: 'ai', amount: -1, reason: '負額' })));
});
