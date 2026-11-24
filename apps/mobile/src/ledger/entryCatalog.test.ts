// 成員必填預設自己、記帳畫面就地新增／修改成員與分類（含圖示）。資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { ledgerMigrations } from './migrations.ts';
import { LedgerError, openLedger } from './index.ts';

const NOW = new Date('2026-11-24T04:00:00Z');
const fresh = () => openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
async function rejects(code: string, promise: Promise<unknown>) {
  await assert.rejects(promise, (e: unknown) => e instanceof LedgerError && e.code === code, code);
}

test('第一次需要時建立「自己」；不指定成員的交易記在自己名下', async () => {
  const ledger = await fresh();
  const members = await ledger.listMembers();
  assert.deepEqual(members.map((m) => [m.name, m.isSelf, m.active]), [['自己', true, true]]);
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  const { id } = await ledger.addTransaction({ date: '2026-11-20', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 50 });
  assert.equal((await ledger.getTransaction(id)).memberId, members[0].id);
});

test('新增成員：名稱不可空白或重複，圖示最多一個表情符號；改名與換圖示', async () => {
  const ledger = await fresh();
  const mom = await ledger.addMember({ name: '  媽媽 ', icon: '👩' });
  assert.deepEqual([mom.name, mom.icon, mom.isSelf], ['媽媽', '👩', false]);
  await rejects('invalid_member_name', ledger.addMember({ name: '   ' }));
  await rejects('member_name_conflict', ledger.addMember({ name: '媽媽' }));
  await rejects('member_name_conflict', ledger.addMember({ name: '自己' }));
  await rejects('invalid_icon', ledger.addMember({ name: '爸爸', icon: 'abc' }));
  await rejects('invalid_icon', ledger.addMember({ name: '爸爸', icon: '😀😀😀😀😀' }));
  const renamed = await ledger.updateMember(mom.id, { name: '老媽', icon: null });
  assert.deepEqual([renamed.name, renamed.icon], ['老媽', null]);
  const self = (await ledger.listMembers())[0];
  const selfRenamed = await ledger.updateMember(self.id, { name: '我', icon: '🙂' });
  assert.deepEqual([selfRenamed.name, selfRenamed.icon, selfRenamed.isSelf], ['我', '🙂', true]);
});

test('停用與刪除成員：自己不能停用或刪；用過只能停用；停用後不在選單，舊交易仍顯示名字', async () => {
  const ledger = await fresh();
  const [self] = await ledger.listMembers();
  const girl = await ledger.addMember({ name: '女友' });
  const spare = await ledger.addMember({ name: '備用' });
  await rejects('cannot_deactivate_self', ledger.setMemberActive(self.id, false));
  await rejects('cannot_deactivate_self', ledger.deleteMember(self.id));
  const [cat] = await ledger.listCategories();
  const [acc] = await ledger.listAccounts();
  const { id } = await ledger.addTransaction({ date: '2026-11-20', categoryId: cat.id, accountId: acc.id, flow: 'expense', amount: 50, memberId: girl.id });
  await rejects('member_in_use', ledger.deleteMember(girl.id));
  await ledger.deleteMember(spare.id);
  await ledger.setMemberActive(girl.id, false);
  assert.deepEqual((await ledger.listMembers()).map((m) => m.name), ['自己']);
  assert.deepEqual((await ledger.listMembers({ includeInactive: true })).map((m) => m.name), ['自己', '女友']);
  assert.equal((await ledger.getTransaction(id)).memberName, '女友');
  await ledger.setMemberActive(girl.id, true);
  assert.equal((await ledger.listMembers()).length, 2);
});

test('就地新增收入分類：直接可記帳，名稱不可重複，圖示另存不進名稱', async () => {
  const ledger = await fresh();
  const added = await ledger.addEntryCategory({ flow: 'income', name: '接案', icon: '💼' });
  assert.deepEqual([added.name, added.flow, added.icon], ['接案', 'income', '💼']);
  await rejects('category_name_conflict', ledger.addEntryCategory({ flow: 'income', name: '接案' }));
  await rejects('category_name_conflict', ledger.addEntryCategory({ flow: 'income', name: '飲食' }));
  const listed = (await ledger.listCategories()).find((c) => c.id === added.id)!;
  assert.equal(listed.icon, '💼');
  const [acc] = await ledger.listAccounts();
  await ledger.addTransaction({ date: '2026-11-20', categoryId: added.id, accountId: acc.id, flow: 'income', amount: 1000 });
});

