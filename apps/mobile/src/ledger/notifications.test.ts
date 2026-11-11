// 合成資料；通知規則全部經帳本服務操作真正的 SQLite，不測畫面或內部資料表。
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetState } from '../calc/budgetTypes.ts';
import { openLedger, type Ledger, type NotificationSettings, type NotificationPlanInput } from './index.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
const DAY = 86_400_000;
function fixture(): BudgetState {
  return { ...emptyBudgetState(), version: 1,
    categories: [{ id: 'food', name: '飲食', kind: 'reserve' },
      { id: 'phone', name: '電話網路', kind: 'fixed' }, { id: 'water', name: '水電瓦斯', kind: 'actual' }],
    revisions: [{ id: 'caps', month: '2026-10', tuition: 0,
      limits: [{ categoryId: 'food', amount: 100 }, { categoryId: 'phone', amount: 0 }, { categoryId: 'water', amount: 0 }],
      mapping: { 飲食: 'food', 交通: 'food', 電話網路: 'phone', 水電瓦斯: 'water' },
      reason: '合成設定', actor: 'test', time: NOW.toISOString() }],
    months: [{ id: 'baseline', month: '2026-09', income: 0, surplus: 0, rawSpare: 5000, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, actor: 'test', time: NOW.toISOString() }],
  };
}
async function setup(t: TestContext, now = () => NOW, state = fixture()) {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now });
  t.after(() => ledger.close());
  await ledger.importFinanceDocument(serializeBudgetDocument(state));
  return ledger;
}
async function settings(ledger: Ledger, ...enabled: (keyof NotificationSettings['enabled'])[]) {
  const result = await ledger.getNotificationSettings();
  for (const kind of enabled) result.enabled[kind] = true;
  return result;
}
function plan(ledger: Ledger, configuration: NotificationSettings, extra: Partial<NotificationPlanInput> = {}) {
  return ledger.getNotificationPlan({ now: NOW, through: new Date(NOW.getTime() + 30 * DAY),
    settings: configuration, hasEntitlement: true, ...extra });
}
async function spend(ledger: Ledger, name: string, amount: number, date = '2026-11-03') {
  const category = (await ledger.listCategories()).find((c) => c.name === name)!;
  const [account] = await ledger.listAccounts();
  return ledger.addTransaction({ date, categoryId: category.id, accountId: account.id, amount, flow: category.flow });
}
async function loan(ledger: Ledger, name: string, remainingPrincipal = 900) {
  return ledger.createLoan({ name, totalAmount: 1200, monthlyPayment: 300, remainingPrincipal,
    expectedEndMonth: '2027-06', reason: '合成貸款', hasEntitlement: true, version: (await ledger.getBudgetStatus()).version });
}
/** 精靈完成入口要先有零差額的總資產核對（票 13）：把合成銀行餘額核平後才完成月結。 */
async function closeOctober(ledger: Ledger) {
  const input = { month: '2026-10', hasEntitlement: true };
  const check = await ledger.previewAssetCheck(input);
  const bank = check.accounts.find((a) => a.kind === 'bank')!;
  const balances = [{ accountId: bank.accountId, balance: bank.appBalance - check.difference }];
  const adjusted = await ledger.previewAssetCheck({ ...input, balances });
  const record = await ledger.recordAssetCheck({ ...input, balances, checkToken: adjusted.checkToken, operationId: randomUUID() });
  const preview = await ledger.previewMonthlyClose(input);
  await ledger.completeMonthlyClose({ ...preview, assetCheckId: record.id, operationId: randomUUID(), hasEntitlement: true });
}

test('通知預設全部關閉，讀取不寫帳本，也不阻礙之後舊帳匯入', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  const config = await ledger.getNotificationSettings();
  assert.ok(Object.values(config.enabled).every((value) => value === false));
  assert.equal(config.entryTime, '21:00');
  assert.deepEqual(await ledger.getNotificationPlan({ now: NOW, hasEntitlement: false }), []);
  assert.equal((await ledger.getBackupStatus()).lastModifiedAt, null);
  await ledger.importLegacyLedger({ openingDate: '2026-10-01',
    accounts: [{ name: '合成現金', kind: 'cash', openingBalance: 0 }],
    categories: [{ name: '合成支出', flow: 'expense' }], members: [], transactions: [],
    document: serializeBudgetDocument(emptyBudgetState()) });
  assert.equal(await ledger.getOpeningDate(), '2026-10-01');
});

