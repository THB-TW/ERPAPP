// 票 07：交易的新增（含成員）、讀取單筆、修改、刪除與已結月份鎖定。
// 只經由帳本服務下指令、查結果；資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { MonthClose } from '../calc/budgetTypes.ts';
import { LedgerError, openLedger, type Ledger, type NewTransaction } from './index.ts';

function closedMonth(month: string): MonthClose {
  return {
    id: month, month, income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
    migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: 'legacy',
  };
}

/** 2026-09 已結（期初基準月），2026-10 之後開放。 */
async function ledgerWithClosedSeptember(): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), version: 1, months: [closedMonth('2026-09')] }));
  return ledger;
}

async function ids(ledger: Ledger) {
  const categories = await ledger.listCategories();
  const accounts = await ledger.listAccounts();
  return {
    cat: (name: string) => categories.find((c) => c.name === name)!.id,
    acc: (name: string) => accounts.find((a) => a.name === name)!.id,
  };
}

async function rejects(code: string, promise: Promise<unknown>, message?: RegExp) {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof LedgerError, `應丟 LedgerError，實際為 ${String(e)}`);
    assert.equal(e.code, code);
    if (message) assert.match(e.message, message);
    return true;
  });
}

async function lunch(ledger: Ledger, patch: Partial<NewTransaction> = {}) {
  const { cat, acc } = await ids(ledger);
  return ledger.addTransaction({
    date: '2026-10-05', categoryId: cat('飲食'), accountId: acc('現金'), flow: 'expense', amount: 120, note: '午餐', ...patch,
  });
}

test('讀取單筆交易：回傳表單需要的全部欄位，含成員編號', async () => {
  const ledger = await ledgerWithClosedSeptember();
  const { id } = await lunch(ledger);
  const t = await ledger.getTransaction(id);
  assert.equal(t.id, id);
  assert.equal(t.date, '2026-10-05');
  assert.equal(t.categoryName, '飲食');
  assert.equal(t.accountName, '現金');
  assert.equal(t.amount, 120);
  assert.equal(t.note, '午餐');
  assert.equal(t.memberId, null);
  assert.equal(t.memberName, null);
  await rejects('unknown_transaction', ledger.getTransaction(9999), /找不到這筆交易/);
});

test('修改交易：所有欄位都能改，改到別天後兩天的列表與月曆都跟著變', async () => {
  const ledger = await ledgerWithClosedSeptember();
  const { cat, acc } = await ids(ledger);
  const { id } = await lunch(ledger);

  await ledger.updateTransaction(id, {
    date: '2026-10-06', categoryId: cat('薪資'), accountId: acc('銀行'), flow: 'income', amount: 40000, note: '十月薪水',
  });

  assert.deepEqual(await ledger.getDayTransactions('2026-10-05'), []);
  const [t] = await ledger.getDayTransactions('2026-10-06');
  assert.deepEqual(
    [t.id, t.flow, t.categoryName, t.accountName, t.amount, t.note],
    [id, 'income', '薪資', '銀行', 40000, '十月薪水'],
  );
  const calendar = await ledger.getMonthCalendar('2026-10');
  assert.deepEqual(calendar.days, [{ date: '2026-10-06', expenseTotal: 0, incomeTotal: 40000, count: 1 }]);
});

test('修改交易沿用新增的欄位規則：金額、日期、收支別與分類不合、未知分類或帳戶都拒絕且不改動', async () => {
  const ledger = await ledgerWithClosedSeptember();
  const { cat, acc } = await ids(ledger);
  const { id } = await lunch(ledger);
  const base: NewTransaction = { date: '2026-10-05', categoryId: cat('飲食'), accountId: acc('現金'), flow: 'expense', amount: 120 };

  await rejects('invalid_amount', ledger.updateTransaction(id, { ...base, amount: 0 }));
  await rejects('invalid_date', ledger.updateTransaction(id, { ...base, date: '2026-10-32' }));
  await rejects('flow_mismatch', ledger.updateTransaction(id, { ...base, flow: 'income' }));
  await rejects('unknown_category', ledger.updateTransaction(id, { ...base, categoryId: 9999 }));
  await rejects('unknown_account', ledger.updateTransaction(id, { ...base, accountId: 9999 }));
  await rejects('unknown_member', ledger.updateTransaction(id, { ...base, memberId: 9999 }));

  const t = await ledger.getTransaction(id);
  assert.deepEqual([t.amount, t.note], [120, '午餐']);
});

