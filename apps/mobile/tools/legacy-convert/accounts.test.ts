// 帳戶種類猜測與開帳餘額回推的測試。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RawCheck } from './legacyData.ts';
import { deriveOpeningBalances, guessKind } from './accounts.ts';

function check(over: Record<string, unknown> = {}, input: Record<string, unknown> = {}, result: Record<string, unknown> = {}): RawCheck {
  return {
    Id: 'c1', Month: '2026-10', Time: '2026-11-06T10:00:00+08:00',
    Input: { Year: 2026, Month: 10, Cash: 1000, Ipass: 50, Bank: 20000, UnbilledCredit: 300, NetDeployed: 0, Adjust: 0,
      AutoRollback: true, AsOfDate: '2026-11-06T00:00:00', ...input },
    Result: { Rollbacks: [{ Account: '現金', NextMonthExpense: 180, NextMonthIncome: 30, Net: 150 },
      { Account: '銀行', NextMonthExpense: 0, NextMonthIncome: 5000, Net: -5000 }], ...result },
    ...over,
  };
}

test('帳戶種類：只認得完全相同的常見名稱，其餘為 null（交給人決定）', () => {
  assert.equal(guessKind('現金'), 'cash');
  assert.equal(guessKind('銀行'), 'bank');
  assert.equal(guessKind('信用卡'), 'credit_card');
  assert.equal(guessKind('一卡通'), 'e_wallet');
  assert.equal(guessKind('電子支付'), 'e_wallet');
  assert.equal(guessKind('我的神秘帳戶'), null);
});

test('現金與銀行：最近一筆核對的餘額加上倒回調整，得到搬遷截止月月底餘額', () => {
  const r = deriveOpeningBalances([check()], '2026-10', ['現金', '銀行', '一卡通', '信用卡']);
  assert.deepEqual([...r.balances], [['現金', { amount: 1150, source: 'c1' }], ['銀行', { amount: 15000, source: 'c1' }]]);
});

test('多筆核對只用時間最近的一筆', () => {
  const older = check({ Id: 'old', Time: '2026-10-05T10:00:00+08:00' }, { Cash: 999999 });
  const newer = check({ Id: 'new' });
  const r = deriveOpeningBalances([newer, older], '2026-10', ['現金']);
  assert.equal(r.balances.get('現金')!.source, 'new');
});

test('最近一筆不是搬遷截止月的核對，或沒有核對紀錄：不回推（改由人輸入）', () => {
  const other = deriveOpeningBalances([check({ Month: '2026-09' })], '2026-10', ['現金']);
  assert.equal(other.balances.size, 0);
  assert.match(other.notes.join(''), /2026-09/);
  assert.equal(deriveOpeningBalances([], '2026-10', ['現金']).balances.size, 0);
  assert.equal(deriveOpeningBalances([check()], null, ['現金']).balances.size, 0);
});

test('沒有開啟自動倒回、餘額日期又晚於月底：不回推；餘額日期就是月底則可直接使用', () => {
  const late = deriveOpeningBalances([check({}, { AutoRollback: false })], '2026-10', ['現金']);
  assert.equal(late.balances.size, 0);
  const monthEnd = deriveOpeningBalances([check({}, { AutoRollback: false, AsOfDate: '2026-10-31T00:00:00' })], '2026-10', ['現金']);
  assert.equal(monthEnd.balances.get('現金')!.amount, 1000);
});

test('格式不符的核對紀錄不回推，也不丟例外', () => {
  const broken = deriveOpeningBalances([{ Id: 'x', Month: '2026-10', Time: '2026-11-06T10:00:00+08:00', Input: null }], '2026-10', ['現金']);
  assert.equal(broken.balances.size, 0);
  const nonInteger = deriveOpeningBalances([check({}, { Cash: 1.5 })], '2026-10', ['現金']);
  assert.equal(nonInteger.balances.size, 0);
});
