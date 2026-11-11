// 票 08：合成資料、真 SQLite，業務規則只經帳本服務驗證。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { LedgerError, openLedger, type AccountKind, type Ledger, type LegacyImportData } from './index.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
const fakeImport = (): LegacyImportData => ({
  openingDate: '2026-11-01',
  accounts: [
    { name: '現金', kind: 'cash', openingBalance: 1000 },
    { name: '銀行', kind: 'bank', openingBalance: 10000 },
    { name: '信用卡', kind: 'credit_card', openingBalance: -2000 },
    { name: '電子支付', kind: 'e_wallet', openingBalance: 100 },
  ],
  categories: [{ name: '飲食', flow: 'expense' }, { name: '薪資', flow: 'income' }], members: [],
  transactions: [{ date: '2026-10-31', category: '飲食', account: '現金', flow: 'expense', amount: 777, member: null }],
  document: serializeBudgetDocument(emptyBudgetState()),
});
async function fresh(imported = true) {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  if (imported) await ledger.importLegacyLedger(fakeImport());
  return ledger;
}
async function rejects(code: string, work: Promise<unknown>) {
  await assert.rejects(work, (e: unknown) => e instanceof LedgerError && e.code === code);
}
async function balances(ledger: Ledger, date?: string) {
  return (await ledger.listAccountBalances(date)).map((a) => a.balance);
}
async function closeNovember(ledger: Ledger) {
  await ledger.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(), months: [{
      id: 'base', month: '2026-10', income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
      migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: 'legacy',
    }],
  }), { replace: true });
  await ledger.runBudgetCommand({ action: 'add', month: '2026-11', name: '生活', kind: 'actual', amount: 0, version: 0, operationId: randomUUID(), reason: '合成分類' });
  await ledger.runBudgetCommand({ action: 'close', month: '2026-11', amount: 0, version: 1, operationId: randomUUID(), reason: '合成月結' });
}
const transfer = { date: '2026-11-05', fromAccountId: 2, toAccountId: 3, amount: 500, note: '繳卡費' };

test('新增四種帳戶、改名、修改開帳餘額與停用再啟用', async (t) => {
  const ledger = await fresh(false); t.after(() => ledger.close());
  for (const [i, kind] of (['cash', 'bank', 'credit_card', 'e_wallet'] as AccountKind[]).entries()) {
    const { id } = await ledger.addAccount({ name: `自訂${i}`, kind, openingBalance: i === 2 ? -600 : 200 });
    await ledger.updateAccount(id, { name: `更名${i}`, active: false, openingBalance: -50 });
    const found = (await ledger.listAccountBalances()).find((a) => a.id === id)!;
    assert.deepEqual([found.name, found.kind, found.active, found.balance], [`更名${i}`, kind, false, -50]);
    await ledger.updateAccount(id, { active: true });
    assert.equal((await ledger.listAccounts()).find((a) => a.id === id)!.active, true);
  }
});

test('帳戶欄位錯誤與重名拒絕，原資料保留', async (t) => {
  const ledger = await fresh(false); t.after(() => ledger.close());
  const before = await ledger.listAccounts();
  await rejects('invalid_account', ledger.addAccount({ name: ' ', kind: 'cash' }));
  await rejects('invalid_account', ledger.addAccount({ name: '錯誤', kind: 'other' as AccountKind }));
  await rejects('account_name_conflict', ledger.addAccount({ name: ' 現金 ', kind: 'cash' }));
  for (const openingBalance of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await rejects('invalid_amount', ledger.updateAccount(before[0].id, { openingBalance }));
  }
  await rejects('unknown_account', ledger.updateAccount(9999, { name: '不存在' }));
  await rejects('account_name_conflict', ledger.updateAccount(before[0].id, { name: before[1].name }));
  assert.deepEqual(await ledger.listAccounts(), before);
});

test('開帳日含當日收支、排除開帳前交易，截止日排除未來收支', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  assert.deepEqual(await balances(ledger), [1000, 10000, -2000, 100]);
  await ledger.addTransaction({ date: '2026-11-01', categoryId: 1, accountId: 1, flow: 'expense', amount: 100 });
  await ledger.addTransaction({ date: '2026-11-11', categoryId: 2, accountId: 2, flow: 'income', amount: 2000 });
  await ledger.addTransaction({ date: '2026-11-12', categoryId: 1, accountId: 1, flow: 'expense', amount: 50 });
  assert.deepEqual(await balances(ledger), [900, 12000, -2000, 100]);
  assert.deepEqual(await balances(ledger, '2026-11-01'), [900, 10000, -2000, 100]);
  assert.deepEqual(await balances(ledger, '2026-11-12'), [850, 12000, -2000, 100]);
  await rejects('invalid_date', ledger.listAccountBalances('2026-02-30'));
  await rejects('invalid_date', ledger.listAccountBalances('2026-10-31'));
});