test('修改或刪除不存在的交易會被拒', async () => {
  const ledger = await ledgerWithClosedSeptember();
  const { cat, acc } = await ids(ledger);
  const input: NewTransaction = { date: '2026-10-05', categoryId: cat('飲食'), accountId: acc('現金'), flow: 'expense', amount: 1 };
  await rejects('unknown_transaction', ledger.updateTransaction(9999, input));
  await rejects('unknown_transaction', ledger.deleteTransaction(9999));
});

test('刪除交易：當天列表與月曆不再出現，其他交易不受影響', async () => {
  const ledger = await ledgerWithClosedSeptember();
  const first = await lunch(ledger);
  const second = await lunch(ledger, { amount: 80, note: '晚餐' });

  await ledger.deleteTransaction(first.id);

  const day = await ledger.getDayTransactions('2026-10-05');
  assert.deepEqual(day.map((t) => [t.id, t.amount]), [[second.id, 80]]);
  assert.deepEqual((await ledger.getMonthCalendar('2026-10')).days, [{ date: '2026-10-05', expenseTotal: 80, incomeTotal: 0, count: 1 }]);
  await rejects('unknown_transaction', ledger.getTransaction(first.id));
});

test('已結月份鎖定：已結月份的交易不能改、不能刪，也不能把開放月份的交易改進已結月份', async () => {
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  const { cat, acc } = await ids(ledger);
  // 先在 9 月記一筆，再匯入「9 月已結」的財務文件，模擬月結之後的狀態
  const sept = await ledger.addTransaction({ date: '2026-09-20', categoryId: cat('飲食'), accountId: acc('現金'), flow: 'expense', amount: 300 });
  const oct = await lunch(ledger);
  await ledger.importFinanceDocument(serializeBudgetDocument({ ...emptyBudgetState(), version: 1, months: [closedMonth('2026-09')] }));

  const septInput: NewTransaction = { date: '2026-09-20', categoryId: cat('飲食'), accountId: acc('現金'), flow: 'expense', amount: 1 };
  await rejects('month_closed', ledger.updateTransaction(sept.id, septInput), /已結月份 2026-09/);
  await rejects('month_closed', ledger.updateTransaction(sept.id, { ...septInput, date: '2026-10-01' }), /撤銷月結/);
  await rejects('month_closed', ledger.deleteTransaction(sept.id), /已結月份/);
  await rejects('month_closed', ledger.updateTransaction(oct.id, { ...septInput, date: '2026-09-30' }));

  assert.equal((await ledger.getTransaction(sept.id)).amount, 300);
  assert.equal((await ledger.getTransaction(oct.id)).date, '2026-10-05');
});

test('查詢月份是否已結：畫面用來把交易標成鎖定', async () => {
  const ledger = await ledgerWithClosedSeptember();
  assert.equal(await ledger.isMonthClosed('2026-09'), true);
  assert.equal(await ledger.isMonthClosed('2026-10'), false);
  await rejects('invalid_month', ledger.isMonthClosed('2026-13'));
});

test('成員選填：新增與修改都能指定或清除成員，未知成員被拒', async () => {
  // 目前只有舊帳帶入會建立成員（設定頁新增成員是之後的票），用虛構舊帳建一位成員。
  const ledger = await openLedger(openNodeDatabase(':memory:'));
  await ledger.importLegacyLedger({
    openingDate: '2026-10-01',
    accounts: [{ name: '錢包', kind: 'cash', openingBalance: 0 }],
    categories: [{ name: '吃', flow: 'expense' }],
    members: ['小明'],
    transactions: [],
    document: serializeBudgetDocument({ ...emptyBudgetState(), version: 1, months: [closedMonth('2026-09')] }),
  });
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  const [member] = await ledger.listMembers();
  const input: NewTransaction = { date: '2026-10-05', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 120 };

  const { id } = await ledger.addTransaction({ ...input, memberId: member.id });
  assert.equal((await ledger.getTransaction(id)).memberName, '小明');
  await ledger.updateTransaction(id, { ...input, memberId: null });
  assert.equal((await ledger.getTransaction(id)).memberId, null);
  await ledger.updateTransaction(id, { ...input, memberId: member.id });
  assert.equal((await ledger.getTransaction(id)).memberId, member.id);
  await rejects('unknown_member', ledger.addTransaction({ ...input, memberId: 9999 }));
});
