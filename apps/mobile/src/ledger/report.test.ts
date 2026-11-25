// 票 09：明細（月份分類彙總與占比、某分類當月交易）。只經由帳本服務；資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { LedgerError, openLedger, type Flow, type Ledger } from './index.ts';

async function newLedger() {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  await ledger.addEntryCategory({ flow: 'income', name: '其他收入' }); // 新帳本收入只有薪資；測試需要第二個收入分類
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
    { categoryId: cat('飲食'), categoryName: '飲食', categoryIcon: '🍜', amount: 500, count: 2, permille: 500, budgetCategory: null },
    { categoryId: cat('交通'), categoryName: '交通', categoryIcon: '🚇', amount: 300, count: 1, permille: 300, budgetCategory: null },
    { categoryId: cat('娛樂'), categoryName: '娛樂', categoryIcon: '🎬', amount: 200, count: 1, permille: 200, budgetCategory: null },
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

test('明細使用所選月份的預算歸屬，未歸屬保持獨立分類，收入不套支出歸屬', async () => {
  const { ledger, add } = await newLedger();
  const { emptyBudgetState, serializeBudgetDocument } = await import('../calc/budgetDocument.ts');
  const base = { id: 'oct', month: '2026-10', limits: [{ categoryId: 'food', amount: 3000 }, { categoryId: 'other', amount: 500 }], mapping: { 飲食: 'food', 交通: 'other' }, tuition: 0, reason: '虛構', actor: 'test', time: '2026-10-01' };
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), categories: [
    { id: 'food', name: '餐食', kind: 'reserve' }, { id: 'other', name: '其他', kind: 'reserve' },
  ], revisions: [base, { ...base, id: 'nov', month: '2026-11', mapping: { 飲食: 'other', 交通: 'food' } }] }));
  for (const month of ['2026-10', '2026-11']) {
    await add(`${month}-01`, 'expense', '飲食', 500);
    await add(`${month}-01`, 'expense', '交通', 200);
    await add(`${month}-01`, 'expense', '娛樂', 100);
  }
  const october = await ledger.getMonthBreakdown('2026-10', 'expense');
  assert.deepEqual(october.categories.map(c => [c.categoryName, c.budgetCategory]), [
    ['飲食', { id: 'food', name: '餐食' }], ['交通', { id: 'other', name: '其他' }], ['娛樂', null],
  ]);
  const november = await ledger.getMonthBreakdown('2026-11', 'expense');
  assert.deepEqual(november.categories[0].budgetCategory, { id: 'other', name: '其他' });
  await add('2026-11-01', 'income', '薪資', 2000);
  assert.equal((await ledger.getMonthBreakdown('2026-11', 'income')).categories[0].budgetCategory, null);
  await ledger.close();
});

test('明細已結月份使用凍結歸屬，後續版本不能改變舊月顏色分類', async () => {
  const { ledger, add } = await newLedger();
  await add('2026-10-01', 'expense', '飲食', 500);
  const { emptyBudgetState, serializeBudgetDocument } = await import('../calc/budgetDocument.ts');
  const revision = { id: 'oct', month: '2026-10', limits: [{ categoryId: 'food', amount: 3000 }], mapping: { 飲食: 'food' }, tuition: 0, reason: '虛構', actor: 'test', time: '2026-10-01' };
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), categories: [
    { id: 'food', name: '餐食', kind: 'reserve' }, { id: 'other', name: '其他', kind: 'reserve' },
  ], revisions: [{ ...revision, id: 'later', limits: [{ categoryId: 'other', amount: 0 }], mapping: { 飲食: 'other' } }],
    months: [{ id: 'closed', month: '2026-10', income: 0, surplus: 0, rawSpare: 0, tuition: 0,
      balances: { food: 2500 }, changes: { food: 2500 }, expenses: { food: 500 }, revision,
      migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '' }] }));
  assert.deepEqual((await ledger.getMonthBreakdown('2026-10', 'expense')).categories[0].budgetCategory, { id: 'food', name: '餐食' });
  await ledger.close();
});

test('依成員與帳戶彙總：合計與分類視角相同、轉帳不算、停用的照樣列、可展開交易', async () => {
  const { ledger, cat, add } = await newLedger();
  const mom = await ledger.addMember({ name: '媽媽', icon: '👩' });
  const accounts = await ledger.listAccounts();
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
  await ledger.addTransaction({ date: '2026-10-02', flow: 'expense', categoryId: cat('飲食'), accountId: acc('銀行'), amount: 600, memberId: mom.id });
  await add('2026-10-03', 'expense', '交通', 300);
  await add('2026-10-04', 'expense', '飲食', 100, '', '信用卡');
  await add('2026-10-05', 'income', '薪資', 40000, '', '銀行');
  await ledger.addTransfer({ date: '2026-10-06', fromAccountId: acc('銀行'), toAccountId: acc('現金'), amount: 5000, note: '' });
  await ledger.setMemberActive(mom.id, false);
  await ledger.updateAccount(acc('信用卡'), { active: false });

  const byCategory = await ledger.getMonthBreakdown('2026-10', 'expense');
  const byMember = await ledger.getMonthGroupBreakdown('2026-10', 'expense', 'member');
  const byAccount = await ledger.getMonthGroupBreakdown('2026-10', 'expense', 'account');
  assert.equal(byMember.total, byCategory.total);
  assert.equal(byAccount.total, byCategory.total);
  assert.equal(byAccount.otherFlowTotal, 40000);
  assert.deepEqual(byMember.groups.map((g) => [g.name, g.icon, g.active, g.amount, g.count, g.permille]), [
    ['媽媽', '👩', false, 600, 1, 600], ['自己', '🙂', true, 400, 2, 400],
  ]);
  assert.deepEqual(byAccount.groups.map((g) => [g.name, g.icon, g.active, g.amount]), [
    ['銀行', '🏦', true, 600], ['現金', '💵', true, 300], ['信用卡', '💳', false, 100],
  ]);
  assert.equal(sum(byAccount.groups.map((g) => g.permille)), 1000);
  const income = await ledger.getMonthGroupBreakdown('2026-10', 'income', 'account');
  assert.deepEqual(income.groups.map((g) => [g.name, g.amount]), [['銀行', 40000]]); // 轉帳 5000 不算
  const rows = await ledger.getGroupMonthTransactions('2026-10', 'expense', 'account', acc('銀行'));
  assert.deepEqual(rows.map((r) => [r.date, r.amount]), [['2026-10-02', 600]]);
  await rejects('invalid_grouping', ledger.getMonthGroupBreakdown('2026-10', 'expense', 'note' as 'member'));
});
