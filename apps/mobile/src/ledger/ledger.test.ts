import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { LedgerError, openLedger } from './index.ts';

async function newLedger() {
  return openLedger(openNodeDatabase(':memory:'));
}

test('新增一筆支出後，當日列表查得到', async () => {
  const ledger = await newLedger();
  const [food] = (await ledger.listCategories()).filter((c) => c.name === '飲食');
  const [cash] = (await ledger.listAccounts()).filter((a) => a.name === '現金');

  await ledger.addTransaction({
    date: '2026-11-11',
    categoryId: food.id,
    accountId: cash.id,
    flow: 'expense',
    amount: 120,
    note: '午餐',
  });

  const day = await ledger.getDayTransactions('2026-11-11');
  assert.equal(day.length, 1);
  assert.equal(day[0].amount, 120);
  assert.equal(day[0].flow, 'expense');
  assert.equal(day[0].categoryName, '飲食');
  assert.equal(day[0].accountName, '現金');
  assert.equal(day[0].note, '午餐');
});

async function ids(ledger: Awaited<ReturnType<typeof newLedger>>) {
  const categories = await ledger.listCategories();
  const accounts = await ledger.listAccounts();
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
  return { cat, acc };
}

test('月曆每天分開合計收入與支出並計筆數，只含當月有帳的日子', async () => {
  const ledger = await newLedger();
  const { cat, acc } = await ids(ledger);
  const add = (date: string, flow: 'expense' | 'income', category: string, amount: number) =>
    ledger.addTransaction({ date, flow, categoryId: cat(category), accountId: acc('銀行'), amount });

  await add('2026-11-03', 'expense', '飲食', 100);
  await add('2026-11-03', 'expense', '交通', 50);
  await add('2026-11-03', 'income', '薪資', 40000);
  await add('2026-11-30', 'expense', '娛樂', 300);
  await add('2026-10-31', 'expense', '飲食', 999); // 上個月，不應出現
  await add('2026-12-01', 'income', '其他收入', 888); // 下個月，不應出現

  const calendar = await ledger.getMonthCalendar('2026-11');
  assert.equal(calendar.month, '2026-11');
  assert.deepEqual(calendar.days, [
    { date: '2026-11-03', expenseTotal: 150, incomeTotal: 40000, count: 3 },
    { date: '2026-11-30', expenseTotal: 300, incomeTotal: 0, count: 1 },
  ]);
});

test('沒有任何帳的月份，月曆是空的', async () => {
  const ledger = await newLedger();
  assert.deepEqual((await ledger.getMonthCalendar('2026-02')).days, []);
});

test('無效輸入被拒，給繁體中文訊息，且不留下任何一筆', async () => {
  const ledger = await newLedger();
  const { cat, acc } = await ids(ledger);
  const valid = {
    date: '2026-11-11',
    categoryId: cat('飲食'),
    accountId: acc('現金'),
    flow: 'expense' as const,
    amount: 100,
  };
  const cases: [string, Partial<Record<string, unknown>>, string][] = [
    ['分類不存在', { categoryId: 9999 }, 'unknown_category'],
    ['帳戶不存在', { accountId: 9999 }, 'unknown_account'],
    ['金額為 0', { amount: 0 }, 'invalid_amount'],
    ['金額為負數', { amount: -50 }, 'invalid_amount'],
    ['金額有小數', { amount: 10.5 }, 'invalid_amount'],
    ['金額是字串', { amount: '100' }, 'invalid_amount'],
    ['金額是 NaN', { amount: Number.NaN }, 'invalid_amount'],
    ['金額超過安全整數', { amount: Number.MAX_SAFE_INTEGER + 1 }, 'invalid_amount'],
    ['日期格式錯（斜線）', { date: '2026/11/11' }, 'invalid_date'],
    ['日期格式錯（沒補零）', { date: '2026-1-1' }, 'invalid_date'],
    ['日期不存在', { date: '2026-02-30' }, 'invalid_date'],
    ['收支別錯誤', { flow: 'transfer' }, 'invalid_flow'],
  ];
  for (const [label, override, code] of cases) {
    await assert.rejects(
      () => ledger.addTransaction({ ...valid, ...override } as never),
      (error: unknown) => {
        assert.ok(error instanceof LedgerError, label);
        assert.equal(error.code, code, label);
        assert.match(error.message, /[\u4e00-\u9fff]/, `${label}：訊息應為中文`);
        return true;
      },
      label,
    );
  }
  assert.deepEqual(await ledger.getDayTransactions('2026-11-11'), []);
});

test('查詢的日期或月份格式錯誤也被拒', async () => {
  const ledger = await newLedger();
  await assert.rejects(() => ledger.getDayTransactions('2026-13-01'), { code: 'invalid_date' });
  await assert.rejects(() => ledger.getMonthCalendar('2026-13'), { code: 'invalid_month' });
  await assert.rejects(() => ledger.getMonthCalendar('2026-1'), { code: 'invalid_month' });
});

test('關閉再重開同一個資料庫檔，資料仍在，預設分類與帳戶不重複', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-test-'));
  const file = join(dir, 'ledger.db');
  try {
    const first = await openLedger(openNodeDatabase(file));
    const { cat, acc } = await ids(first);
    await first.addTransaction({
      date: '2026-11-11', flow: 'expense', categoryId: cat('飲食'), accountId: acc('現金'), amount: 85, note: '早餐',
    });
    const categoryCount = (await first.listCategories()).length;
    const accountCount = (await first.listAccounts()).length;
    await first.close();

    const second = await openLedger(openNodeDatabase(file));
    const day = await second.getDayTransactions('2026-11-11');
    assert.equal(day.length, 1);
    assert.equal(day[0].amount, 85);
    assert.equal(day[0].note, '早餐');
    assert.equal((await second.listCategories()).length, categoryCount);
    assert.equal((await second.listAccounts()).length, accountCount);
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('新資料庫內建預設的四種帳戶與通用分類（含收入類）', async () => {
  const ledger = await newLedger();
  assert.deepEqual(
    (await ledger.listAccounts()).map((a) => [a.name, a.kind]),
    [['現金', 'cash'], ['銀行', 'bank'], ['信用卡', 'credit_card'], ['電子支付', 'e_wallet']],
  );
  const categories = await ledger.listCategories();
  assert.deepEqual(
    categories.filter((c) => c.flow === 'income').map((c) => c.name),
    ['薪資', '其他收入'],
  );
  assert.ok(categories.some((c) => c.flow === 'expense' && c.name === '飲食'));
});

test('比這個 App 新的資料庫版本被拒絕，不會被默默改動', async () => {
  const db = openNodeDatabase(':memory:');
  await db.exec('PRAGMA user_version = 99');
  await assert.rejects(() => openLedger(db), { name: 'DatabaseTooNewError' });
});

test('同時發出的多筆新增都成功且互不干擾', async () => {
  const ledger = await newLedger();
  const { cat, acc } = await ids(ledger);
  await Promise.all(
    [10, 20, 30, 40].map((amount) =>
      ledger.addTransaction({
        date: '2026-11-05', flow: 'expense', categoryId: cat('交通'), accountId: acc('電子支付'), amount,
      }),
    ),
  );
  const [day] = (await ledger.getMonthCalendar('2026-11')).days;
  assert.equal(day.count, 4);
  assert.equal(day.expenseTotal, 100);
});
