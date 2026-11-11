// 比對工具命令列的測試：參數解析與結束代碼（比對本身在 run.test.ts）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversionStopped } from '../legacy-convert/source.ts';
import { OutputPathError } from '../legacy-convert/output.ts';
import { EXIT, UsageError, main, parseCliArgs } from './cli.ts';
import type { CompareOptions, CompareOutcome } from './run.ts';

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
