// 虛構匯出經實際轉換工具產檔後，只經帳本服務查詢驗證。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openNodeDatabase } from '../../src/db/nodeDriver.ts';
import { openLedger } from '../../src/ledger/index.ts';
import { convertLegacy, ConversionStopped } from './convert.ts';
import { fictionalExport, fictionalBaseline, fictionalInvestmentRows, writeFictionalExport } from './testExport.ts';

async function run(edit?: (data: ReturnType<typeof fictionalInvestmentRows>) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'investment-convert-'));
  const priv = path.join(root, 'synthetic'); mkdirSync(priv);
  const data = fictionalExport(); data.investments = fictionalInvestmentRows(); edit?.(data.investments);
  const exportDirectory = writeFictionalExport(priv, data);
  const outputPath = path.join(priv, 'ledger.sqlite');
  const convert = (investmentAccounts?: Record<string, string>) => convertLegacy({ exportDirectory, outputPath, privateRoot: priv, expectedBaseline: fictionalBaseline(data), openingBalances: { 信用卡: -300 }, investmentAccounts });
  return { root, outputPath, convert, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test('轉換工具搬入四張投資表並從輸出帳本讀回成本、市值與投入淨額', async () => {
  const t = await run();
  try {
    const summary = await t.convert();
    assert.ok(!summary.notMigrated.some((t) => /Investment/.test(t.table)));
    const ledger = await openLedger(openNodeDatabase(t.outputPath));
    try {
      const portfolio = await ledger.getInvestmentPortfolio('2026-10-31');
      assert.equal(portfolio.positions.find((p) => p.holdingId === 7)!.cost, 7);
      assert.equal(portfolio.positions.find((p) => p.holdingId === 7)!.marketValue, 12);
      assert.equal(portfolio.positions.find((p) => p.holdingId === 9)!.cost, -50);
      assert.equal(await ledger.getNetDeployed('2026-10-31'), 46);
      assert.equal((await ledger.listInvestmentValuations()).length, 3);
    } finally { await ledger.close(); }
  } finally { t.cleanup(); }
});
test('舊投資有未知類型或開帳後帳內買賣缺帳戶時停止，不產生輸出', async () => {
  for (const edit of [
    (data: ReturnType<typeof fictionalInvestmentRows>) => { data.transactions[1].TxType = '未知'; },
    (data: ReturnType<typeof fictionalInvestmentRows>) => { data.transactions[1].Date = '2026-11-02'; },
  ]) {
    const t = await run(edit);
    try {
      await assert.rejects(t.convert(), (e: unknown) => e instanceof ConversionStopped);
      assert.equal(existsSync(t.outputPath), false);
    } finally { t.cleanup(); }
  }
});

test('開帳日後帳內投資可依明確交易編號指定帳戶，歷史列仍沒有帳戶', async () => {
  const t = await run((data) => { data.transactions[1].Date = '2026-11-02'; });
  try {
    await t.convert({ '15': '銀行' });
    const ledger = await openLedger(openNodeDatabase(t.outputPath));
    try {
      const bank = (await ledger.listAccountBalances('2026-11-30')).find((a) => a.name === '銀行')!;
      assert.equal(bank.balance, 20004);
      const txs = await ledger.listInvestmentTransactions();
      assert.equal(txs.find((t) => t.id === 15)!.accountId, bank.id);
      assert.equal(txs.find((t) => t.id === 12)!.accountId, null);
    } finally { await ledger.close(); }
  } finally { t.cleanup(); }
});
test('投資帳戶對應有未知編號、未知帳戶或指向歷史交易時拒絕且不產生輸出', async () => {
  const mappings: Record<string, string>[] = [{ '999': '銀行' }, { '15': '不存在' }, { '12': '銀行' }, { 'abc': '銀行' }];
  for (const mapping of mappings) {
    const t = await run((data) => { data.transactions[1].Date = '2026-11-02'; });
    try {
      await assert.rejects(t.convert(mapping), (e: unknown) => e instanceof ConversionStopped);
      assert.equal(existsSync(t.outputPath), false);
    } finally { t.cleanup(); }
  }
});
