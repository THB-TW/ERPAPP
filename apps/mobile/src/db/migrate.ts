// 遷移機制：以 PRAGMA user_version 記錄結構版本，依序執行尚未套用的遷移。
// 每個遷移與其版本號寫入在同一個資料庫交易內，失敗整筆還原；重複執行不會重做已套用的遷移。
import type { Database, Queryable } from './driver.ts';

export interface Migration {
  /** 從 1 開始連號，不可跳號、不可改已發佈的遷移；要改結構就新增下一版。 */
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
    if (m.version !== i + 1) throw new Error(`遷移版本必須從 1 起連號，第 ${i + 1} 個卻是 ${m.version}`);
  });
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > migrations.length) throw new DatabaseTooNewError(current, migrations.length);

  for (const migration of migrations.slice(current)) {
    await db.transaction(async (tx) => {
      await migration.up(tx);
      // PRAGMA 不能帶參數；version 來自程式內的整數，不是使用者輸入。
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