test('設定可逐項保存且讀回互不共用可變參考', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'entry', 'backupAfterClose', 'loanPayment');
  Object.assign(config, { entryTime: '07:35', payday: 28, monthlyCloseDay: 8, creditCardClosingDay: 19,
    creditCardClosingDays: [{ accountId: 3, day: 22 }], loanDueDays: [{ loanId: 88, day: 15 }] });
  await ledger.saveNotificationSettings(config);
  assert.deepEqual(await ledger.getNotificationSettings(), config);
  config.enabled.entry = false;
  assert.equal((await ledger.getNotificationSettings()).enabled.entry, true);
});

test('無效時間、日期、開關或重複卡／貸款設定拒絕且保留原設定與修改時間', async (t) => {
  const ledger = await setup(t);
  const original = await settings(ledger, 'entry');
  await ledger.saveNotificationSettings(original);
  const before = await ledger.getBackupStatus();
  const invalid: unknown[] = [
    { entryTime: '24:00' }, { entryTime: '9:00' }, { entryTime: '12:60' },
    { payday: 0 }, { monthlyCloseDay: 32 }, { creditCardClosingDay: 1.5 },
    { enabled: { ...original.enabled, entry: 'true' } }, { enabled: {} },
    { creditCardClosingDays: [{ accountId: 3, day: 7 }, { accountId: 3, day: 8 }] },
    { loanDueDays: [{ loanId: 1, day: 0 }] }, { loanDueDays: [{ loanId: -1, day: 5 }] },
  ];
  for (const change of invalid) {
    await assert.rejects(ledger.saveNotificationSettings({ ...original, ...change as object }), /設定|時間|日期|開關/);
    assert.deepEqual(await ledger.getNotificationSettings(), original);
    assert.deepEqual(await ledger.getBackupStatus(), before);
  }
});

test('每日記帳依台北時間排至查詢終點，今天已過就從明天開始', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'entry');
  config.entryTime = '11:00';
  const rows = await plan(ledger, config, { through: new Date('2026-11-13T04:00:00Z') });
  assert.deepEqual(rows.map((r) => [r.kind, r.fireAt]), [
    ['entry', '2026-11-12T03:00:00.000Z'], ['entry', '2026-11-13T03:00:00.000Z'],
  ]);
  config.entryTime = '21:15';
  assert.equal((await plan(ledger, config))[0].fireAt, '2026-11-11T13:15:00.000Z');
});

test('跨台北午夜、跨年與閏日的每日排程正確', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'entry');
  config.entryTime = '00:00';
  for (const [now, through, expected] of [
    ['2026-12-31T15:59:59Z', '2026-12-31T16:01:00Z', '2026-12-31T16:00:00.000Z'],
    ['2028-02-28T15:59:59Z', '2028-02-28T16:01:00Z', '2028-02-28T16:00:00.000Z'],
  ]) assert.deepEqual((await plan(ledger, config, { now: new Date(now), through: new Date(through) })).map((r) => r.fireAt), [expected]);
});

test('查詢時間與範圍不合法明確拒絕，預設只排未來30天', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'entry');
  assert.equal((await ledger.getNotificationPlan({ now: NOW, settings: config, hasEntitlement: false })).length, 30);
  await assert.rejects(plan(ledger, config, { now: new Date('無效時間') }), /時間/);
  await assert.rejects(plan(ledger, config, { through: new Date(NOW.getTime() - 1) }), /範圍/);
  await assert.rejects(plan(ledger, config, { through: new Date(NOW.getTime() + 367 * DAY) }), /範圍/);
});

test('超支只算本月已發生支出、按預算歸屬合計，等於上限與照實支不提醒', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'budgetOverrun');
  await spend(ledger, '飲食', 100);
  await spend(ledger, '水電瓦斯', 999);
  await spend(ledger, '其他', 999);
  await spend(ledger, '薪資', 999);
  await spend(ledger, '飲食', 999, '2026-11-30');
  assert.deepEqual(await plan(ledger, config), []);
  await spend(ledger, '交通', 1);
  await spend(ledger, '電話網路', 1);
  const rows = await plan(ledger, config);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.kind === 'budgetOverrun' && r.fireAt === NOW.toISOString()));
  const body = rows.map((r) => `${r.title}${r.body}`).join('');
  assert.doesNotMatch(body, /101|999|NT\$|元/);
});

