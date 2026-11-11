// 舊帳整批帶入指令的測試。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetState, MonthClose } from '../calc/budgetTypes.ts';
import { LedgerError, openLedger, type Ledger, type LegacyImportData } from './index.ts';

function closed(p: Partial<MonthClose>): MonthClose {
  return {
    id: '', month: '', income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
    migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '', ...p,
  };
}

function fictionalState(): BudgetState {
  return {
    ...emptyBudgetState(),
    version: 3,
    categories: [{ id: 'r-a', name: '甲儲備', kind: 'reserve' }],
    months: [
      closed({ id: 'm1', month: '2026-08', rawSpare: 1000, balances: { 'r-a': 100 } }),
      closed({ id: 'm2', month: '2026-09', rawSpare: 2000, balances: { 'r-a': 200 }, legacyTotalDifference: 7 }),
    ],
  };
}

function data(over: Partial<LegacyImportData> = {}): LegacyImportData {
  return {
    openingDate: '2026-10-01',
    accounts: [{ name: '錢包', kind: 'cash', openingBalance: 500 }, { name: '戶頭', kind: 'bank', openingBalance: -20 }],
    categories: [{ name: '甲儲備', flow: 'expense' }, { name: '乙收入', flow: 'income' }],
    members: ['小明'],
    transactions: [
      { date: '2026-08-05', category: '甲儲備', account: '錢包', flow: 'expense', amount: 100, member: '小明' },
      { date: '2026-08-05', category: '甲儲備', account: '錢包', flow: 'expense', amount: 100, member: '小明' }, // 合法重複列
      { date: '2026-09-01', category: '乙收入', account: '戶頭', flow: 'income', amount: 900, member: null },
    ],
    document: serializeBudgetDocument(fictionalState()),
    ...over,
  };
}

const fresh = () => openLedger(openNodeDatabase(':memory:'));

async function rejects(code: string, promise: Promise<unknown>) {
  await assert.rejects(promise, (e: unknown) => e instanceof LedgerError && e.code === code);
}

test('空帳本整批帶入：交易（含重複列）、分類、帳戶、成員與財務文件，並回傳摘要', async () => {
  const ledger = await fresh();
  const result = await ledger.importLegacyLedger(data());
  assert.deepEqual(result, {
    version: 3, accounts: 2, categories: 2, members: 1, transactions: 3,
    incomeTotal: 900, expenseTotal: 200, cardStatements: 0, cardStatementTotal: 0, months: 2, monthsWithLegacyDifference: 1,
  });
  // 工廠預設的分類與帳戶被舊帳取代，不混在一起
  assert.deepEqual((await ledger.listCategories()).map((c) => [c.name, c.flow]), [['甲儲備', 'expense'], ['乙收入', 'income']]);
  assert.deepEqual((await ledger.listAccounts()).map((a) => [a.name, a.kind, a.openingBalance]), [
    ['錢包', 'cash', 500], ['戶頭', 'bank', -20],
  ]);
  assert.equal(await ledger.getOpeningDate(), '2026-10-01');
  assert.deepEqual(await ledger.listMembers(), [{ id: 1, name: '小明' }]);
  const day = await ledger.getDayTransactions('2026-08-05');
  assert.deepEqual(day.map((t) => [t.amount, t.memberName]), [[100, '小明'], [100, '小明']]);
  assert.equal((await ledger.getDayTransactions('2026-09-01'))[0].memberName, null);
  // 財務文件原樣：兩個月、歷史差異同額
  assert.deepEqual((await ledger.listBudgetMonths()).map((m) => [m.month, m.total]), [['2026-08', 1100], ['2026-09', 2207]]);
});

test('帶入不受已結月份鎖定限制，之後在已結月份記帳仍被擋', async () => {
  const ledger = await fresh();
  await ledger.importLegacyLedger(data());
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  await rejects('month_closed', ledger.addTransaction({ date: '2026-09-15', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 1 }));
  await ledger.addTransaction({ date: '2026-10-15', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 1 });
});

test('只允許在空帳本上執行：已有交易或財務文件都拒絕，且不改動任何資料', async () => {
  const withTx = await fresh();
  const [cat] = await withTx.listCategories();
  const [acc] = await withTx.listAccounts();
  await withTx.addTransaction({ date: '2026-11-01', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 5 });
  await rejects('ledger_not_empty', withTx.importLegacyLedger(data()));
  assert.equal((await withTx.listAccounts()).length, 4);

  const withDoc = await fresh();
  await withDoc.importFinanceDocument(serializeBudgetDocument(fictionalState()));
  await rejects('ledger_not_empty', withDoc.importLegacyLedger(data()));

  const once = await fresh();
  await once.importLegacyLedger(data());
  await rejects('ledger_not_empty', once.importLegacyLedger(data()));
});

