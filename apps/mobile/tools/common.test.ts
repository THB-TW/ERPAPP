// 共用工具的測試：多個私人輸出檔一起寫（全成功才留下）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OutputWriteError, thousands, writeNewFiles } from './common.ts';

const dir = () => mkdtempSync(path.join(tmpdir(), 'legacy-common-'));

test('兩個檔一起寫成功：權限 600、沒有留下暫存檔', () => {
  const d = dir();
  try {
    writeNewFiles([{ path: path.join(d, 'a.md'), text: 'A' }, { path: path.join(d, 'b.md'), text: 'B' }]);
    assert.deepEqual(readdirSync(d).sort(), ['a.md', 'b.md']);
    assert.equal(readFileSync(path.join(d, 'b.md'), 'utf8'), 'B');
    assert.equal(statSync(path.join(d, 'a.md')).mode & 0o777, 0o600);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('第二個檔的正式檔名已經存在：第一個檔不會留下，既有的檔案不被動到', () => {
  const d = dir();
  try {
    writeFileSync(path.join(d, 'b.md'), 'precious');
    const failure = (() => { try { writeNewFiles([{ path: path.join(d, 'a.md'), text: 'A' }, { path: path.join(d, 'b.md'), text: 'B' }]); } catch (e) { return e; } })();
    assert.ok(failure instanceof OutputWriteError);
    assert.deepEqual(failure.existing, []);
    assert.deepEqual(readdirSync(d), ['b.md']);
    assert.equal(readFileSync(path.join(d, 'b.md'), 'utf8'), 'precious');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('別人留下的 .partial 不被刪；自己建立的暫存檔與已改名的檔案都收回', () => {
  const d = dir();
  try {
    writeFileSync(path.join(d, 'b.md.partial'), 'someone else');
    assert.throws(() => writeNewFiles([{ path: path.join(d, 'a.md'), text: 'A' }, { path: path.join(d, 'b.md'), text: 'B' }]), OutputWriteError);
    assert.deepEqual(readdirSync(d), ['b.md.partial']);
    assert.equal(readFileSync(path.join(d, 'b.md.partial'), 'utf8'), 'someone else');
    assert.equal(existsSync(path.join(d, 'a.md')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('千分位：數字加逗號、字串原樣', () => {
  assert.equal(thousands(1234567), '1,234,567');
  assert.equal(thousands(-5), '-5');
  assert.equal(thousands('abc'), 'abc');
});
