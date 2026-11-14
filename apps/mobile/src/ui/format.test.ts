import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, formatPermille } from './format.ts';

test('千分比顯示成一位小數的百分比', () => {
  assert.equal(formatPermille(334), '33.4%');
  assert.equal(formatPermille(1000), '100.0%');
  assert.equal(formatPermille(5), '0.5%');
  assert.equal(formatPermille(0), '0.0%');
});

test('金額加千分位', () => {
  assert.equal(formatAmount(1234567), '1,234,567');
  assert.equal(formatAmount(0), '0');
});
