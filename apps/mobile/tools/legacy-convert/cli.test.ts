// 命令列介面的測試：參數解析與結束代碼。轉換本身的測試在 convert.test.ts。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { ConversionStopped, type ConvertOptions, type ConvertSummary } from './convert.ts';
import { OutputPathError } from './output.ts';
import { UsageError, main, parseCliArgs } from './cli.ts';

test('參數解析：兩個位置參數、可重複的 --account 與 --opening、--mixed-flow、--no-prompt', () => {
  const o = parseCliArgs([
    '/p/export', '/p/out.sqlite', '--mixed-flow', 'split', '--account', '現金=cash', '--account', '舊卡=credit_card',
    '--opening', '現金=1,200', '--opening', '舊卡=-300', '--card-account', '舊卡', '--manifest-sha256', 'ABC123', '--no-prompt',
  ]);
  assert.equal(o.exportDirectory, '/p/export');
  assert.equal(o.outputPath, '/p/out.sqlite');
  assert.equal(o.mixedFlow, 'split');
  assert.deepEqual(o.accountKinds, { 現金: 'cash', 舊卡: 'credit_card' });
  assert.deepEqual(o.openingBalances, { 現金: 1200, 舊卡: -300 });
  assert.equal(o.expectedManifestSha256, 'abc123');
  assert.equal(o.cardStatementAccount, '舊卡');
  assert.equal(o.prompt, false);
  assert.equal(parseCliArgs(['a', 'b']).mixedFlow, 'stop');
  assert.equal(parseCliArgs(['a', 'b']).prompt, true);
});

test('參數錯誤一律丟 UsageError', () => {
  for (const argv of [[], ['a'], ['a', 'b', 'c'], ['a', 'b', '--mixed-flow', 'x'], ['a', 'b', '--account', '現金'],
    ['a', 'b', '--account', '現金=foo'], ['a', 'b', '--opening', '現金=abc'], ['a', 'b', '--opening', '=5'], ['a', 'b', '--nope']]) {
    assert.throws(() => parseCliArgs(argv), UsageError, argv.join(' '));
  }
});

const summary: ConvertSummary = {
  outputPath: '/p/out.sqlite', manifestSha256: 'a'.repeat(64), sourceCommit: 'c', sourceDatabase: 'd', cutoffMonth: '2026-10',
  openingDate: '2026-11-01', transactions: 1, accounts: 1, categories: 1, members: 1, months: 1, monthsWithLegacyDifference: 0,
  documentVersion: 1, incomeTotal: 0, expenseTotal: 5, cardStatements: 0, cardStatementTotal: 0, firstDate: '2026-10-01', lastDate: '2026-10-01',
  openings: [{ account: '現金', amount: 5, source: '命令列參數' }], legacyAccountBalances: [{ account: '現金', balance: '0.00' }], notMigrated: [{ table: 'dbo.Employee', rows: 3 }], notices: [],
};

function run(convert: Parameters<typeof main>[1]) {
  const out: string[] = [];
  const err: string[] = [];
  return main(['/p/export', '/p/out.sqlite', '--no-prompt'], convert, { out: (l) => out.push(l), err: (l) => err.push(l), interactive: false })
    .then((code) => ({ code, out: out.join('\n'), err: err.join('\n') }));
}

test('結束代碼：成功 0；需要人處理 2；其他錯誤 1；用法錯誤 64，並印出用法', async () => {
  const ok = await run(async () => summary);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /轉換完成/);

  const stop = await run(async () => { throw new ConversionStopped('請決定'); });
  assert.equal(stop.code, 2);
  assert.match(stop.err, /請決定/);

  const path = await run(async () => { throw new OutputPathError('輸出檔已存在'); });
  assert.equal(path.code, 2);
  assert.doesNotMatch(path.err, /Checksum/);

  const bad = await run(async () => { throw new Error('Checksum differs: x.json'); });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /Checksum differs/);
  assert.match(bad.err, /驗證/);

  const usage = await main([], async () => summary, { out: () => {}, err: () => {} });
  assert.equal(usage, 64);
});

test('帳戶名稱叫 constructor 或 __proto__ 時，參數解析仍是自己的值', () => {
  const o = parseCliArgs(['a', 'b', '--account', 'constructor=cash', '--account', '__proto__=bank', '--opening', '__proto__=5']);
  assert.equal(Object.hasOwn(o.accountKinds!, 'constructor'), true);
  assert.equal(Object.hasOwn(o.accountKinds!, '__proto__'), true);
  assert.equal(Object.hasOwn(o.openingBalances!, '__proto__'), true);
  assert.equal(Object.entries(o.accountKinds!).length, 2);
});

test('需要詢問但不是互動終端：等同 --no-prompt（不給詢問管道）', async () => {
  let seen: ConvertOptions | undefined;
  const io = (interactive: boolean, input?: PassThrough) => ({ out: () => {}, err: () => {}, interactive, ...(input ? { input } : {}) });
  await main(['a', 'b'], async (o) => { seen = o; return summary; }, io(false));
  assert.equal(seen!.ask, undefined);
  await main(['a', 'b'], async (o) => { seen = o; return summary; }, io(true, new PassThrough()));
  assert.equal(typeof seen!.ask, 'function');
});

test('互動終端中途關閉輸入（Ctrl-D）：詢問轉成 ConversionStopped，結束代碼 2，不是無聲結束', async () => {
  const input = new PassThrough();
  const errs: string[] = [];
  const code = await main(['a', 'b'], async (o) => {
    const pending = o.ask!('帳戶「X」的餘額是多少？');
    input.end();
    await pending;
    return summary;
  }, { out: () => {}, err: (l) => errs.push(l), interactive: true, input });
  assert.equal(code, 2);
  assert.match(errs.join(''), /輸入已關閉/);
});

test('可重複用 --investment-account 明確指定投資交易編號與帳戶，不接受不明編號或衝突', () => {
  const parsed = parseCliArgs(['a', 'b', '--investment-account', '15=虛構銀行', '--investment-account', '21=虛構現金']);
  assert.deepEqual(parsed.investmentAccounts, { '15': '虛構銀行', '21': '虛構現金' });
  for (const values of [['0=銀行'], ['abc=銀行'], ['1.5=銀行'], ['15=銀行', '15=現金']]) {
    assert.throws(() => parseCliArgs(['a', 'b', ...values.flatMap((value) => ['--investment-account', value])]), UsageError);
  }
});
