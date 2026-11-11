// 票 09：明細（月份分類彙總與占比、某分類當月交易）。只經由帳本服務；資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { LedgerError, openLedger, type Flow, type Ledger } from './index.ts';

async function newLedger() {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  const categories = await ledger.listCategories();
  const accounts = await ledger.listAccounts();
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
  const add = (date: string, flow: Flow, category: string, amount: number, note = '', account = '現金') =>
    ledger.addTransaction({ date, flow, categoryId: cat(category), accountId: acc(account), amount, note });
  return { ledger, cat, add };
}

async function rejects(code: string, promise: Promise<unknown>) {
  await assert.rejects(promise, (e: unknown) => e instanceof LedgerError && e.code === code);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('月份支出彙總：各分類金額、筆數與占比，依金額由大到小；只算當月、只算支出', async () => {
  const { ledger, cat, add } = await newLedger();
  await add('2026-10-01', 'expense', '飲食', 300);
  await add('2026-10-15', 'expense', '飲食', 200);
  await add('2026-10-31', 'expense', '交通', 300);
  await add('2026-10-20', 'expense', '娛樂', 200);
  await add('2026-10-05', 'income', '薪資', 40000); // 收入不算進支出
  await add('2026-09-30', 'expense', '飲食', 999); // 上個月
  await add('2026-11-01', 'expense', '交通', 888); // 下個月

  const b = await ledger.getMonthBreakdown('2026-10', 'expense');
  assert.equal(b.month, '2026-10');
  assert.equal(b.flow, 'expense');
  assert.equal(b.total, 1000);
  assert.equal(b.otherFlowTotal, 40000);
  assert.deepEqual(b.categories, [
    { categoryId: cat('飲食'), categoryName: '飲食', amount: 500, count: 2, permille: 500 },
    { categoryId: cat('交通'), categoryName: '交通', amount: 300, count: 1, permille: 300 },
    { categoryId: cat('娛樂'), categoryName: '娛樂', amount: 200, count: 1, permille: 200 },
  ]);
});

test('月份收入彙總：切到收入時只算收入，另一邊的合計是支出', async () => {
  const { ledger, add } = await newLedger();
  await add('2026-10-05', 'income', '薪資', 40000);
  await add('2026-10-20', 'income', '其他收入', 10000);
  await add('2026-10-21', 'expense', '飲食', 123);

  const b = await ledger.getMonthBreakdown('2026-10', 'income');
  assert.equal(b.total, 50000);
  assert.equal(b.otherFlowTotal, 123);
  assert.deepEqual(b.categories.map((c) => [c.categoryName, c.amount, c.permille]), [['薪資', 40000, 800], ['其他收入', 10000, 200]]);
});

test('占比合計一定是 100%：除不盡時用最大餘數法處理進位', async () => {
  const { ledger, add } = await newLedger();
  await add('2026-10-01', 'expense', '飲食', 100);
  await add('2026-10-01', 'expense', '交通', 100);
  await add('2026-10-01', 'expense', '娛樂', 100);
  const thirds = await ledger.getMonthBreakdown('2026-10', 'expense');
  assert.deepEqual(thirds.categories.map((c) => c.permille), [334, 333, 333]);

  await add('2026-10-02', 'expense', '服飾', 7);
  await add('2026-10-02', 'expense', '學習', 11);
  await add('2026-10-02', 'expense', '其他', 1);
  const b = await ledger.getMonthBreakdown('2026-10', 'expense');
  assert.equal(sum(b.categories.map((c) => c.permille)), 1000);
  assert.equal(sum(b.categories.map((c) => c.amount)), b.total);
});

test('金額相同時依分類的排列順序，結果固定', async () => {
  const { ledger, add } = await newLedger();
  await add('2026-10-01', 'expense', '娛樂', 100);
  await add('2026-10-01', 'expense', '飲食', 100);
  await add('2026-10-01', 'expense', '交通', 100);
  const b = await ledger.getMonthBreakdown('2026-10', 'expense');
  assert.deepEqual(b.categories.map((c) => c.categoryName), ['飲食', '交通', '娛樂']);
});

test('沒有帳的月份：合計為 0、分類清單為空', async () => {
  const { ledger } = await newLedger();
  assert.deepEqual(await ledger.getMonthBreakdown('2026-10', 'expense'), {
    month: '2026-10', flow: 'expense', total: 0, otherFlowTotal: 0, categories: [],
  });
});

test('月份或收支別不合法會被拒', async () => {
  const { ledger } = await newLedger();
  await rejects('invalid_month', ledger.getMonthBreakdown('2026-13', 'expense'));
  await rejects('invalid_flow', ledger.getMonthBreakdown('2026-10', 'transfer' as Flow));
  await rejects('invalid_month', ledger.getCategoryMonthTransactions('2026-1', 1));
});

test('點分類看當月交易：只含該分類、該月，日期新的在前', async () => {
  const { ledger, cat, add } = await newLedger();
  const a = await add('2026-10-03', 'expense', '飲食', 120, '午餐');
  const b = await add('2026-10-20', 'expense', '飲食', 80, '晚餐', '信用卡');
  const c = await add('2026-10-20', 'expense', '飲食', 60, '宵夜');
  await add('2026-10-20', 'expense', '交通', 50);
  await add('2026-11-01', 'expense', '飲食', 999);

  const list = await ledger.getCategoryMonthTransactions('2026-10', cat('飲食'));
  assert.deepEqual(list.map((t) => [t.id, t.date, t.amount, t.note, t.accountName]), [
    [b.id, '2026-10-20', 80, '晚餐', '信用卡'],
    [c.id, '2026-10-20', 60, '宵夜', '現金'],
    [a.id, '2026-10-03', 120, '午餐', '現金'],
  ]);
  assert.deepEqual(await ledger.getCategoryMonthTransactions('2026-10', 9999), []);
});

test('分類交易的合計等於彙總裡該分類的金額與筆數', async () => {
  const { ledger, add } = await newLedger();
  await add('2026-10-03', 'expense', '飲食', 120);
  await add('2026-10-09', 'expense', '飲食', 35);
  await add('2026-10-09', 'expense', '交通', 500);
  const b = await ledger.getMonthBreakdown('2026-10', 'expense');
  for (const c of b.categories) {
    const list = await ledger.getCategoryMonthTransactions('2026-10', c.categoryId);
    assert.equal(sum(list.map((t) => t.amount)), c.amount);
    assert.equal(list.length, c.count);
  }
});
