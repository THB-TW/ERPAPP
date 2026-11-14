// Node 內建 node:sqlite 的驅動，給測試與 Mac 上的工具使用（手機不會載入這個檔案）。
import { DatabaseSync } from 'node:sqlite';
import type { Database, Queryable, SqlValue } from './driver.ts';

/** path 為 ':memory:' 時是全新的記憶體資料庫；否則開啟（或建立）該檔案。 */
export function openNodeDatabase(path: string): Database {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');

  const queryable: Queryable = {
    async exec(sql) {
      sqlite.exec(sql);
    },
    async run(sql, params = []) {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      // node:sqlite 回傳無原型物件，轉成普通物件，與 expo-sqlite 行為一致。
      return sqlite.prepare(sql).all(...params).map((row) => ({ ...row })) as T[];
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      const row = sqlite.prepare(sql).get(...params);
      return row ? ({ ...row } as T) : null;
    },
  };

  return {
    ...queryable,
    async transaction<T>(task: (tx: Queryable) => Promise<T>) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await task(queryable);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      sqlite.close();
    },
  };
}
