import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestIndex, trendLayout } from './trendGeometry.ts';

test('折線刻度取好讀的整數，最高點在上、最低點在下，點平均分布', () => {
  const layout = trendLayout([1_230_000, 1_480_000, 1_350_000], 300, 116);
  assert.deepEqual(layout.ticks.map((t) => t.value), [1_600_000, 1_400_000, 1_200_000]);
  assert.deepEqual(layout.points.map((p) => p.x), [0, 150, 300]);
  assert.ok(layout.points[1].y < layout.points[0].y);
  assert.ok(layout.path.startsWith('M0.0 '));
});

test('只有一點或全部相同時置中且不除以零；沒有資料回空', () => {
  const one = trendLayout([500], 200, 100);
  assert.equal(one.points[0].x, 100);
  assert.ok(Number.isFinite(one.points[0].y));
  assert.deepEqual(trendLayout([], 200, 100).points, []);
  assert.equal(nearestIndex([{ x: 0 }, { x: 100 }, { x: 200 }], 140), 1);
});
