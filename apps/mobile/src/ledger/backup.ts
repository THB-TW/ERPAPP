// 備份檔匯出與匯入還原（票 16）。只經由帳本服務使用。
//
// 備份檔格式：就是一個完整的帳本 SQLite 檔（用 SQLite 的 VACUUM INTO 產生一致的單一檔案，
// 不直接複製日誌檔），帶三樣東西：
// - 識別標記：SQLite 檔頭的 application_id = BACKUP_APPLICATION_ID（由遷移 v4 寫入，所以帳本檔本身
//   與舊帳轉換程式的輸出也都帶著它）。
// - 結構版本：PRAGMA user_version，與帳本遷移版本同一個號碼。
// - 時間：ledger_meta 表的 last_modified_at（帳本最後一次有資料變動）與 last_backup_at（匯出時間）。
// 匯入＝整本取代、不合併：先把目前的帳另存一份（同樣是合格的備份檔），再在單一資料庫交易內把每個
// 資料表換成備份的內容。
import type { Database, Queryable } from '../db/driver.ts';
import { migrate, type Migration } from '../db/migrate.ts';
import { LedgerError } from './errors.ts';

/** 備份檔識別標記：SQLite application_id，ASCII「ERPA」。改了舊備份就全部認不得，不可更動。 */
export const BACKUP_APPLICATION_ID = 0x45525041;

/** 平台提供的檔案能力。路徑是一般檔案系統路徑（不是 file:// 網址）。 */
export interface BackupFiles {
  /** 放「取代前另存」與還原暫存檔的資料夾；要在會被 iCloud 裝置備份的位置，不放快取或暫存目錄。 */
  directory: string;
  /** 開啟（或建立）一個 SQLite 檔。 */
  open(path: string): Promise<Database>;
  /** 刪除一個 SQLite 檔（還原用的暫存檔）；檔案不存在不算錯。 */
  remove(path: string): Promise<void>;
}

export interface BackupStatus {
  /** 上次匯出備份檔的時間（ISO 8601，UTC）；從沒備份過為 null。 */
  lastBackupAt: string | null;
  /** 帳本最後一次有資料變動的時間；還沒有任何變動為 null。 */
  lastModifiedAt: string | null;
}

export interface BackupInspection {
  schemaVersion: number;
  lastModifiedAt: string | null;
  exportedAt: string | null;
  /** 備份的最後修改時間比目前的帳舊：匯入前要先警告使用者。 */
  olderThanCurrent: boolean;
}

export interface RestoreResult {
  /** 取代前把原本的帳另存的檔案；可以再用 restoreBackup 復原。 */
  safetyCopyPath: string;
  schemaVersion: number;
}

const LAST_MODIFIED = 'last_modified_at';
const LAST_BACKUP = 'last_backup_at';

const NOT_A_BACKUP = '這個檔案不是這個 App 的備份檔，無法匯入。請選擇用「匯出備份檔」產生的檔案。';

