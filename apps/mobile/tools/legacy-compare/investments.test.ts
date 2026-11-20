// 來源合成匯出與帳本服務端到端比對；以另一份來源製造差異，不改SQLite內部。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparableExport, fictionalBaseline, fictionalInvestmentRows, writeFictionalExport } from '../legacy-convert/testExport.ts';
import { setup } from './testSupport.ts';

test('投資成本、市值、期初宣告與累計投入淨額相同才通過，摘要不含標的名稱或金額', async () => {
  const data = comparableExport(); data.investments = fictionalInvestmentRows();
  const t = await setup(data);
  try {
    const result = await t.run();
    assert.equal(result.passed, true);
    assert.match(result.summary.join('\n'), /投資：來源 2 個標的、App 2 個標的/);
    assert.match(readFileSync(result.reportPath, 'utf8'), /累計投入淨額.*46/);
    assert.doesNotMatch(result.summary.join('\n'), /虛構台股|虛構幣桶|\bFICT\b/);
    assert.doesNotMatch(result.summary.join('\n'), /尚未涵蓋：投資/);
  } finally { t.cleanup(); }
});

test('來源投資成本、最新市值或期初投入不同時擋驗收，不能只比交易筆數', async () => {
  for (const change of [
    (x: ReturnType<typeof fictionalInvestmentRows>) => { x.transactions[0].Amount = 13; },
    (x: ReturnType<typeof fictionalInvestmentRows>) => { x.valuations[1].UnitPrice = '80.0000'; },
    (x: ReturnType<typeof fictionalInvestmentRows>) => { x.openings[0].NetDeployed = 70; },
  ]) {
    const data = comparableExport(); data.investments = fictionalInvestmentRows();
    const t = await setup(data);
    try {
      const source = comparableExport(); source.investments = fictionalInvestmentRows(); change(source.investments);
      const result = await t.run({ exportDirectory: writeFictionalExport(t.priv, source), expectedBaseline: fictionalBaseline(source) });
      assert.equal(result.passed, false);
      assert.match(result.summary.join('\n'), /投資.*差異/);
    } finally { t.cleanup(); }
  }
});

test('獨立來源算法保留 C# decimal 中間精度，半元邊界不誤報為有理數損益', async () => {
  const data = comparableExport(); data.investments = fictionalInvestmentRows();
  data.investments.holdings = data.investments.holdings.filter((h) => h.Id === 7);
  data.investments.transactions = [
    { Id: 1, HoldingId: 7, Date: '2026-07-01', TxType: '期初', Quantity: '6.0000', Amount: 5, FundSource: '帳外', Note: null },
    { Id: 2, HoldingId: 7, Date: '2026-08-01', TxType: '賣', Quantity: '3.0000', Amount: 2, FundSource: '帳外', Note: null },
    { Id: 3, HoldingId: 7, Date: '2026-09-01', TxType: '買', Quantity: '2.0000', Amount: 7, FundSource: '帳外', Note: null },
  ];
  data.investments.valuations = [];
  const t = await setup(data);
  try {
    const result = await t.run();
    assert.equal(result.passed, true);
    const report = readFileSync(result.reportPath, 'utf8');
    assert.match(report, /虛構台股 \| 10 \| 10 \| 10 \| 10/);
  } finally { t.cleanup(); }
});
