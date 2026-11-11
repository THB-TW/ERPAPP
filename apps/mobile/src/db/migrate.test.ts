import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from './nodeDriver.ts';
import { migrate, type Migration } from './migrate.ts';

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

test('遷移版本必須連號', async () => {
  const db = openNodeDatabase(':memory:');
  await assert.rejects(() => migrate(db, [v2]), /連號/);
});
