// expo-sqlite 的驅動，手機上使用。
//
// 資料庫檔位置：不指定 directory，用 expo-sqlite 的 defaultDatabaseDirectory。
// 依 expo-sqlite SDK 58 原始碼（ios/SQLiteModule.swift），iOS 預設是「應用程式文件目錄 Documents」
// 底下的 SQLite 資料夾（只有 Apple TV 才改放 caches）。Documents 屬於 iCloud 裝置備份的範圍，
// 所以預設位置符合「會被 iCloud 裝置備份」。請勿改放 Caches 或 tmp，也不要設成不備份的屬性。
// 還原後資料庫是否完整，必須在真機實測（規格列為不能在雲端驗證的項目）。
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { Database, Queryable, SqlValue } from './driver.ts';

function wrap(sqlite: SQLiteDatabase): Queryable {
  return {
    async exec(sql) {
      await sqlite.execAsync(sql);
    },
    async run(sql, params = []) {
      const result = await sqlite.runAsync(sql, params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return sqlite.getAllAsync<T>(sql, params);
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      return sqlite.getFirstAsync<T>(sql, params);
    },
  };
}

export async function openExpoDatabase(name: string): Promise<Database> {
  const sqlite = await openDatabaseAsync(name);
  await sqlite.execAsync('PRAGMA foreign_keys = ON');
  const queryable = wrap(sqlite);
  return {
    ...queryable,
    async transaction<T>(task: (tx: Queryable) => Promise<T>) {
      // withTransactionAsync 會把交易期間別處發出的查詢也算進交易；
      // 帳本服務會序列化所有操作，所以這裡不會有別的查詢插進來。
      let result!: T;
      await sqlite.withTransactionAsync(async () => {
        result = await task(queryable);
      });
      return result;
    },
    async close() {
      await sqlite.closeAsync();
    },
  };
}