test('刪除超支交易後與關閉該開關後清單移除提醒', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'budgetOverrun');
  const { id } = await spend(ledger, '飲食', 101);
  assert.equal((await plan(ledger, config)).length, 1);
  await ledger.deleteTransaction(id);
  assert.deepEqual(await plan(ledger, config), []);
  config.enabled.budgetOverrun = false;
  await spend(ledger, '飲食', 101);
  assert.deepEqual(await plan(ledger, config), []);
});

test('月結提醒依自訂月結日提醒已結束的開放月份，不把發薪日或卡結帳日當月結日', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'monthlyClose');
  Object.assign(config, { payday: 3, creditCardClosingDay: 4, monthlyCloseDay: 20 });
  const rows = await plan(ledger, config, { through: new Date('2026-11-30T15:59:59Z') });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fireAt, '2026-11-20T01:00:00.000Z');
  assert.match(rows[0].body, /2026-10/);
  config.monthlyCloseDay = 7;
  assert.equal((await plan(ledger, config))[0].fireAt, NOW.toISOString());
});

test('月結完成後當月月結提醒消失；當月未結束不催結', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'monthlyClose');
  await closeOctober(ledger);
  assert.deepEqual(await plan(ledger, config, { through: new Date('2026-11-30T15:59:59Z') }), []);
  assert.equal((await plan(ledger, config))[0].fireAt, '2026-12-07T01:00:00.000Z');
});

test('月結備份免費提醒只取仍存在的新月結，搬遷期初與歷史月份不提醒', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'backupAfterClose');
  assert.deepEqual(await plan(ledger, config), []);
  await closeOctober(ledger);
  const rows = await plan(ledger, config, { hasEntitlement: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'backupAfterClose');
  await ledger.recordBackupDelivered(NOW.toISOString());
  assert.deepEqual(await plan(ledger, config), []);
});

test('撤銷月結後移除該月備份提醒', async (t) => {
  const ledger = await setup(t);
  await closeOctober(ledger);
  const config = await settings(ledger, 'backupAfterClose');
  assert.equal((await plan(ledger, config)).length, 1);
  await ledger.runBudgetCommand({ action: 'rollback', month: '2026-10',
    version: (await ledger.getBudgetStatus()).version, operationId: randomUUID(), reason: '合成撤銷' });
  assert.deepEqual(await plan(ledger, config), []);
});

test('嚴格超過35天才提醒，恰滿35天不算逾期，成功備份後重新起算', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'backupOverdue');
  await ledger.recordBackupDelivered(new Date(NOW.getTime() - 35 * DAY).toISOString());
  assert.deepEqual(await plan(ledger, config, { through: NOW }), []);
  const next = new Date(NOW.getTime() + 1);
  assert.equal((await plan(ledger, config, { now: next, through: next }))[0].fireAt, next.toISOString());
  await ledger.recordBackupDelivered(NOW.toISOString());
  assert.deepEqual(await plan(ledger, config), []);
});