test('銀行繳卡費、領現與儲值只改兩端餘額，信用卡負數為未繳', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  await ledger.addTransaction({ date: '2026-11-01', categoryId: 1, accountId: 3, flow: 'expense', amount: 300 });
  const initial = await balances(ledger);
  const { id } = await ledger.addTransfer(transfer);
  await ledger.addTransfer({ ...transfer, toAccountId: 1, amount: 1000 });
  await ledger.addTransfer({ ...transfer, fromAccountId: 1, toAccountId: 4, amount: 200 });
  assert.deepEqual(await balances(ledger), [1800, 8500, -1800, 300]);
  assert.equal((await balances(ledger)).reduce((a, b) => a + b), initial.reduce((a, b) => a + b));
  const detail = await ledger.getTransfer(id);
  assert.deepEqual([detail.fromAccountName, detail.toAccountName, detail.amount, detail.note], ['銀行', '信用卡', 500, '繳卡費']);
});

test('開帳日前轉帳不計，開帳日當天計入；查詢依日期排序', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  await ledger.addTransfer({ ...transfer, date: '2026-11-02', amount: 20 });
  await ledger.addTransfer({ ...transfer, date: '2026-10-31', amount: 999 });
  await ledger.addTransfer({ ...transfer, date: '2026-11-01', amount: 10 });
  assert.deepEqual(await balances(ledger, '2026-11-01'), [1000, 9990, -1990, 100]);
  assert.deepEqual((await ledger.listTransfers('2026-10-01', '2026-11-30')).map((x) => x.date), ['2026-10-31', '2026-11-01', '2026-11-02']);
});

test('轉帳不進交易、月曆收支、預算歸屬與月結，財務文件原樣保留', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  const doc = await ledger.exportFinanceDocument();
  await ledger.addTransfer(transfer);
  assert.equal(await ledger.getMonthIncome('2026-11'), 0);
  assert.deepEqual((await ledger.getMonthCalendar('2026-11')).days, []);
  assert.deepEqual(await ledger.listTransactions('2026-11-01', '2026-11-30'), []);
  assert.deepEqual(await ledger.getUnmappedExpenseCategories('2026-11'), []);
  assert.equal(await ledger.exportFinanceDocument(), doc);
  await closeNovember(ledger);
  const month = await ledger.getBudgetMonth('2026-11');
  assert.deepEqual([month.income, month.surplus, month.spare, month.tuition, month.reserve, month.total], [0, 0, 0, 0, 0, 0]);
});

test('轉帳欄位錯誤全部拒絕且不留下單邊異動', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await rejects('invalid_amount', ledger.addTransfer({ ...transfer, amount }));
  }
  await rejects('invalid_date', ledger.addTransfer({ ...transfer, date: '2026-02-30' }));
  await rejects('invalid_transfer', ledger.addTransfer({ ...transfer, toAccountId: 2 }));
  await rejects('unknown_account', ledger.addTransfer({ ...transfer, toAccountId: 9999 }));
  assert.deepEqual(await ledger.listTransfers('2026-01-01', '2026-12-31'), []);
  assert.deepEqual(await balances(ledger), [1000, 10000, -2000, 100]);
});

test('停用帳戶保留歷史與餘額，不能新增收支或轉帳；歷史可保留原帳戶修改', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  const input = { date: '2026-11-01', categoryId: 1, accountId: 1, flow: 'expense' as const, amount: 10 };
  const { id } = await ledger.addTransaction(input);
  await ledger.updateAccount(1, { active: false });
  await rejects('account_inactive', ledger.addTransaction(input));
  await rejects('account_inactive', ledger.addTransfer({ ...transfer, toAccountId: 1 }));
  await rejects('account_inactive', ledger.addTransfer({ ...transfer, fromAccountId: 1 }));
  await ledger.updateTransaction(id, { ...input, note: '補註' });
  assert.equal((await ledger.getTransaction(id)).note, '補註');
  assert.equal((await balances(ledger))[0], 990);
  const other = await ledger.addTransaction({ ...input, accountId: 2 });
  await rejects('account_inactive', ledger.updateTransaction(other.id, input));
});

