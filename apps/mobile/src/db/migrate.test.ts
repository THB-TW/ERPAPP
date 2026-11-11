import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from './nodeDriver.ts';
import { DatabaseTooNewError, migrate, type Migration } from './migrate.ts';

const v1: Migration = { version: 1, up: (tx) => tx.exec('CREATE TABLE a (x INTEGER)') };
const v2: Migration = { version: 2, up: (tx) => tx.exec('CREATE TABLE b (y INTEGER)') };

async function version(db: ReturnType<typeof openNodeDatabase>) {
  return (await db.get<{ user_version: number }>('PRAGMA user_version'))!.user_version;
}

test('遷移依序執行並記錄版本，重複執行不出錯也不重做', async () => {
  const db = openNodeDatabase(':memory:');
  await migrate(db, [v1]);
  assert.equal(await version(db), 1);
  await migrate(db, [v1]); // 重複執行
  await migrate(db, [v1, v2]); // 只補跑 v2
  await migrate(db, [v1, v2]);
  assert.equal(await version(db), 2);
  await db.run('INSERT INTO b (y) VALUES (1)'); // 兩張表都建好了
});

test('某個遷移失敗時整筆還原，版本不前進', async () => {
  const db = openNodeDatabase(':memory:');
  await migrate(db, [v1]);
  const broken: Migration = {
    version: 2,
    async up(tx) {
      await tx.exec('CREATE TABLE c (z INTEGER)');
      throw new Error('壞掉的遷移');
    },
  };
  await assert.rejects(() => migrate(db, [v1, broken]), /壞掉的遷移/);
  assert.equal(await version(db), 1);
  await assert.rejects(() => db.run('INSERT INTO c (z) VALUES (1)')); // 表也沒留下
});

test('遷移版本可跳號，之後補入中間版本仍會執行且不降低最高版本', async () => {
  const db = openNodeDatabase(':memory:');
  const v4: Migration = { version: 4, up: (tx) => tx.exec('CREATE TABLE d (x INTEGER)') };
  const v5: Migration = { version: 5, up: (tx) => tx.exec('CREATE TABLE e (x INTEGER)') };
  await migrate(db, [v1, v2, v5]);
  assert.equal(await version(db), 5);
  await migrate(db, [v1, v2, v4, v5]);
  await db.run('INSERT INTO d (x) VALUES (4)');
  await db.run('INSERT INTO e (x) VALUES (5)');
  assert.equal(await version(db), 5);
  await migrate(db, [v1, v2, v4, v5]);
  assert.deepEqual(await db.all('SELECT x FROM d'), [{ x: 4 }]);
});

test('舊版只有 user_version 的資料庫不重跑已完成版本，仍可先套 v5 再補 v4', async () => {
  const db = openNodeDatabase(':memory:');
  await db.exec('CREATE TABLE a (x INTEGER); CREATE TABLE b (y INTEGER); CREATE TABLE c (z INTEGER); PRAGMA user_version = 3;');
  const v3: Migration = { version: 3, up: (tx) => tx.exec('CREATE TABLE c (z INTEGER)') };
  const v4: Migration = { version: 4, up: (tx) => tx.exec('CREATE TABLE d (x INTEGER)') };
  const v5: Migration = { version: 5, up: (tx) => tx.exec('CREATE TABLE e (x INTEGER)') };
  await migrate(db, [v1, v2, v3, v5]);
  await migrate(db, [v1, v2, v3, v4, v5]);
  await db.run('INSERT INTO a (x) VALUES (1)');
  await db.run('INSERT INTO d (x) VALUES (4)');
  await db.run('INSERT INTO e (x) VALUES (5)');
  assert.equal(await version(db), 5);
});

test('補入的中間版本失敗會回滾，修復後可重試且不重跑後面的版本', async () => {
  const db = openNodeDatabase(':memory:');
  const v5: Migration = { version: 5, up: (tx) => tx.exec('CREATE TABLE e (x INTEGER)') };
  const broken: Migration = { version: 4, async up(tx) {
    await tx.exec('CREATE TABLE d (x INTEGER)');
    throw new Error('補入失敗');
  } };
  await migrate(db, [v1, v5]);
  await assert.rejects(migrate(db, [v1, broken, v5]), /補入失敗/);
  assert.equal(await version(db), 5);
  await assert.rejects(db.run('INSERT INTO d (x) VALUES (4)'));
  const fixed: Migration = { version: 4, up: (tx) => tx.exec('CREATE TABLE d (x INTEGER)') };
  await migrate(db, [v1, fixed, v5]);
  await db.run('INSERT INTO d (x) VALUES (4)');
  assert.equal(await version(db), 5);
});

test('遷移版本必須為唯一且遞增的正整數', async () => {
  for (const versions of [[0], [-1], [1.5], [1, 1], [2, 1], [NaN], [Infinity]]) {
    const db = openNodeDatabase(':memory:');
    await assert.rejects(migrate(db, versions.map((version) => ({ version, async up() {} }))), /正整數|遞增/);
    await db.close();
  }
});

test('過新版本以最高遷移版本判斷，拒絕時不修改資料庫', async () => {
  const db = openNodeDatabase(':memory:');
  await db.exec('PRAGMA user_version = 6');
  const v5: Migration = { version: 5, async up() {} };
  await assert.rejects(migrate(db, [v1, v5]), (e) => {
    assert.ok(e instanceof DatabaseTooNewError);
    assert.equal(e.found, 6);
    assert.equal(e.supported, 5);
    return true;
  });
  assert.equal(await version(db), 6);
});
