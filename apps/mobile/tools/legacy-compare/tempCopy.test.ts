// 暫時副本的清理：被中斷留下的要偵測並刪除；收到 SIGINT／SIGTERM 要先刪再結束。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { removeStaleTemps, TEMP_PREFIX } from './tempCopy.ts';

test('上次被中斷留下的暫時副本被刪掉；其他檔案、符號連結不動', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'legacy-temp-'));
  try {
    mkdirSync(path.join(root, `${TEMP_PREFIX}abc`));
    writeFileSync(path.join(root, `${TEMP_PREFIX}abc`, 'ledger-copy.sqlite'), 'x');
    mkdirSync(path.join(root, `${TEMP_PREFIX}def`));
    writeFileSync(path.join(root, 'keep.md'), 'keep');
    mkdirSync(path.join(root, 'elsewhere'));
    symlinkSync(path.join(root, 'elsewhere'), path.join(root, `${TEMP_PREFIX}link`));
    assert.deepEqual(removeStaleTemps(root), [`${TEMP_PREFIX}abc`, `${TEMP_PREFIX}def`]);
    assert.ok(!existsSync(path.join(root, `${TEMP_PREFIX}abc`)));
    assert.ok(existsSync(path.join(root, 'keep.md')));
    assert.ok(existsSync(path.join(root, `${TEMP_PREFIX}link`)));
    assert.deepEqual(removeStaleTemps(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  test(`收到 ${signal}：先刪暫時副本再結束（結束代碼 ${code}）`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'legacy-signal-'));
    try {
      const dir = path.join(root, `${TEMP_PREFIX}child`);
      const script = `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { guardTempDir } from ${JSON.stringify(path.join(import.meta.dirname, 'tempCopy.ts'))};
        mkdirSync(${JSON.stringify(dir)});
        writeFileSync(${JSON.stringify(path.join(dir, 'ledger-copy.sqlite'))}, 'x');
        guardTempDir(${JSON.stringify(dir)});
        console.log('ready');
        setTimeout(() => {}, 30000);`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
      await new Promise<void>((resolve) => child.stdout.on('data', (d) => String(d).includes('ready') && resolve()));
      const exited = new Promise<number | null>((resolve) => child.on('exit', (c) => resolve(c)));
      child.kill(signal);
      assert.equal(await exited, code);
      assert.ok(!existsSync(dir), '暫時副本資料夾應該已被刪除');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
