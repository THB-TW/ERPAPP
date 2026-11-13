import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jumpOffset, reachedTarget, sectionAt } from './sectionNav.ts';

const ORDER = ['overview', 'reserve', 'fixed', 'actual', 'loan'] as const;
const Y = { overview: 16, reserve: 900, fixed: 1500, actual: 2100, loan: 2500 };
// 內容 2900、畫面 700 → 最多捲到 2200；照實支（2100）與貸款（2500）都到不了頂端以上太多。
const VIEW = 700;
const CONTENT = 2900;

test('點頁籤的目標位置是區段頂端減上方空白', () => {
  assert.equal(jumpOffset(Y.reserve, VIEW, CONTENT), 888);
  assert.equal(jumpOffset(Y.overview, VIEW, CONTENT), 4);
});

test('目標超過頁底時限制在可捲的最大位置', () => {
  assert.equal(jumpOffset(Y.loan, VIEW, CONTENT), 2200);
  assert.equal(jumpOffset(Y.actual, VIEW, CONTENT), 2088);
});

test('內容比畫面短時一律捲到 0', () => {
  assert.equal(jumpOffset(500, 800, 600), 0);
});

test('捲到某區段的跳轉位置時，判定為該區段', () => {
  for (const id of ORDER) {
    const offset = jumpOffset(Y[id], VIEW, CONTENT);
    const expected = offset >= 2200 - 2 ? 'loan' : id;
    assert.equal(sectionAt(ORDER, Y, { offset, viewport: VIEW, content: CONTENT }), expected, id);
  }
});

test('標題還沒到上方空白線就仍屬上一區', () => {
  assert.equal(sectionAt(ORDER, Y, { offset: 870, viewport: VIEW, content: CONTENT }), 'overview');
  assert.equal(sectionAt(ORDER, Y, { offset: 890, viewport: VIEW, content: CONTENT }), 'reserve');
});

test('到頁底時標示最後一區；尚未量到最後一區時不強制', () => {
  assert.equal(sectionAt(ORDER, Y, { offset: 2200, viewport: VIEW, content: CONTENT }), 'loan');
  const { loan: _loan, ...withoutLoan } = Y;
  assert.equal(sectionAt(ORDER, withoutLoan, { offset: 2200, viewport: VIEW, content: CONTENT }), 'actual');
});

test('抵達判斷有 2px 容差', () => {
  assert.equal(reachedTarget(887.5, 888), true);
  assert.equal(reachedTarget(880, 888), false);
});
