import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateShares, pieSlices } from './shares.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('占比用最大餘數法分配，合計一定等於總單位數', () => {
  // 三等分：333.3… 各自捨去後剩 1，給餘數最大者；餘數相同時給排在前面的
  assert.deepEqual(allocateShares([1, 1, 1], 1000), [334, 333, 333]);
  assert.deepEqual(allocateShares([50, 30, 20], 1000), [500, 300, 200]);
  // 1/7、2/7、4/7：142.857、285.714、571.428 → 捨去後 998，餘 2 給餘數最大的兩個
  assert.deepEqual(allocateShares([1, 2, 4], 1000), [143, 286, 571]);
  for (const amounts of [[7, 11, 13, 17, 19], [1, 999999], [123456789, 987654321, 5], [3, 3, 3, 3, 3, 3, 3]]) {
    assert.equal(sum(allocateShares(amounts, 1000)), 1000);
    assert.equal(sum(allocateShares(amounts, 180)), 180);
  }
});

test('占比分配的邊界：空清單、全為零、單一項目、含零的項目', () => {
  assert.deepEqual(allocateShares([], 1000), []);
  assert.deepEqual(allocateShares([0, 0], 1000), [0, 0]);
  assert.deepEqual(allocateShares([42], 1000), [1000]);
  assert.deepEqual(allocateShares([0, 5, 0, 5], 1000), [0, 500, 0, 500]);
});

test('占比分配不因金額很大而失準（新台幣整數上限內不用浮點近似）', () => {
  const big = Number.MAX_SAFE_INTEGER - 1;
  assert.deepEqual(allocateShares([big, 1], 1000), [1000, 0]);
  assert.deepEqual(allocateShares([big, big], 1000), [500, 500]);
  assert.throws(() => allocateShares([-1, 2], 1000), /金額/);
  assert.throws(() => allocateShares([1.5], 1000), /金額/);
});

const cat = (id: number, amount: number, permille: number) => ({ categoryId: id, categoryName: `類${id}`, amount, count: 1, permille });

test('圓餅圖切片：不超過上限就一類一片，順序不變', () => {
  const categories = [cat(1, 600, 600), cat(2, 400, 400)];
  assert.deepEqual(pieSlices(categories, 7), [
    { key: '1', name: '類1', amount: 600, permille: 600, categoryIds: [1] },
    { key: '2', name: '類2', amount: 400, permille: 400, categoryIds: [2] },
  ]);
  assert.deepEqual(pieSlices([], 7), []);
});

test('圓餅圖切片：超過上限時，排在後面的合併成「其他分類」，金額與占比為合計', () => {
  const categories = [cat(1, 500, 500), cat(2, 300, 300), cat(3, 120, 120), cat(4, 50, 50), cat(5, 30, 30)];
  const slices = pieSlices(categories, 3);
  assert.deepEqual(slices.map((s) => [s.key, s.name, s.amount, s.permille]), [
    ['1', '類1', 500, 500], ['2', '類2', 300, 300], ['3', '類3', 120, 120], ['rest', '其他分類', 80, 80],
  ]);
  assert.deepEqual(slices[3].categoryIds, [4, 5]);
  assert.equal(sum(slices.map((s) => s.permille)), 1000);
  // 剛好多一類時不合併成只有一類的「其他分類」
  assert.deepEqual(pieSlices(categories.slice(0, 4), 3).map((s) => s.key), ['1', '2', '3', '4']);
});