test('備份尚未逾期時預排35天後一毫秒；從未備份從首次保存通知設定起算且不被編輯延後', async (t) => {
  let now = NOW;
  const ledger = await setup(t, () => now);
  const config = await settings(ledger, 'backupOverdue');
  await ledger.saveNotificationSettings(config);
  now = new Date(NOW.getTime() + 20 * DAY);
  await ledger.saveNotificationSettings({ ...config, payday: 8 });
  const rows = await plan(ledger, config, { now, through: new Date(NOW.getTime() + 36 * DAY) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fireAt, new Date(NOW.getTime() + 35 * DAY + 1).toISOString());
});

test('信用卡每卡每期明確未匯入才提醒，未知與已匯入皆不提醒', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'creditCardStatement');
  const card = (await ledger.listAccounts()).find((a) => a.kind === 'credit_card')!;
  assert.deepEqual(await plan(ledger, config), []);
  for (const imported of [null, true]) assert.deepEqual(await plan(ledger, config, {
    statementImports: [{ accountId: card.id, period: '2026-11', imported }],
  }), []);
  const rows = await plan(ledger, config, { statementImports: [{ accountId: card.id, period: '2026-11', imported: false }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'creditCardStatement');
  assert.equal(rows[0].fireAt, NOW.toISOString());
});

test('卡結帳日可每卡設定，結帳隔日09時提醒；短月31日夾月底', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'creditCardStatement');
  const card = (await ledger.listAccounts()).find((a) => a.kind === 'credit_card')!;
  config.creditCardClosingDay = 20;
  const input = { statementImports: [{ accountId: card.id, period: '2026-11', imported: false }] };
  assert.equal((await plan(ledger, config, input))[0].fireAt, '2026-11-21T01:00:00.000Z');
  config.creditCardClosingDays = [{ accountId: card.id, day: 31 }];
  assert.equal((await plan(ledger, config, input))[0].fireAt, '2026-12-01T01:00:00.000Z');
  assert.equal((await plan(ledger, config, { now: new Date('2028-02-10T04:00:00Z'), through: new Date('2028-03-02T04:00:00Z'),
    statementImports: [{ accountId: card.id, period: '2028-02', imported: false }] }))[0].fireAt, '2028-03-01T01:00:00.000Z');
});

test('停用卡、非信用卡與其他卡期狀態不會誤發通知', async (t) => {
  const ledger = await setup(t);
  const config = await settings(ledger, 'creditCardStatement');
  const accounts = await ledger.listAccounts();
  const card = accounts.find((a) => a.kind === 'credit_card')!;
  await ledger.updateAccount(card.id, { active: false });
  assert.deepEqual(await plan(ledger, config, { statementImports: accounts.map((a) => ({ accountId: a.id, period: '2026-11', imported: false })) }), []);
});

test('貸款按個別繳款日前一天提醒，未設日期、結清與未知貸款略過', async (t) => {
  const ledger = await setup(t);
  const active = await loan(ledger, '合成車貸');
  const settled = await loan(ledger, '合成已清分期', 0);
  await loan(ledger, '合成未設日期分期');
  const config = await settings(ledger, 'loanPayment');
  config.loanDueDays = [{ loanId: active.id, day: 15 }, { loanId: settled.id, day: 15 }, { loanId: 999, day: 15 }];
  const rows = await plan(ledger, config);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'loanPayment');
  assert.equal(rows[0].fireAt, '2026-11-14T01:00:00.000Z');
});

test('貸款每月1日的前一天跨月，短月31日夾月底且不重播過去繳款提醒', async (t) => {
  const ledger = await setup(t);
  const { id } = await loan(ledger, '合成月初分期');
  const config = await settings(ledger, 'loanPayment');
  config.loanDueDays = [{ loanId: id, day: 1 }];
  assert.equal((await plan(ledger, config))[0].fireAt, '2026-11-30T01:00:00.000Z');
  config.loanDueDays[0].day = 31;
  assert.equal((await plan(ledger, config, { now: new Date('2027-02-10T04:00:00Z'), through: new Date('2027-03-01T04:00:00Z') }))[0].fireAt, '2027-02-27T01:00:00.000Z');
});

test('支援年份最後一個月仍排當月貸款、記帳與月結，迭代不溢到10000年', async (t) => {
  const ledger = await setup(t);
  const { id } = await loan(ledger, '合成上界分期');
  const config = await settings(ledger, 'loanPayment');
  config.loanDueDays = [{ loanId: id, day: 15 }];
  const range = { now: new Date('9999-12-11T04:00:00Z'), through: new Date('9999-12-31T15:59:59Z') };
  assert.deepEqual((await plan(ledger, config, range)).map((row) => row.fireAt), ['9999-12-14T01:00:00.000Z']);
  config.enabled.entry = true;
  config.enabled.monthlyClose = true;
  const rows = await plan(ledger, config, range);
  assert.equal(rows.filter((row) => row.kind === 'entry').length, 21);
  assert.equal(rows.filter((row) => row.kind === 'monthlyClose').length, 1);
  assert.ok(rows.every((row) => row.fireAt.startsWith('9999-12')));
});