test('修改與刪除轉帳即時反映餘額，失敗修改保持原筆', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  const { id } = await ledger.addTransfer(transfer);
  await ledger.updateAccount(3, { active: false });
  await ledger.updateTransfer(id, { ...transfer, amount: 600, note: '補註' });
  assert.deepEqual(await balances(ledger), [1000, 9400, -1400, 100]);
  await rejects('invalid_transfer', ledger.updateTransfer(id, { ...transfer, toAccountId: 2 }));
  assert.equal((await ledger.getTransfer(id)).amount, 600);
  await ledger.updateTransfer(id, { ...transfer, toAccountId: 1, amount: 200 });
  assert.deepEqual(await balances(ledger), [1200, 9800, -2000, 100]);
  await ledger.deleteTransfer(id);
  assert.deepEqual(await balances(ledger), [1000, 10000, -2000, 100]);
  await rejects('unknown_transfer', ledger.getTransfer(id));
  await rejects('unknown_transfer', ledger.deleteTransfer(id));
});

test('已結月份轉帳新增、修改移入移出與刪除都鎖定', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  const old = await ledger.addTransfer(transfer);
  const next = await ledger.addTransfer({ ...transfer, date: '2026-12-01' });
  await closeNovember(ledger);
  await rejects('month_closed', ledger.addTransfer(transfer));
  await rejects('month_closed', ledger.updateTransfer(old.id, { ...transfer, date: '2026-12-01' }));
  await rejects('month_closed', ledger.updateTransfer(next.id, transfer));
  await rejects('month_closed', ledger.deleteTransfer(old.id));
  assert.equal((await ledger.listTransfers('2026-11-01', '2026-12-31')).length, 2);
});

test('只有轉帳或停用預設帳戶也不是可覆寫的空帳本', async (t) => {
  const ledger = await fresh(false); t.after(() => ledger.close());
  await ledger.addTransfer(transfer);
  await rejects('ledger_not_empty', ledger.importLegacyLedger(fakeImport()));
  const second = await fresh(false); t.after(() => second.close());
  const [account] = await second.listAccounts();
  await second.updateAccount(account.id, { active: false });
  await rejects('ledger_not_empty', second.importLegacyLedger(fakeImport()));
});

test('餘額超過安全整數時明確拒絕，避免回傳四捨五入金額', async (t) => {
  const ledger = await fresh(false); t.after(() => ledger.close());
  const { id } = await ledger.addAccount({ name: '大額測試', kind: 'bank', openingBalance: Number.MAX_SAFE_INTEGER });
  const income = (await ledger.listCategories()).find((c) => c.flow === 'income')!;
  await ledger.addTransaction({ date: '2026-11-01', categoryId: income.id, accountId: id, flow: 'income', amount: 1 });
  await rejects('invalid_amount', ledger.listAccountBalances());
});

test('帳戶設定與轉帳在關閉重開 SQLite 檔後完整保留', async () => {
  const dir = mkdtempSync(join(process.cwd(), '.scratch-ticket08-'));
  let ledger: Ledger | undefined;
  try {
    const path = join(dir, 'synthetic.sqlite');
    ledger = await openLedger(openNodeDatabase(path), { now: () => NOW });
    await ledger.importLegacyLedger(fakeImport());
    const { id } = await ledger.addTransfer(transfer);
    await ledger.updateAccount(2, { name: '備用銀行', openingBalance: 11000, active: false });
    const before = await ledger.listAccountBalances();
    const detail = await ledger.getTransfer(id);
    await ledger.close();
    ledger = undefined;
    ledger = await openLedger(openNodeDatabase(path), { now: () => NOW });
    assert.deepEqual(await ledger.listAccountBalances(), before);
    assert.deepEqual(await ledger.getTransfer(id), detail);
    assert.equal(await ledger.getOpeningDate(), '2026-11-01');
  } finally {
    await ledger?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('非零舊月結與歷史差異在轉帳及帳戶設定後完全相同', async (t) => {
  const ledger = await fresh(); t.after(() => ledger.close());
  await ledger.importFinanceDocument(serializeBudgetDocument({
    ...emptyBudgetState(), version: 3,
    categories: [{ id: 'r', name: '假儲備', kind: 'reserve' }],
    months: [{
      id: 'old', month: '2026-10', income: 5000, surplus: 600, rawSpare: 1000, tuition: 200,
      balances: { r: 100 }, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 7, legacyBalanceAnchor: 0, time: '', actor: 'legacy',
    }],
  }), { replace: true });
  const before = await ledger.getBudgetMonth('2026-10');
  const doc = await ledger.exportFinanceDocument();
  const transactions = await ledger.listTransactions('0001-01-01', '9999-12-31');
  await ledger.addTransfer(transfer);
  await ledger.updateAccount(2, { name: '更名銀行', openingBalance: 12345, active: false });
  assert.deepEqual(await ledger.getBudgetMonth('2026-10'), before);
  assert.equal(await ledger.exportFinanceDocument(), doc);
  assert.equal((await ledger.listTransactions('0001-01-01', '9999-12-31')).length, transactions.length);
  assert.equal(await ledger.getMonthIncome('2026-11'), 0);
});
