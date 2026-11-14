import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, isValidMonth, shiftMonth, taipeiDate } from './dates.ts';

test('台北日期：UTC 傍晚已是台北隔天', () => {
  assert.equal(taipeiDate(new Date('2026-11-10T16:30:00Z')), '2026-11-11');
  assert.equal(taipeiDate(new Date('2026-11-10T15:59:59Z')), '2026-11-10');
});

test('日期與月份驗證（含閏年）', () => {
  assert.ok(isValidDate('2028-02-29'));
  assert.ok(!isValidDate('2026-02-29'));
  assert.ok(!isValidDate('2026-04-31'));
  assert.ok(isValidMonth('2026-12'));
  assert.ok(!isValidMonth('2026-00'));
});

test('月份加減跨年', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', 0), '2026-11');
});
