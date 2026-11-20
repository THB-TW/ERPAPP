// 資料庫驅動：帳本服務唯一認得的資料庫介面（執行、查詢、交易）。
// 手機接 expo-sqlite（expoDriver.ts），測試與 Mac 工具接 Node 內建 node:sqlite（nodeDriver.ts）。
// 兩者都是真的 SQLite。這裡只放介面，不放任何實作細節。

/** SQLite 參數與結果只用字串、整數與 null；金額為新台幣整數，不用浮點。 */
export type SqlValue = string | number | null;

export interface Queryable {
  /** 執行一段不帶參數的 SQL（可含多個語句），例如建表。 */
  exec(sql: string): Promise<void>;
  /** 執行單一寫入語句。 */
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  /** 查詢全部列。 */
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** 查詢第一列，沒有則為 null。 */
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
}

export interface Database extends Queryable {
  /**
   * 在一個資料庫交易內執行 task：task 正常結束就提交，丟出例外就整筆還原並把例外往外丟。
   * 同一個 Database 不可巢狀呼叫；帳本服務自己負責序列化，確保交易期間沒有別的查詢插進來。
   */
  transaction<T>(task: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
