// 輸出位置檢查的測試：只能寫到私人位置之下、不覆寫、且要被 Git 忽略。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultPrivateRoot, repositoryRoot } from '../../../../tools/lib/verify-export.mjs';
import { assertGitIgnored, assertPrivateOutput } from './output.ts';

function privateRoot() {
  const root = mkdtempSync(join(tmpdir(), 'legacy-output-'));
  const priv = join(root, '.private');
  mkdirSync(priv);
  return { root, priv, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('私人位置之下的新檔案可以寫；回傳解開符號連結後的絕對路徑', () => {
  const { priv, cleanup } = privateRoot();
  try {
    mkdirSync(join(priv, 'out'));
    assert.equal(assertPrivateOutput(join(priv, 'out', 'ledger.sqlite'), priv).endsWith(join('out', 'ledger.sqlite')), true);
    assert.ok(assertPrivateOutput(join(priv, 'ledger.sqlite'), priv)); // 直接放在私人資料夾下也可以
  } finally { cleanup(); }
});

test('私人位置以外一律拒絕：一般資料夾、上層、用 .. 繞出去、符號連結指到外面', () => {
  const { root, priv, cleanup } = privateRoot();
  try {
    mkdirSync(join(root, 'elsewhere'));
    assert.throws(() => assertPrivateOutput(join(root, 'elsewhere', 'a.sqlite'), priv), /私人/);
    assert.throws(() => assertPrivateOutput(join(root, 'a.sqlite'), priv), /私人/);
    assert.throws(() => assertPrivateOutput(join(priv, '..', 'a.sqlite'), priv), /私人/);
    symlinkSync(join(root, 'elsewhere'), join(priv, 'link'));
    assert.throws(() => assertPrivateOutput(join(priv, 'link', 'a.sqlite'), priv), /私人/);
  } finally { cleanup(); }
});

test('目的檔已存在（含符號連結）拒絕，不覆寫；目錄不存在或私人資料夾不存在也有清楚訊息', () => {
  const { root, priv, cleanup } = privateRoot();
  try {
    writeFileSync(join(priv, 'old.sqlite'), 'keep');
    assert.throws(() => assertPrivateOutput(join(priv, 'old.sqlite'), priv), /已存在/);
    symlinkSync(join(root, 'nowhere'), join(priv, 'dangling.sqlite'));
    assert.throws(() => assertPrivateOutput(join(priv, 'dangling.sqlite'), priv), /已存在/);
    assert.throws(() => assertPrivateOutput(join(priv, 'no-such-dir', 'a.sqlite'), priv), /不存在/);
    assert.throws(() => assertPrivateOutput(join(priv, 'a.sqlite'), join(root, 'no-private')), /找不到私人資料夾/);
  } finally { cleanup(); }
});

test('只剩上次被中斷留下的 .partial：訊息指明是哪個檔、要刪哪個', () => {
  const { priv, cleanup } = privateRoot();
  try {
    writeFileSync(join(priv, 'ledger.sqlite.partial'), 'half');
    try {
      assertPrivateOutput(join(priv, 'ledger.sqlite'), priv);
      assert.fail('應該拒絕');
    } catch (e) {
      assert.match((e as Error).message, /中斷/);
      assert.ok((e as Error).message.includes(join(priv, 'ledger.sqlite.partial').replace(/^.*\.private/, '')));
      assert.match((e as Error).message, /刪除/);
    }
  } finally { cleanup(); }
});

test('Git 忽略檢查：.private 之下通過，一般程式目錄拒絕', () => {
  assertGitIgnored(join(defaultPrivateRoot, 'legacy', 'ledger.sqlite'));
  assert.throws(() => assertGitIgnored(join(repositoryRoot, 'apps', 'mobile', 'ledger.sqlite')), /Git 忽略/);
});
