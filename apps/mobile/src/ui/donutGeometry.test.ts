import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donutPath, donutSegments } from './donutGeometry.ts';

const TURN = Math.PI * 2;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≈ ${expected}`);

test('甜甜圈：沒有資料或全為零時沒有分段', () => {
  assert.deepEqual(donutSegments([]), []);
  assert.deepEqual(donutSegments([0, 0]), []);
});

test('甜甜圈：唯一正值佔完整一圈，零值不製造接縫', () => {
  assert.deepEqual(donutSegments([0, 100, 0]), [{ index: 1, startAngle: 0, endAngle: TURN }]);
});

test('甜甜圈：依金額比例由正上方順時針排列', () => {
  assert.deepEqual(donutSegments([1, 1, 2]), [
    { index: 0, startAngle: 0, endAngle: Math.PI / 2 },
    { index: 1, startAngle: Math.PI / 2, endAngle: Math.PI },
    { index: 2, startAngle: Math.PI, endAngle: TURN },
  ]);
});

test('甜甜圈：略過零值仍保留原始索引與顏色順序', () => {
  const segments = donutSegments([0, 3, 0, 1, 0]);
  assert.deepEqual(segments.map((segment) => segment.index), [1, 3]);
  near(segments[0].endAngle, Math.PI * 1.5);
  assert.equal(segments[1].startAngle, segments[0].endAngle);
  assert.equal(segments[1].endAngle, TURN);
});

test('甜甜圈：三等份連續閉合，不因累加誤差留下額外縫隙', () => {
  const segments = donutSegments([1, 1, 1]);
  near(segments[0].endAngle, TURN / 3);
  for (let i = 1; i < segments.length; i++) assert.equal(segments[i].startAngle, segments[i - 1].endAngle);
  assert.equal(segments.at(-1)?.endAngle, TURN);
});

test('甜甜圈：總額超過安全整數時，分段比例仍正確', () => {
  const segments = donutSegments([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
  assert.equal(segments[0].endAngle, Math.PI);
  assert.equal(segments[1].endAngle, TURN);
});

test('甜甜圈：小額分段不再被原本的 180 格量化捨去', () => {
  const segments = donutSegments([1000, 1]);
  assert.equal(segments.length, 2);
  const span = segments[1].endAngle - segments[1].startAngle;
  assert.ok(span > 0 && span < TURN / 180);
  near(span, TURN / 1001);
});

test('甜甜圈：維持非負安全整數的金額限制', () => {
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => donutSegments([1, invalid]), /金額必須是不小於 0 的整數/);
  }
});

test('甜甜圈：計算不改動輸入資料', () => {
  const amounts = Object.freeze([3, 0, 1]);
  donutSegments(amounts);
  assert.deepEqual(amounts, [3, 0, 1]);
});

test('甜甜圈路徑：維持內外半徑，以四個圓角及兩段弧封閉切片', () => {
  const path = donutPath(donutSegments([1, 1])[0]);
  assert.equal((path.match(/Q /g) ?? []).length, 4);
  assert.deepEqual([...path.matchAll(/A (\S+) (\S+) 0 ([01]) ([01])/g)].map((match) => match.slice(1)), [
    ['97', '97', '0', '1'], ['63', '63', '0', '0'],
  ]);
  assert.ok(path.endsWith('Z'));
  const start = /^M (\S+) (\S+)/.exec(path)!;
  // 起點往順時針方向內縮，正上方留下細縫與圓角；外徑保持原樣。
  assert.ok(Number(start[1]) > 110);
  near(Math.hypot(Number(start[1]) - 110, Number(start[2]) - 110), 97);
});

test('甜甜圈路徑：極小切片的縫隙與圓角會縮小，弧不反轉', () => {
  for (const amounts of [[99999999, 1], [1, 99999999]]) {
    const segments = donutSegments(amounts);
    const small = segments[amounts[0] === 1 ? 0 : 1];
    const path = donutPath(small);
    assert.doesNotMatch(path, /NaN|Infinity/);
    const arcs = [...path.matchAll(/A \S+ \S+ 0 ([01]) ([01]) (\S+) (\S+)/g)];
    assert.deepEqual(arcs.map((match) => match.slice(1, 3)), [['0', '1'], ['0', '0']]);
    const start = /^M (\S+) (\S+)/.exec(path)!;
    // 小切片的外弧仍有長度，不能被固定大小的間隔或圓角吃掉。
    assert.ok(Math.hypot(Number(arcs[0][3]) - Number(start[1]), Number(arcs[0][4]) - Number(start[2])) > 0);
  }
});

test('甜甜圈路徑：內外弧各自判斷是否超過半圓', () => {
  const path = donutPath({ index: 0, startAngle: 0, endAngle: Math.PI + 0.11 });
  const arcs = [...path.matchAll(/A \S+ \S+ 0 ([01]) ([01])/g)];
  assert.deepEqual(arcs.map((match) => match.slice(1)), [['1', '1'], ['0', '0']]);
});
