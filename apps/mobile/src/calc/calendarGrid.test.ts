import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid } from './calendarGrid.ts';

test('2026 年 11 月：1 日是週日，共 5 週', () => {
  const weeks = monthGrid('2026-11');
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0], '2026-11-01');
  assert.deepEqual(weeks[4].slice(0, 2), ['2026-11-29', '2026-11-30']);
  assert.equal(weeks[4][2], null);
});

test('2026 年 2 月：28 天剛好 4 週，月初週日起', () => {
  const weeks = monthGrid('2026-02');
  assert.equal(weeks.length, 4);
  assert.ok(weeks.every((w) => w.length === 7 && w.every((d) => d !== null)));
});

test('月初不在週日時前面補空格', () => {
  const weeks = monthGrid('2026-10'); // 10/1 是週四
  assert.deepEqual(weeks[0].slice(0, 4), [null, null, null, null]);
  assert.equal(weeks[0][4], '2026-10-01');
});