test('付費權益到期只移除三種付費提醒，免費提醒與設定仍保留', async (t) => {
  const ledger = await setup(t);
  const { id } = await loan(ledger, '合成權益貸款');
  await spend(ledger, '飲食', 101);
  const config = await settings(ledger, 'entry', 'budgetOverrun', 'backupAfterClose', 'backupOverdue', 'monthlyClose', 'creditCardStatement', 'loanPayment');
  config.loanDueDays = [{ loanId: id, day: 15 }];
  await ledger.saveNotificationSettings(config);
  const card = (await ledger.listAccounts()).find((a) => a.kind === 'credit_card')!;
  const extra = { statementImports: [{ accountId: card.id, period: '2026-11', imported: false }] };
  const paid = await plan(ledger, config, extra);
  const free = await plan(ledger, config, { ...extra, hasEntitlement: false });
  assert.deepEqual(free, paid.filter((r) => !['monthlyClose', 'creditCardStatement', 'loanPayment'].includes(r.kind)));
  assert.deepEqual(await ledger.getNotificationSettings(), config);
});

test('同狀態同識別碼、依時間及識別碼排序，已送達識別碼可排除且查詢不改任何帳務', async (t) => {
  const ledger = await setup(t);
  await spend(ledger, '飲食', 101);
  await closeOctober(ledger);
  const config = await settings(ledger, 'entry', 'budgetOverrun', 'backupAfterClose', 'monthlyClose');
  await ledger.saveNotificationSettings(config);
  const snapshot = async () => ({ document: await ledger.exportFinanceDocument(), months: await ledger.listBudgetMonths(),
    close: await ledger.getMonthlyCloseSnapshot('2026-10'), budget: await ledger.getBudgetProgress(),
    transactions: await ledger.listTransactions('2026-01-01', '2027-12-31'), backup: await ledger.getBackupStatus() });
  const before = await snapshot();
  const first = await ledger.getNotificationPlan({ now: NOW, hasEntitlement: true });
  assert.deepEqual(await ledger.getNotificationPlan({ now: NOW, hasEntitlement: true }), first);
  assert.deepEqual(first, [...first].sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id)));
  assert.equal(new Set(first.map((r) => r.id)).size, first.length);
  assert.ok(first.every((r) => r.title && r.body));
  assert.deepEqual(await ledger.getNotificationPlan({ now: NOW, hasEntitlement: true, deliveredIds: first.map((r) => r.id) }), []);
  assert.deepEqual(await snapshot(), before);
});

