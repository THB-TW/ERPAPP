// 遷移機制：逐版保存已套用的遷移，PRAGMA user_version 保留最高結構版本。
// 每個遷移與其版本號寫入在同一個資料庫交易內，失敗整筆還原；重複執行不會重做已套用的遷移。
import type { Database, Queryable } from './driver.ts';

export interface Migration {
  /** 唯一且遞增的正整數；可預留中間版本，不可改已發佈的遷移。 */
  version: number;
  up(tx: Queryable): Promise<void>;
}

export class DatabaseTooNewError extends Error {
  readonly found: number;
  readonly supported: number;
  constructor(found: number, supported: number) {
    super(`資料庫版本（${found}）比這個 App 支援的版本（${supported}）新，請先更新 App。`);
    this.name = 'DatabaseTooNewError';
    this.found = found;
    this.supported = supported;
  }
}

export async function migrate(db: Database, migrations: readonly Migration[]): Promise<void> {
  migrations.forEach((m, i) => {
    if (!Number.isSafeInteger(m.version) || m.version < 1 || m.version > 2147483647) {
      throw new Error(`遷移版本必須是 SQLite 支援的正整數，第 ${i + 1} 個卻是 ${m.version}`);
    }
    if (i > 0 && m.version <= migrations[i - 1].version) {
      throw new Error('遷移版本必須唯一且遞增。');
    }
  });
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const supported = migrations.at(-1)?.version ?? 0;
  if (current > supported) throw new DatabaseTooNewError(current, supported);

  // 舊遷移器只允許連號，因此第一次升級時，user_version 以前的每版都已完成。
  // 新遷移器在執行任何跳號遷移前就建立紀錄，往後只按紀錄判斷，才不會漏掉後補的中間版本。
  const tracked = await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'");
  if (!tracked) {
    await db.transaction(async (tx) => {
      await tx.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY)');
      for (let version = 1; version <= current; version++) {
        await tx.run('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
      }
    });
  }

  let highest = current;
  for (const migration of migrations) {
    if (await db.get('SELECT 1 FROM schema_migrations WHERE version = ?', [migration.version])) continue;
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.run('INSERT INTO schema_migrations (version) VALUES (?)', [migration.version]);
      // PRAGMA 不能帶參數；version 來自程式內的整數，不是使用者輸入。
      await tx.exec(`PRAGMA user_version = ${Math.max(highest, migration.version)}`);
    });
    highest = Math.max(highest, migration.version);
  }
}
