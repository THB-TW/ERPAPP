// 比對工具命令列的測試：參數解析與結束代碼（比對本身在 run.test.ts）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversionStopped } from '../legacy-convert/source.ts';
import { OutputPathError } from '../legacy-convert/output.ts';
import { EXIT, UsageError, main, parseCliArgs } from './cli.ts';
import { ReportWriteFailed, type CompareOptions, type CompareOutcome } from './run.ts';

test('參數解析：三個位置參數與 --manifest-sha256；其他一律用法錯誤', () => {
  const o = parseCliArgs(['/p/export', '/p/ledger.sqlite', '/p/report.md', '--manifest-sha256', 'ABC']);
  assert.deepEqual(o, { exportDirectory: '/p/export', ledgerPath: '/p/ledger.sqlite', reportPath: '/p/report.md', expectedManifestSha256: 'abc' });
  for (const argv of [[], ['a', 'b'], ['a', 'b', 'c', 'd'], ['a', 'b', 'c', '--nope']]) assert.throws(() => parseCliArgs(argv), UsageError, argv.join(' '));
});

const outcome = (passed: boolean): CompareOutcome => ({
  passed, thresholdDifferences: passed ? 0 : 3, reportPath: '/p/report.md', summaryPath: '/p/report-summary.md', summary: ['摘要第一行', '摘要第二行'],
});

async function run(compare: (o: CompareOptions) => Promise<CompareOutcome>) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(['a', 'b', 'c'], compare, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('結束代碼：全過 0；門檻有差異 3（仍印摘要與報告位置）；位置或輸入驗證問題 2；其他 1；用法 64', async () => {
  const ok = await run(async () => outcome(true));
  assert.equal(ok.code, EXIT.ok);
  assert.match(ok.out, /摘要第一行/);
  assert.match(ok.out, /完整報告.*\/p\/report\.md/);

  const differences = await run(async () => outcome(false));
  assert.equal(differences.code, EXIT.differences);
  assert.equal(EXIT.differences, 3);
  assert.match(differences.out, /摘要第一行/);
  assert.match(differences.err, /3 項差異/);

  assert.equal((await run(async () => { throw new OutputPathError('位置不對'); })).code, EXIT.stopped);
  assert.equal((await run(async () => { throw new ConversionStopped('基準不符'); })).code, EXIT.stopped);
  const other = await run(async () => { throw new Error('Checksum differs: x'); });
  assert.equal(other.code, EXIT.failed);
  assert.match(other.err, /Checksum differs/);
  const usage = await main(['a'], async () => outcome(true), { out: () => {}, err: () => {} });
  assert.equal(usage, EXIT.usage);
});

test('非預期的錯誤：stderr 先警告可能含私人資料，再印訊息；不會出現在摘要裡', async () => {
  const other = await run(async () => { throw new Error('裡面有 虛構名稱'); });
  assert.equal(other.code, EXIT.failed);
  const lines = other.err.split('\n');
  assert.equal(lines[0], '以下錯誤訊息可能含私人資料，請勿貼到公開位置');
  assert.match(lines[1], /虛構名稱/);
  assert.equal(other.out, '');
  // 位置、輸入問題的訊息是我們自己寫的固定說明，不需要警告
  const stopped = await run(async () => { throw new ConversionStopped('基準不符'); });
  assert.doesNotMatch(stopped.err, /私人資料/);
});

test('恰好 1 項門檻差異也是結束代碼 3；摘要後印出給操作者的回報指示', async () => {
  const one = await run(async () => ({ ...outcome(false), thresholdDifferences: 1 }));
  assert.equal(one.code, EXIT.differences);
  assert.match(one.err, /1 項差異/);
  assert.match(one.out, /請把上面的摘要內容回報/);
});

test('報告寫不進去：有門檻差異（就算只有 1 項）仍是結束代碼 3 並把摘要印在終端機；沒有差異才是 1', async () => {
  const one = await run(async () => { throw new ReportWriteFailed('報告寫入失敗', 1, [], ['摘要第一行']); });
  assert.equal(one.code, EXIT.differences);
  assert.match(one.out, /摘要第一行/);
  const none = await run(async () => { throw new ReportWriteFailed('報告寫入失敗', 0, [], ['摘要第一行']); });
  assert.equal(none.code, EXIT.failed);
});