test('通知設定關機重開、整本備份還原及取代前另存皆完整保留；匯出未送出不取消備份提醒', async (t) => {
  const directory = mkdtempSync(join(process.cwd(), '.notification-backup-test-'));
  const ledgers = new Set<Ledger>();
  t.after(async () => {
    try { for (const ledger of ledgers) await ledger.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  });
  const files = { directory, open: async (path: string) => openNodeDatabase(path), remove: async (path: string) => { rmSync(path, { force: true }); } };
  const open = async (name: string) => {
    const ledger = await openLedger(openNodeDatabase(join(directory, name)), { now: () => NOW, backupFiles: files });
    ledgers.add(ledger);
    return ledger;
  };
  let source = await open('source.db');
  await source.importFinanceDocument(serializeBudgetDocument(fixture()));
  await closeOctober(source);
  const { id } = await loan(source, '合成備份貸款');
  const config = await settings(source, 'entry', 'loanPayment', 'backupAfterClose', 'creditCardStatement');
  Object.assign(config, { payday: 25, monthlyCloseDay: 9, creditCardClosingDay: 18,
    loanDueDays: [{ loanId: id, day: 15 }], creditCardClosingDays: [{ accountId: 3, day: 22 }] });
  await source.saveNotificationSettings(config);
  const expected = await source.getNotificationPlan({ now: NOW, hasEntitlement: true });
  const receipt = { id: 'entry:2026-11-10', fireAt: NOW.toISOString() };
  await source.recordNotificationDispatches([receipt]);
  await source.close(); ledgers.delete(source);
  source = await open('source.db');
  assert.deepEqual(await source.getNotificationSettings(), config);
  assert.deepEqual(await source.getNotificationDispatches(), [receipt]);
  const out = await source.exportBackup(join(directory, 'out.db'));
  assert.deepEqual(await source.getNotificationPlan({ now: NOW, hasEntitlement: true }), expected);
  const target = await open('target.db');
  const original = await target.getNotificationSettings();
  const restored = await target.restoreBackup(out.path);
  assert.deepEqual(await target.getNotificationSettings(), config);
  assert.deepEqual(await target.getNotificationDispatches(), [receipt]);
  assert.deepEqual(await target.getNotificationPlan({ now: NOW, hasEntitlement: true }), expected.filter((r) => r.kind !== 'backupAfterClose'));
  await target.restoreBackup(restored.safetyCopyPath, { allowOlder: true });
  assert.deepEqual(await target.getNotificationSettings(), original);
  assert.deepEqual(await target.getNotificationDispatches(), []);
});

test('已受理即時提醒保存後不因前景重查而重發，也不改月結與交易總量', async (t) => {
  const ledger = await setup(t);
  await spend(ledger, '飲食', 101);
  await closeOctober(ledger);
  await ledger.saveNotificationSettings(await settings(ledger, 'entry', 'budgetOverrun', 'backupAfterClose'));
  const snapshot = async () => ({ document: await ledger.exportFinanceDocument(), close: await ledger.getMonthlyCloseSnapshot('2026-10'),
    transactions: await ledger.listTransactions('2026-01-01', '2027-12-31') });
  const before = await snapshot();
  assert.deepEqual(await ledger.getNotificationDispatches(), []);
  const first = await ledger.getNotificationPlan({ now: NOW, hasEntitlement: false });
  const immediate = first.filter((row) => row.fireAt === NOW.toISOString()).map(({ id, fireAt }) => ({ id, fireAt }));
  assert.equal(immediate.length, 2);
  await ledger.recordNotificationDispatches(immediate);
  assert.deepEqual(await ledger.getNotificationDispatches(), immediate);
  const later = await ledger.getNotificationPlan({ now: new Date(NOW.getTime() + 60_000), hasEntitlement: false });
  assert.ok(later.length > 0 && later.every((row) => row.kind === 'entry'));
  assert.deepEqual(await snapshot(), before);
});

test('記錄即時提醒識別碼去重、空清單與重送不改修改時間，無效輸入整批拒絕', async (t) => {
  let time = NOW;
  const ledger = await setup(t, () => time);
  const receipt = { id: 'budgetOverrun:2026-11:food', fireAt: NOW.toISOString() };
  await ledger.recordNotificationDispatches([receipt, receipt]);
  const before = await ledger.getBackupStatus();
  time = new Date(NOW.getTime() + DAY);
  await ledger.recordNotificationDispatches([]);
  await ledger.recordNotificationDispatches([receipt]);
  assert.deepEqual(await ledger.getBackupStatus(), before);
  await assert.rejects(ledger.recordNotificationDispatches([receipt, { ...receipt, id: '其他用途:1' }]), /識別碼/);
  await assert.rejects(ledger.recordNotificationDispatches([{ ...receipt, fireAt: '無效日期' }]), /時間/);
  assert.deepEqual(await ledger.getNotificationDispatches(), [receipt]);
});

test('預排提醒到時後不補發；到時前取消的排程仍可重新啟用', async (t) => {
  let time = NOW;
  const ledger = await setup(t, () => time);
  await ledger.saveNotificationSettings(await settings(ledger, 'monthlyClose'));
  const future = await ledger.getNotificationPlan({ now: NOW, hasEntitlement: true });
  const december = future.find((row) => row.id.endsWith(':2026-12'))!;
  assert.ok(december);
  await ledger.recordNotificationDispatches([december]);
  // 已受理但尚未到時仍須保留在下一份完整計畫，不能因去重而提前取消。
  assert.ok((await ledger.getNotificationPlan({ now: NOW, hasEntitlement: true })).some((row) => row.id === december.id));
  await ledger.recordNotificationDispatches([]);
  assert.deepEqual(await ledger.getNotificationDispatches(), []);
  time = new Date('2026-12-08T04:00:00Z');
  assert.ok((await ledger.getNotificationPlan({ now: time, hasEntitlement: true })).some((row) => row.id === december.id));
  time = NOW;
  await ledger.recordNotificationDispatches([december]);
  time = new Date('2026-12-08T04:00:00Z');
  assert.ok(!(await ledger.getNotificationPlan({ now: time, hasEntitlement: true })).some((row) => row.id === december.id));
});
