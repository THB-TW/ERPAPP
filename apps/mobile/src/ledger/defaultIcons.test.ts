// 內建圖示與新帳本預設（2026-11-25 翰陞定案）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { ledgerMigrations } from './migrations.ts';
import { openLedger } from './index.ts';

const NOW = new Date('2026-11-25T04:00:00Z');

test('新帳本：分類、帳戶與自己都帶內建圖示；收入只有薪資', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  assert.deepEqual((await ledger.listCategories()).map((c) => [c.flow, c.icon, c.name]), [
    ['expense', '🍜', '飲食'], ['expense', '🚇', '交通'], ['expense', '🎬', '娛樂'], ['expense', '🧴', '日常用品'],
    ['expense', '💊', '醫療保健'], ['expense', '👕', '服飾'], ['expense', '📚', '學習'], ['expense', '📶', '電話網路'],
    ['expense', '💡', '水電瓦斯'], ['expense', '🧩', '其他'], ['income', '💼', '薪資'],
  ]);
  assert.deepEqual((await ledger.listAccounts()).map((a) => [a.icon, a.name]), [['💵', '現金'], ['🏦', '銀行'], ['💳', '信用卡'], ['📱', '電子支付']]);
  assert.deepEqual((await ledger.listMembers()).map((m) => [m.icon, m.name]), [['🙂', '自己']]);
  const added = await ledger.addAccount({ name: '郵局', kind: 'bank' });
  assert.equal((await ledger.listAccounts()).find((a) => a.id === added.id)?.icon, '🏦'); // 名稱沒對到就依種類
});

test('已在用的帳本升級：只補空白圖示（名稱完全相同），自訂圖示、其他收入與金額都不動', async (t) => {
  const db = openNodeDatabase(':memory:');
  const old = await openLedger(db, { now: () => NOW, migrations: ledgerMigrations.filter((m) => m.version <= 14) });
  const cats = await old.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!;
  const cash = (await db.get<{ id: number }>('SELECT id FROM accounts ORDER BY sort_order LIMIT 1'))!; // v14 帳戶還沒有圖示欄位
  await old.addTransaction({ date: '2026-11-03', categoryId: cat('其他收入').id, accountId: cash.id, flow: 'income', amount: 777 });
  await old.addTransaction({ date: '2026-11-03', categoryId: cat('飲食').id, accountId: cash.id, flow: 'expense', amount: 120 });
  await old.updateEntryCategory(cat('交通').id, { icon: '🚌' }); // 使用者自訂
  await old.addEntryCategory({ flow: 'expense', name: 'Uber eats' });
  await old.addEntryCategory({ flow: 'expense', name: '飲食 ' + '外送' }); // 名稱不完全相同，不補

  const upgraded = await openLedger(db, { now: () => NOW });
  t.after(() => upgraded.close());
  const icons = new Map((await upgraded.listCategories()).map((c) => [c.name, c.icon]));
  assert.equal(icons.get('飲食'), '🍜');
  assert.equal(icons.get('交通'), '🚌');
  assert.equal(icons.get('Uber eats'), '🛵');
  assert.equal(icons.get('飲食 外送'), null);
  assert.equal(icons.get('其他收入'), null); // 已在用的帳本保留
  assert.deepEqual((await upgraded.listAccounts()).map((a) => a.icon), ['💵', '🏦', '💳', '📱']);
  assert.equal((await upgraded.listMembers())[0].icon, '🙂');
  const sum = await db.get<{ n: number; total: number }>('SELECT COUNT(*) AS n, SUM(amount) AS total FROM transactions');
  assert.deepEqual({ ...sum }, { n: 2, total: 897 });
});

test('舊帳匯入後依名稱補圖示，名稱本身不變', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  await ledger.importLegacyLedger({
    openingDate: '2026-11-01',
    accounts: [{ name: '現金', kind: 'cash', openingBalance: 0 }, { name: 'line bank', kind: 'bank', openingBalance: 0 }],
    categories: [{ name: 'gogoro電費', flow: 'expense' }, { name: '自訂', flow: 'expense' }, { name: '薪資', flow: 'income' }],
    members: ['自己', '父母'],
    transactions: [{ date: '2026-10-05', category: 'gogoro電費', account: '現金', flow: 'expense', amount: 300, member: '父母' }],
    document: '{"Months":[]}',
  });
  assert.deepEqual((await ledger.listCategories()).map((c) => [c.name, c.icon]), [['gogoro電費', '🛵'], ['自訂', null], ['薪資', '💼']]);
  assert.deepEqual((await ledger.listAccounts()).map((a) => [a.name, a.icon]), [['現金', '💵'], ['line bank', '🏦']]);
  assert.deepEqual((await ledger.listMembers()).map((m) => [m.name, m.icon]), [['自己', '🙂'], ['父母', null]]);
});