test('就地新增支出分類：同時進預算（照實支、上限 0），之後可改名保留預算歸屬與交易', async () => {
  const ledger = await fresh();
  const added = await ledger.addEntryCategory({ flow: 'expense', name: '寵物', icon: '🐶' });
  assert.deepEqual([added.name, added.flow, added.icon], ['寵物', 'expense', '🐶']);
  const status = await ledger.getBudgetStatus();
  const budget = status.categories.find((c) => c.name === '寵物')!;
  assert.equal(budget.kind, 'actual');
  assert.equal(status.currentRevision?.mapping['寵物'], budget.id);
  assert.equal(status.currentRevision?.limits.find((l) => l.categoryId === budget.id)?.amount, 0);
  const [acc] = await ledger.listAccounts();
  const { id } = await ledger.addTransaction({ date: '2026-11-20', categoryId: added.id, accountId: acc.id, flow: 'expense', amount: 300 });
  const renamed = await ledger.updateEntryCategory(added.id, { name: '毛小孩', icon: '🐱' });
  assert.deepEqual([renamed.name, renamed.icon], ['毛小孩', '🐱']);
  assert.equal((await ledger.getTransaction(id)).categoryName, '毛小孩');
  const after = await ledger.getBudgetStatus();
  assert.equal(after.currentRevision?.mapping['毛小孩'], after.categories.find((c) => c.name === '毛小孩')!.id);
  await rejects('category_name_conflict', ledger.addEntryCategory({ flow: 'expense', name: '飲食' }));
});

test('只改圖示不動名稱；既有分類也能加圖示', async () => {
  const ledger = await fresh();
  const [cat] = await ledger.listCategories();
  const updated = await ledger.updateEntryCategory(cat.id, { icon: '🍜' });
  assert.deepEqual([updated.id, updated.name, updated.icon], [cat.id, cat.name, '🍜']);
  assert.equal((await ledger.updateEntryCategory(cat.id, { icon: null })).icon, null);
});

test('v14 升級：沒有成員的既有交易補成「自己」，已有「自己」的舊帳只加標記，金額與筆數不變', async () => {
  const db = openNodeDatabase(':memory:');
  await openLedger(db, { now: () => NOW, migrations: ledgerMigrations.filter((m) => m.version <= 13) });
  const cat = (await db.get<{ id: number }>('SELECT id FROM categories ORDER BY sort_order'))!;
  const acc = (await db.get<{ id: number }>('SELECT id FROM accounts ORDER BY sort_order'))!;
  for (const [date, amount] of [['2026-11-20', 70], ['2026-11-21', 30]] as const) {
    await db.run('INSERT INTO transactions (date, category_id, account_id, flow, amount) VALUES (?, ?, ?, ?, ?)', [date, cat.id, acc.id, 'expense', amount]);
  }
  const migrated = await openLedger(db, { now: () => NOW });
  const rows = await migrated.listTransactions('2026-01-01', '2026-12-31');
  assert.deepEqual(rows.map((r) => [r.amount, r.memberName]), [[70, '自己'], [30, '自己']]);
  assert.deepEqual((await migrated.listMembers()).map((m) => [m.name, m.isSelf]), [['自己', true]]);

  const db2 = openNodeDatabase(':memory:');
  await openLedger(db2, { now: () => NOW, migrations: ledgerMigrations.filter((m) => m.version <= 13) });
  await db2.run("INSERT INTO members (name, sort_order) VALUES ('父母', 1), ('自己', 0)");
  const c2 = (await db2.get<{ id: number }>('SELECT id FROM categories ORDER BY sort_order'))!;
  const a2 = (await db2.get<{ id: number }>('SELECT id FROM accounts ORDER BY sort_order'))!;
  await db2.run('INSERT INTO transactions (date, category_id, account_id, flow, amount, member_id) VALUES (?, ?, ?, ?, ?, 1)', ['2026-11-20', c2.id, a2.id, 'expense', 10]);
  await db2.run('INSERT INTO transactions (date, category_id, account_id, flow, amount, member_id) VALUES (?, ?, ?, ?, ?, NULL)', ['2026-11-21', c2.id, a2.id, 'expense', 20]);
  const upgraded = await openLedger(db2, { now: () => NOW });
  assert.deepEqual((await upgraded.listMembers()).map((m) => [m.name, m.isSelf]), [['自己', true], ['父母', false]]);
  assert.deepEqual((await upgraded.listTransactions('2026-01-01', '2026-12-31')).map((r) => [r.amount, r.memberName]), [[10, '父母'], [20, '自己']]);
});
