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
];
