// 開檔前先看一下：這個 SQLite 檔是不是 App 的帳本。不改動任何東西；不假設資料表的完整清單（之後的遷移會新增），
// 只認「結構版本不為 0、且有帳本最核心的幾張表」。
import type { Queryable } from '../db/driver.ts';
import { ledgerMigrations } from './migrations.ts';

export type LedgerFileCheck =
  | { ok: true }
  /** empty＝結構版本 0 且沒有任何資料表（空檔）；not_ledger＝有別的內容但不是帳本；too_new＝比這版 App 新；not_sqlite＝根本不是 SQLite 檔。 */
  | { ok: false; reason: 'empty' | 'not_ledger' | 'too_new' | 'not_sqlite' };

const CORE_TABLES = ['accounts', 'categories', 'transactions', 'finance_document'];

export async function inspectLedgerFile(db: Queryable): Promise<LedgerFileCheck> {
  try {
    const version = (await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    const names = new Set((await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name));
    if (version === 0 && names.size === 0) return { ok: false, reason: 'empty' };
    if (version === 0 || !CORE_TABLES.every((t) => names.has(t))) return { ok: false, reason: 'not_ledger' };
    if (version > (ledgerMigrations.at(-1)?.version ?? 0)) return { ok: false, reason: 'too_new' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'not_sqlite' };
  }
}
