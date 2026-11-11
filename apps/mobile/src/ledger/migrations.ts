import type { Migration } from '../db/migrate.ts';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults.ts';
import { BACKUP_APPLICATION_ID } from './backup.ts';

// 帳本的結構遷移。金額為新台幣整數（INTEGER），日期為台北時間的 YYYY-MM-DD 字串（TEXT）。
export const ledgerMigrations: readonly Migration[] = [
  {
    version: 1,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL CHECK (kind IN ('cash','bank','credit_card','e_wallet')),
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          flow TEXT NOT NULL CHECK (flow IN ('expense','income')),
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE transactions (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          category_id INTEGER NOT NULL REFERENCES categories(id),
          account_id INTEGER NOT NULL REFERENCES accounts(id),
          flow TEXT NOT NULL CHECK (flow IN ('expense','income')),
          amount INTEGER NOT NULL CHECK (amount > 0),
          note TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX transactions_by_date ON transactions(date);
      `);
      for (const [i, a] of DEFAULT_ACCOUNTS.entries()) {
        await tx.run('INSERT INTO accounts (name, kind, sort_order) VALUES (?, ?, ?)', [a.name, a.kind, i]);
      }
      for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
        await tx.run('INSERT INTO categories (name, flow, sort_order) VALUES (?, ?, ?)', [c.name, c.flow, i]);
      }
    },
  },
  {
    // 財務文件（ADR 0005）：整份預算狀態存成一份帶版本號的 JSON。單一帳本只有一列（id 固定為 1）；
    // 還沒有任何預算指令或匯入時沒有這一列，讀取時視為空狀態。document 內容沿用舊系統
    // 財務文件的 JSON 格式（PascalCase，見 src/calc/budgetDocument.ts），所以舊帳文件可原樣匯入。
    version: 2,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE finance_document (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          version INTEGER NOT NULL CHECK (version >= 0),
          document TEXT NOT NULL
        );
      `);
    },
  },
  {
    // 成員、帳戶開帳餘額、設定（票 04 舊帳轉換；票 08 帳戶餘額接著用）。
    // - 成員為選填：transactions.member_id 可為 NULL，既有的記帳不需要指定成員。
    // - 開帳日是全域設定（規格「資料模型」：設定＝開帳日、發薪日…），存在 settings（key = 'opening_date'）；
    //   帳戶只有開帳餘額（新台幣整數，信用卡填未繳金額的負數）。是否停用由票 08 新增。
    version: 3,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE members (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ALTER TABLE transactions ADD COLUMN member_id INTEGER REFERENCES members(id);
        ALTER TABLE accounts ADD COLUMN opening_balance INTEGER NOT NULL DEFAULT 0;
      `);
    },
  },
  {
    // 備份檔（票 16）：帳本檔頭寫入識別標記（application_id），並新增 ledger_meta 存最後修改時間、
    // 上次備份時間與另存檔檔名。ledger_meta 不放在 settings，是因為舊帳帶入要求 settings 是空的。
    version: 4,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE ledger_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      // 升級前就有帳的帳本：以升級當下當作最後修改時間（格式同 toISOString），
      // 之後匯入較舊的備份才會警告。全新的帳本不補。
      await tx.exec(`
        INSERT INTO ledger_meta (key, value)
        SELECT 'last_modified_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE EXISTS (SELECT 1 FROM transactions) OR EXISTS (SELECT 1 FROM finance_document);
      `);
      // PRAGMA 不能帶參數；值是程式內的常數。
      await tx.exec(`PRAGMA application_id = ${BACKUP_APPLICATION_ID}`);
    },
  },
  {
    // 票 08 預先分配 v5；v4 可稍後補入，由遷移器逐版記錄，不能只看最高版本跳過。
    version: 5,
    async up(tx) {
      await tx.exec(`
        ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
        CREATE TABLE transfers (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          from_account_id INTEGER NOT NULL REFERENCES accounts(id),
          to_account_id INTEGER NOT NULL REFERENCES accounts(id),
          amount INTEGER NOT NULL CHECK (amount > 0),
          note TEXT NOT NULL DEFAULT '',
          CHECK (from_account_id <> to_account_id)
        );
        CREATE INDEX transfers_by_date ON transfers(date);
      `);
    },
  },
  {
    // 票 12 固定使用 v11；中間預留版本由 schema_migrations 各版獨立判斷。
    version: 11,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE card_statements (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL,
          merchant TEXT NOT NULL,
          amount INTEGER NOT NULL CHECK (amount >= 0),
          account_id INTEGER NOT NULL REFERENCES accounts(id)
        );
        CREATE INDEX card_statements_by_card_date ON card_statements(account_id, date);
      `);
    },
  },
];