export const ledgerMetaMigration: Migration['up'] = async (tx) => {
  await tx.exec(`
    CREATE TABLE ledger_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // PRAGMA 不能帶參數；值是程式內的常數。
  await tx.exec(`PRAGMA application_id = ${BACKUP_APPLICATION_ID}`);
};

async function readMeta(q: Queryable, key: string): Promise<string | null> {
  return (await q.get<{ value: string }>('SELECT value FROM ledger_meta WHERE key = ?', [key]))?.value ?? null;
}

async function writeMeta(q: Queryable, key: string, value: string): Promise<void> {
  await q.run(
    'INSERT INTO ledger_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

async function deleteMeta(q: Queryable, key: string): Promise<void> {
  await q.run('DELETE FROM ledger_meta WHERE key = ?', [key]);
}

/**
 * 包一層資料庫：每個交易結束前，若這個交易真的改了資料（total_changes 有變），就在同一個交易內
 * 記下最後修改時間。帳本服務的寫入全部走 transaction，所以之後新增的指令也自動算進來。
 */
export function trackModifications(db: Database, now: () => Date): Database {
  const totalChanges = async (q: Queryable) => (await q.get<{ n: number }>('SELECT total_changes() AS n'))?.n ?? 0;
  return {
    ...db,
    transaction: (task) =>
      db.transaction(async (tx) => {
        const before = await totalChanges(tx);
        const result = await task(tx);
        if ((await totalChanges(tx)) !== before) await writeMeta(tx, LAST_MODIFIED, now().toISOString());
        return result;
      }),
  };
}

export async function backupStatus(q: Queryable): Promise<BackupStatus> {
  return { lastBackupAt: await readMeta(q, LAST_BACKUP), lastModifiedAt: await readMeta(q, LAST_MODIFIED) };
}

function filesOrThrow(files: BackupFiles | undefined): BackupFiles {
  if (!files) throw new LedgerError('backup_unavailable', '這個環境沒有可存放備份檔的位置，無法使用備份功能。');
  return files;
}

function inDirectory(files: BackupFiles, name: string): string {
  return `${files.directory.replace(/\/+$/, '')}/${name}`;
}

function fileStamp(now: Date): string {
  const unique = Math.random().toString(36).slice(2, 8);
  return `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${unique}`;
}

/** 把整本帳寫成 path（不可已存在），並記下上次備份時間。記錄備份時間不算帳本變動。 */
export async function exportBackupFile(db: Database, files: BackupFiles | undefined, path: string, now: Date) {
  filesOrThrow(files);
  const exportedAt = now.toISOString();
  const previous = await readMeta(db, LAST_BACKUP);
  // 先寫進帳本，備份檔裡就帶著自己的匯出時間；匯出失敗再改回去。
  await db.transaction((tx) => writeMeta(tx, LAST_BACKUP, exportedAt));
  try {
    await db.run('VACUUM INTO ?', [path]);
  } catch (e) {
    await db.transaction((tx) => (previous === null ? deleteMeta(tx, LAST_BACKUP) : writeMeta(tx, LAST_BACKUP, previous)));
    const reason = e instanceof Error ? e.message : String(e);
    throw new LedgerError('backup_failed', `備份檔沒有產生（${reason}）。請換一個檔名或位置再試一次。`);
  }
  return { path, exportedAt };
}

/** 驗證識別標記、結構版本與完整性，讀出備份的時間。不改動檔案。 */
export async function inspectBackupFile(
  files: BackupFiles | undefined,
  path: string,
  supportedVersion: number,
  currentLastModified: string | null,
): Promise<BackupInspection> {
  const available = filesOrThrow(files);
  let db: Database;
  try {
    db = await available.open(path);
  } catch {
    throw new LedgerError('invalid_backup', NOT_A_BACKUP);
  }
  try {
    let applicationId: number | undefined;
    let schemaVersion = 0;
    try {
      applicationId = (await db.get<{ application_id: number }>('PRAGMA application_id'))?.application_id;
      schemaVersion = (await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    } catch {
      throw new LedgerError('invalid_backup', NOT_A_BACKUP);
    }
    if (applicationId !== BACKUP_APPLICATION_ID) throw new LedgerError('invalid_backup', NOT_A_BACKUP);
    if (schemaVersion > supportedVersion) {
      throw new LedgerError(
        'backup_too_new',
        `這份備份是較新版本的 App 產生的（結構版本 ${schemaVersion}，這個 App 支援到 ${supportedVersion}），請先更新 App 再匯入。`,
      );
    }
    let lastModifiedAt: string | null;
    let exportedAt: string | null;
    try {
      const integrity = await db.all<{ integrity_check: string }>('PRAGMA integrity_check');
      const brokenLinks = await db.all('PRAGMA foreign_key_check');
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || brokenLinks.length > 0) throw new Error('corrupt');
      lastModifiedAt = await readMeta(db, LAST_MODIFIED);
      exportedAt = await readMeta(db, LAST_BACKUP);
    } catch {
      throw new LedgerError('backup_corrupt', '這份備份檔已損毀或內容不完整（完整性檢查沒有通過），無法匯入。');
    }
    const olderThanCurrent = currentLastModified !== null && (lastModifiedAt === null || lastModifiedAt < currentLastModified);
    return { schemaVersion, lastModifiedAt, exportedAt, olderThanCurrent };
  } finally {
    await db.close();
  }
}

/**
 * 整本取代。呼叫端（帳本服務）保證期間沒有別的查詢插進來。
 * 使用者選的檔案不會被改動：先複製成暫存檔，較舊的結構只在暫存檔上遷移。
 */
export async function restoreBackupFile(
  db: Database,
  files: BackupFiles | undefined,
  path: string,
  migrations: readonly Migration[],
  options: { allowOlder?: boolean },
  now: Date,
): Promise<RestoreResult> {
  const available = filesOrThrow(files);
  const current = await readMeta(db, LAST_MODIFIED);
  const info = await inspectBackupFile(available, path, migrations.length, current);
  if (info.olderThanCurrent && !options.allowOlder) {
    throw new LedgerError(
      'backup_older',
      `要匯入的備份（最後修改 ${info.lastModifiedAt ?? '不明'}）比手機上的帳（${current}）舊，匯入會蓋掉之後記的帳。確定要匯入嗎？`,
    );
  }

  const stamp = fileStamp(now);
  const staging = inDirectory(available, `restore-staging-${stamp}.db`);
  const safetyCopyPath = inDirectory(available, `before-restore-${stamp}.db`);

  // 1. 暫存複本：在複本上遷移，使用者的原檔不動
  const incoming = await available.open(path);
  try {
    await incoming.run('VACUUM INTO ?', [staging]);
  } finally {
    await incoming.close();
  }
  try {
    if (info.schemaVersion < migrations.length) {
      const staged = await available.open(staging);
      try {
        await migrate(staged, migrations);
      } finally {
        await staged.close();
      }
    }

    // 2. 取代前另存：目前的帳本身就是合格的備份檔
    await db.run('VACUUM INTO ?', [safetyCopyPath]);

    // 3. 單一交易內整本取代（外鍵延到提交時才檢查）
    await db.run('ATTACH DATABASE ? AS incoming', [staging]);
    try {
      await db.transaction(async (tx) => {
        await tx.exec('PRAGMA defer_foreign_keys = ON');
        const tables = await tx.all<{ name: string }>(
          "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        );
        const incomingTables = await tx.all<{ name: string }>(
          "SELECT name FROM incoming.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        );
        if (JSON.stringify(tables) !== JSON.stringify(incomingTables)) {
          throw new LedgerError('backup_corrupt', '這份備份的資料表與這個 App 的帳本不一致，無法匯入。');
        }
        for (const { name } of tables) {
          const quoted = `"${name.replace(/"/g, '""')}"`;
          const columns = (await tx.all<{ name: string }>(`PRAGMA main.table_info(${quoted})`)).map((c) => c.name);
          const incomingColumns = (await tx.all<{ name: string }>(`PRAGMA incoming.table_info(${quoted})`)).map((c) => c.name);
          if (JSON.stringify(columns) !== JSON.stringify(incomingColumns)) {
            throw new LedgerError('backup_corrupt', '這份備份的資料表與這個 App 的帳本不一致，無法匯入。');
          }
          const list = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
          await tx.run(`DELETE FROM main.${quoted}`);
          await tx.run(`INSERT INTO main.${quoted} (${list}) SELECT ${list} FROM incoming.${quoted}`);
        }
      });
    } finally {
      await db.run('DETACH DATABASE incoming');
    }
  } finally {
    await available.remove(staging);
  }
  return { safetyCopyPath, schemaVersion: info.schemaVersion };
}
