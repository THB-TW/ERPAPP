import type { Migration } from '../db/migrate.ts';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './defaults.ts';

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
];
