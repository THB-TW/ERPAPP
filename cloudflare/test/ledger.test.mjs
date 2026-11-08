import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Ledger } from '../dist/server/ledger.js';
import { sqlAdapter } from '../tools/local-database.mjs';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE app_workspaces(owner_id TEXT PRIMARY KEY,Document TEXT);
    CREATE TABLE app_accounts(owner_id TEXT,name TEXT,sort_order INTEGER);
    CREATE TABLE app_members(owner_id TEXT,name TEXT,sort_order INTEGER);
    CREATE TABLE app_transactions(owner_id TEXT,id TEXT,date TEXT,category TEXT,amount INTEGER,account TEXT,member TEXT,type TEXT,
      note TEXT,source TEXT,fingerprint TEXT,created_at TEXT,deleted_at TEXT,PRIMARY KEY(owner_id,id));`);
  for (const [owner, cap] of [['alice', 3000], ['bob', 600]]) {
    const state = { Categories: [{ Id: 'food', Name: '飲食', Kind: 'reserve' }],
      Revisions: [{ Month: '2026-10', Limits: [{ CategoryId: 'food', Amount: cap }], Mapping: { '飲食': 'food' } }],
      Months: [{ Month: '2026-10', RawSpare: 100, Tuition: 0, Balances: { food: 500 }, LegacyTotalDifference: 0 }], Adjustments: [] };
    db.prepare('INSERT INTO app_workspaces VALUES(?,?)').run(owner, JSON.stringify(state));
    db.prepare('INSERT INTO app_accounts VALUES(?,?,0)').run(owner, '現金');
    db.prepare('INSERT INTO app_members VALUES(?,?,0)').run(owner, '自己');
  }
  return { db, alice: new Ledger(sqlAdapter(db), 'alice'), bob: new Ledger(sqlAdapter(db), 'bob') };
}
const draft = () => ({ operationId: randomUUID(), date: '2026-11-08', category: '飲食', amount: 150,
  account: '現金', member: '自己', type: '支', note: '午餐' });

test('a saved expense immediately reduces only its category budget; duplicate delivery records it once', async () => {
  const { db, alice } = setup();
  try {
    const input = draft();
    const saved = await alice.save(input);
    assert.equal(saved.budget.categories[0].remaining, 2850);
    assert.equal(saved.budget.categories[0].confirmedReserve, 500);
    assert.equal(saved.replay, false);
    assert.equal((await alice.save(input)).replay, true);
    assert.equal((await alice.entries('2026-11')).entries.length, 1);
    await assert.rejects(alice.save({ ...input, amount: 200 }), /內容已改變/);
    assert.equal((await alice.budget('2026-11')).spent, 150);
  } finally { db.close(); }
});

test('transactions, budgets, history and operation IDs are isolated by owner', async () => {
  const { db, alice, bob } = setup();
  try {
    const input = draft();
    await alice.save(input);
    assert.equal((await bob.entries('2026-11')).entries.length, 0);
    assert.equal((await bob.budget('2026-11')).categories[0].remaining, 600);
    assert.equal((await alice.budget('2026-11')).categories[0].remaining, 2850);
    const other = await bob.save({ ...input, amount: 20 });
    assert.equal(other.replay, false);
    assert.equal(other.budget.categories[0].remaining, 580);
    assert.equal((await alice.entries('2026-11')).entries[0].amount, 150);
    assert.equal((await alice.history()).months.length, 1);
    const unknown = new Ledger(sqlAdapter(db), 'unknown');
    await assert.rejects(unknown.budget('2026-11'), /找不到/);
  } finally { db.close(); }
});

test('closed months, invalid dates, invalid amounts and foreign account names are rejected without writes', async () => {
  const { db, alice } = setup();
  try {
    for (const change of [{ date: '2026-10-20' }, { date: '2026-02-30' }, { amount: 0 }, { amount: 1.5 }, { account: '別人的帳戶' }]) {
      await assert.rejects(alice.save({ ...draft(), ...change }));
    }
    assert.equal((await alice.entries('2026-11')).entries.length, 0);
    assert.equal((await alice.history()).months[0].total, 600);
  } finally { db.close(); }
});