test('任何一列不合規定就整批不帶入（一次交易）', async () => {
  const cases: [string, Partial<LegacyImportData>][] = [
    ['invalid_amount', { transactions: [{ date: '2026-08-05', category: '甲儲備', account: '錢包', flow: 'expense', amount: 0, member: null }] }],
    ['invalid_date', { transactions: [{ date: '2026-02-30', category: '甲儲備', account: '錢包', flow: 'expense', amount: 5, member: null }] }],
    ['invalid_flow', { transactions: [{ date: '2026-08-05', category: '甲儲備', account: '錢包', flow: 'x' as 'expense', amount: 5, member: null }] }],
    ['unknown_category', { transactions: [{ date: '2026-08-05', category: '沒有', account: '錢包', flow: 'expense', amount: 5, member: null }] }],
    ['unknown_account', { transactions: [{ date: '2026-08-05', category: '甲儲備', account: '沒有', flow: 'expense', amount: 5, member: null }] }],
    ['unknown_member', { transactions: [{ date: '2026-08-05', category: '甲儲備', account: '錢包', flow: 'expense', amount: 5, member: '路人' }] }],
    ['flow_mismatch', { transactions: [{ date: '2026-08-05', category: '乙收入', account: '錢包', flow: 'expense', amount: 5, member: null }] }],
    ['invalid_document', { document: '壞掉' }],
    ['invalid_legacy_import', { openingDate: '2026-10-02' }],
    ['invalid_legacy_import', { accounts: [{ name: '錢包', kind: 'cash', openingBalance: 0.5 }] }],
    ['invalid_legacy_import', { accounts: [{ name: '錢包', kind: 'cash', openingBalance: 0 }, { name: '錢包', kind: 'bank', openingBalance: 0 }] }],
    ['invalid_legacy_import', { categories: [{ name: '甲儲備', flow: 'expense' }, { name: '甲儲備', flow: 'income' }] }],
    ['invalid_legacy_import', { accounts: [{ name: '錢包', kind: 'bogus' as 'cash', openingBalance: 0 }] }],
  ];
  for (const [code, over] of cases) {
    const ledger = await fresh();
    await rejects(code, ledger.importLegacyLedger(data(over)));
    // 整批還原：預設資料還在、沒有財務文件
    assert.equal((await ledger.listAccounts()).length, 4, code);
    assert.equal((await ledger.listCategories()).length, 12, code);
    assert.equal((await ledger.listBudgetMonths()).length, 0, code);
    assert.equal((await ledger.getMonthCalendar('2026-08')).days.length, 0, code);
  }
});

test('既有的記帳不受成員欄位影響：不指定成員時為空', async () => {
  const ledger = await fresh();
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  await ledger.addTransaction({ date: '2026-11-11', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 5 });
  assert.equal((await ledger.getDayTransactions('2026-11-11'))[0].memberName, null);
  assert.deepEqual(await ledger.listMembers(), []);
});

test('開帳日是全域設定：新帳本沒有開帳日；預設帳戶開帳餘額為零且使用中', async () => {
  const ledger = await fresh();
  assert.equal(await ledger.getOpeningDate(), null);
  assert.ok((await ledger.listAccounts()).every((a) => a.openingBalance === 0 && a.active));
});

test('依日期區間列出交易，供讀回核對：含重複列、依日期與編號排序', async () => {
  const ledger = await fresh();
  await ledger.importLegacyLedger(data());
  const all = await ledger.listTransactions('0001-01-01', '9999-12-31');
  assert.deepEqual(all.map((t) => [t.date, t.amount, t.categoryName, t.accountName, t.memberName]), [
    ['2026-08-05', 100, '甲儲備', '錢包', '小明'], ['2026-08-05', 100, '甲儲備', '錢包', '小明'], ['2026-09-01', 900, '乙收入', '戶頭', null],
  ]);
  assert.equal((await ledger.listTransactions('2026-09-01', '2026-09-30')).length, 1);
  await rejects('invalid_date', ledger.listTransactions('x', '2026-09-30'));
});

test('帶入與 addTransaction 共用同一套驗證：同樣的錯誤、同樣的訊息', async () => {
  const ledger = await fresh();
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  const bad = [
    { date: '2026-02-30', flow: 'expense' as const, amount: 5, category: cat.name, account: acc.name },
    { date: '2026-08-05', flow: 'expense' as const, amount: 0, category: cat.name, account: acc.name },
    { date: '2026-08-05', flow: 'income' as const, amount: 5, category: cat.name, account: acc.name },
    { date: '2026-08-05', flow: 'expense' as const, amount: 5, category: '沒有', account: acc.name },
    { date: '2026-08-05', flow: 'expense' as const, amount: 5, category: cat.name, account: '沒有' },
  ];
  for (const t of bad) {
    const direct = await ledger.addTransaction({
      date: t.date, flow: t.flow, amount: t.amount,
      categoryId: t.category === cat.name ? cat.id : 9999, accountId: t.account === acc.name ? acc.id : 9999,
    }).then(() => null, (e: LedgerError) => e);
    const other = await fresh();
    const viaImport = await other.importLegacyLedger(data({
      accounts: [{ name: acc.name, kind: 'cash', openingBalance: 0 }],
      categories: [{ name: cat.name, flow: cat.flow }],
      transactions: [{ ...t, member: null }],
    })).then(() => null, (e: LedgerError) => e);
    assert.ok(direct && viaImport);
    assert.equal(viaImport.code, direct.code);
    assert.ok(viaImport.message.includes(direct.message), `${viaImport.message} / ${direct.message}`);
  }
});
