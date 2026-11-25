// 帳本清單（ADR 0008，2026-11-25 翰陞定案）：App 可以有多個帳本，每本是一個獨立的帳本資料庫檔，
// 帳本服務（openLedger）照舊只管一本。這一層負責：
// - 帳本清單（名稱、順序、檔名）與目前帳本，存在同資料夾的 library.db；
// - 全 App 共用的設定：上次備份時間、記帳提醒與兩種備份提醒；
// - 備份包：一個檔案裝全部帳本，匯入時整包取代；舊的單本備份檔也能匯入（匯入後只剩那一本）。
//
// 既有使用者第一次開啟時，原本的 ledger.db 直接成為第一本，不搬動、不改內容。
import type { Database } from '../db/driver.ts';
import { migrate, type Migration } from '../db/migrate.ts';
import { BACKUP_APPLICATION_ID, inspectBackupFile, type BackupFiles } from './backup.ts';
import { LedgerError } from './errors.ts';
import { openLedger, type Ledger } from './index.ts';
import { ledgerMigrations } from './migrations.ts';

/** 備份包識別標記：SQLite application_id，ASCII「ERPB」。不可更動。 */
export const BUNDLE_APPLICATION_ID = 0x45525042;
/** 備份包格式版本（PRAGMA user_version）。 */
const BUNDLE_FORMAT = 1;
export const MAX_LEDGERS = 10;
export const FIRST_LEDGER_FILE = 'ledger.db';
const LIBRARY_FILE = 'library.db';
const DEFAULT_FIRST_NAME = '我的帳本';
const NAME_MAX = 20;

/** 平台提供的檔案能力：在 BackupFiles 之外，再加讀寫整個檔案的位元組（備份包裡的每本帳）。 */
export interface LibraryFiles extends BackupFiles {
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
}

export interface LedgerEntry { id: number; name: string }

/** 全 App 共用的提醒；其餘提醒（月結、信用卡、貸款、超支）屬於各帳本。 */
export interface GlobalReminders { entry: boolean; entryTime: string; backupAfterClose: boolean; backupOverdue: boolean }

/** 給通知排程用：取代帳本自己的記帳／備份提醒設定與上次備份時間。 */
export interface NotificationGlobals extends GlobalReminders {
  lastBackupAt: string | null;
  /** 從沒備份過時，35 天由此起算。 */
  backupStartedAt: string | null;
}

export interface LibraryBackupStatus {
  lastBackupAt: string | null;
  /** 全部帳本裡最晚的一次資料變動。 */
  lastModifiedAt: string | null;
}

export interface BundleInspection {
  /** bundle：備份包（全部帳本）；single：舊版的單本備份檔。 */
  format: 'bundle' | 'single';
  ledgerNames: string[];
  exportedAt: string | null;
  lastModifiedAt: string | null;
  /** 備份比手機上的帳舊：匯入前要先警告。 */
  olderThanCurrent: boolean;
}

export interface LedgerLibrary {
  listLedgers(): Promise<LedgerEntry[]>;
  currentLedgerId(): number;
  /** 目前帳本；切換後要重新取得。 */
  current(): Ledger;
  switchLedger(id: number): Promise<Ledger>;
  /** 新增一本（預設分類與帳戶，尚未開帳）；不會自動切換。 */
  addLedger(name: string): Promise<LedgerEntry>;
  renameLedger(id: number, name: string): Promise<void>;
  /** 依傳入順序排列；必須剛好是全部帳本。 */
  reorderLedgers(ids: number[]): Promise<void>;
  /** 刪除一本（連同檔案）；最後一本不能刪。刪的是目前帳本時先切到清單第一本。 */
  deleteLedger(id: number): Promise<void>;

  getBackupStatus(): Promise<LibraryBackupStatus>;
  /** 把全部帳本寫成 path 的備份包（不覆寫既有檔案）。上次備份時間等 recordBackupDelivered 才記。 */
  exportBackup(path: string): Promise<{ path: string; exportedAt: string }>;
  recordBackupDelivered(exportedAt: string): Promise<void>;
  inspectBackup(path: string): Promise<BundleInspection>;
  /** 整包取代全部帳本；之後目前帳本是第一本。 */
  restoreBackup(path: string, options?: { allowOlder?: boolean }): Promise<{ ledgers: number }>;

  getReminders(): Promise<GlobalReminders>;
  saveReminders(reminders: GlobalReminders): Promise<void>;
  getNotificationGlobals(): Promise<NotificationGlobals>;
  close(): Promise<void>;
}

export interface LibraryOptions {
  /** directory 是帳本檔與 library.db 所在的資料夾（手機上會被 iCloud 裝置備份）。 */
  files: LibraryFiles;
  now?: () => Date;
  /** 只給測試用。 */
  migrations?: readonly Migration[];
}

const libraryMigrations: readonly Migration[] = [
  {
    version: 1,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE ledgers (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          file TEXT NOT NULL UNIQUE,
          position INTEGER NOT NULL
        );
        CREATE TABLE library_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `);
    },
  },
];

const NOT_A_BACKUP = '這個檔案不是這個 App 的備份檔，無法匯入。請選擇用「匯出備份檔」產生的檔案。';
const CURRENT = 'current_ledger_id';
const LAST_BACKUP = 'last_backup_at';
const BACKUP_STARTED = 'backup_started_at';
const REMINDERS = 'reminders';
const DEFAULT_REMINDERS: GlobalReminders = { entry: false, entryTime: '21:00', backupAfterClose: false, backupOverdue: false };

function bad(code: 'invalid_ledger_name' | 'ledger_name_conflict' | 'ledger_limit' | 'last_ledger' | 'unknown_ledger', message: string): never {
  throw new LedgerError(code, message);
}

function validName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) bad('invalid_ledger_name', '請輸入帳本名稱。');
  const name = (value as string).trim();
  if (Array.from(name).length > NAME_MAX) bad('invalid_ledger_name', `帳本名稱最多 ${NAME_MAX} 個字。`);
  return name;
}

function validReminders(input: GlobalReminders): GlobalReminders {
  if (!input || typeof input.entryTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.entryTime)) {
    throw new LedgerError('invalid_date', '記帳提醒時間格式不正確。');
  }
  return { entry: input.entry === true, entryTime: input.entryTime, backupAfterClose: input.backupAfterClose === true, backupOverdue: input.backupOverdue === true };
}

const latest = (values: (string | null)[]) => values.filter((v): v is string => v !== null).sort().at(-1) ?? null;

export async function openLedgerLibrary(options: LibraryOptions): Promise<LedgerLibrary> {
  const { files } = options;
  const now = options.now ?? (() => new Date());
  const migrations = options.migrations ?? ledgerMigrations;
  const pathOf = (name: string) => `${files.directory.replace(/\/+$/, '')}/${name}`;
  let sequence = 0;
  const freshFile = (prefix: string) => `${prefix}-${now().toISOString().replace(/[-:.]/g, '')}-${++sequence}.db`;
  const openFile = async (file: string) => openLedger(await files.open(pathOf(file)), { now, backupFiles: files, migrations });

  const lib: Database = await files.open(pathOf(LIBRARY_FILE));
  await migrate(lib, libraryMigrations);
  const meta = async (key: string) => (await lib.get<{ value: string }>('SELECT value FROM library_meta WHERE key = ?', [key]))?.value ?? null;
  const setMeta = (q: Pick<Database, 'run'>, key: string, value: string) =>
    q.run('INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  const rows = () => lib.all<{ id: number; name: string; file: string }>('SELECT id, name, file FROM ledgers ORDER BY position, id');

  // 第一次開啟：既有的 ledger.db 成為第一本，並把它的記帳／備份提醒與上次備份時間搬成全 App 共用。
  if ((await rows()).length === 0) {
    const first = await files.open(pathOf(FIRST_LEDGER_FILE));
    const ledger = await openLedger(first, { now, backupFiles: files, migrations });
    const settings = await ledger.getNotificationSettings();
    const status = await ledger.getBackupStatus();
    const started = (await first.get<{ value: string }>("SELECT value FROM settings WHERE key = 'notification_backup_started_at'"))?.value ?? null;
    await ledger.close();
    await lib.transaction(async (tx) => {
      const { lastInsertRowId } = await tx.run('INSERT INTO ledgers (name, file, position) VALUES (?, ?, 0)', [DEFAULT_FIRST_NAME, FIRST_LEDGER_FILE]);
      await setMeta(tx, CURRENT, String(lastInsertRowId));
      await setMeta(tx, REMINDERS, JSON.stringify({ entry: settings.enabled.entry, entryTime: settings.entryTime,
        backupAfterClose: settings.enabled.backupAfterClose, backupOverdue: settings.enabled.backupOverdue }));
      if (status.lastBackupAt) await setMeta(tx, LAST_BACKUP, status.lastBackupAt);
      if (started) await setMeta(tx, BACKUP_STARTED, started);
    });
  }

  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  async function entry(id: number) {
    const row = (await rows()).find((r) => r.id === id);
    if (!row) bad('unknown_ledger', '找不到這個帳本。');
    return row!;
  }

  const all = await rows();
  let currentId = Number(await meta(CURRENT));
  if (!all.some((r) => r.id === currentId)) currentId = all[0].id;
  let currentLedger = await openFile((await entry(currentId)).file);

  async function switchTo(id: number): Promise<Ledger> {
    const row = await entry(id);
    if (id === currentId) return currentLedger;
    const next = await openFile(row.file);
    await currentLedger.close();
    currentLedger = next;
    currentId = id;
    await setMeta(lib, CURRENT, String(id));
    return next;
  }

  /** 逐本讀資料（非目前帳本暫時開啟再關閉）。 */
  async function eachLedger<T>(work: (ledger: Ledger, row: { id: number; name: string; file: string }) => Promise<T>): Promise<T[]> {
    const results: T[] = [];
    for (const row of await rows()) {
      if (row.id === currentId) { results.push(await work(currentLedger, row)); continue; }
      const ledger = await openFile(row.file);
      try { results.push(await work(ledger, row)); } finally { await ledger.close(); }
    }
    return results;
  }

  async function currentLastModified(): Promise<string | null> {
    return latest(await eachLedger(async (l) => (await l.getBackupStatus()).lastModifiedAt));
  }

  async function nameIsFree(name: string, exceptId?: number) {
    const clash = await lib.get<{ id: number }>('SELECT id FROM ledgers WHERE name = ? COLLATE NOCASE', [name]);
    if (clash && clash.id !== exceptId) bad('ledger_name_conflict', '已經有同名的帳本，請換一個名稱。');
  }

  async function inspect(path: string): Promise<BundleInspection> {
    const supported = migrations.at(-1)?.version ?? 0;
    const current = await currentLastModified();
    let applicationId: number | undefined;
    let db: Database | null = null;
    try {
      db = await files.open(path);
      applicationId = (await db.get<{ application_id: number }>('PRAGMA application_id'))?.application_id;
    } catch {
      if (db) await db.close().catch(() => undefined);
      throw new LedgerError('invalid_backup', NOT_A_BACKUP);
    }
    if (applicationId === BACKUP_APPLICATION_ID) {
      await db.close();
      const info = await inspectBackupFile(files, path, supported, current);
      const first = (await rows())[0];
      return { format: 'single', ledgerNames: [first.name], exportedAt: info.exportedAt, lastModifiedAt: info.lastModifiedAt, olderThanCurrent: info.olderThanCurrent };
    }
    try {
      if (applicationId !== BUNDLE_APPLICATION_ID) throw new LedgerError('invalid_backup', NOT_A_BACKUP);
      const format = (await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
      if (format > BUNDLE_FORMAT) throw new LedgerError('backup_too_new', '這份備份是較新版本的 App 產生的，請先更新 App 再匯入。');
      let parts: { name: string; data: Uint8Array }[];
      let bundleMeta: Map<string, string>;
      try {
        const integrity = await db.all<{ integrity_check: string }>('PRAGMA integrity_check');
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('corrupt');
        parts = await db.all<{ name: string; data: Uint8Array }>('SELECT name, data FROM bundle_ledgers ORDER BY position');
        bundleMeta = new Map((await db.all<{ key: string; value: string }>('SELECT key, value FROM bundle_meta')).map((r) => [r.key, r.value]));
        if (parts.length === 0 || parts.length > MAX_LEDGERS) throw new Error('corrupt');
      } catch {
        throw new LedgerError('backup_corrupt', '這份備份檔已損毀或內容不完整（完整性檢查沒有通過），無法匯入。');
      }
      // 每一本都要通過帳本備份的檢查（識別標記、結構版本、完整性）。
      for (const part of parts) {
        const temp = pathOf(freshFile('inspect'));
        try {
          await files.writeBytes(temp, part.data);
          await inspectBackupFile(files, temp, supported, null);
        } finally {
          await files.remove(temp).catch(() => undefined);
        }
      }
      const lastModifiedAt = bundleMeta.get('last_modified_at') ?? null;
      return {
        format: 'bundle', ledgerNames: parts.map((p) => p.name), exportedAt: bundleMeta.get('exported_at') ?? null, lastModifiedAt,
        olderThanCurrent: current !== null && (lastModifiedAt === null || lastModifiedAt < current),
      };
    } finally {
      await db.close().catch(() => undefined);
    }
  }

  async function exportBundle(path: string) {
    const exportedAt = now().toISOString();
    const staging = pathOf(freshFile('bundle-staging'));
    const parts: { name: string; data: Uint8Array; modified: string | null }[] = [];
    try {
      await eachLedger(async (ledger, row) => {
        const temp = pathOf(freshFile('bundle-part'));
        try {
          await ledger.exportBackup(temp);
          parts.push({ name: row.name, data: await files.readBytes(temp), modified: (await ledger.getBackupStatus()).lastModifiedAt });
        } finally {
          await files.remove(temp).catch(() => undefined);
        }
      });
      const bundle = await files.open(staging);
      try {
        await bundle.exec(`PRAGMA application_id = ${BUNDLE_APPLICATION_ID}; PRAGMA user_version = ${BUNDLE_FORMAT};
          CREATE TABLE bundle_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE bundle_ledgers (position INTEGER PRIMARY KEY, name TEXT NOT NULL, data BLOB NOT NULL);`);
        await bundle.transaction(async (tx) => {
          await tx.run("INSERT INTO bundle_meta (key, value) VALUES ('exported_at', ?)", [exportedAt]);
          const modified = latest(parts.map((p) => p.modified));
          if (modified) await tx.run("INSERT INTO bundle_meta (key, value) VALUES ('last_modified_at', ?)", [modified]);
          for (const [i, p] of parts.entries()) await tx.run('INSERT INTO bundle_ledgers (position, name, data) VALUES (?, ?, ?)', [i, p.name, p.data]);
        });
        try {
          await bundle.run('VACUUM INTO ?', [path]); // 目標已存在會失敗；那不是我們的檔案，不刪
        } catch (e) {
          throw new LedgerError('backup_failed', `備份檔沒有產生（${e instanceof Error ? e.message : String(e)}）。請換一個檔名或位置再試一次。`);
        }
      } finally {
        await bundle.close();
      }
    } finally {
      await files.remove(staging).catch(() => undefined);
    }
    return { path, exportedAt };
  }

  async function restore(path: string, opts: { allowOlder?: boolean }) {
    const info = await inspect(path);
    if (info.olderThanCurrent && !opts.allowOlder) {
      throw new LedgerError('backup_older', '要匯入的備份比手機上的帳舊，匯入會蓋掉備份之後才記的帳。確定要匯入嗎？');
    }
    // 1. 先把每一本寫成新的帳本檔並遷移到目前版本；使用者選的檔案不動。任何一步失敗就清掉新檔，原帳不受影響。
    const created: { name: string; file: string }[] = [];
    try {
      if (info.format === 'single') {
        const file = freshFile('ledger');
        const source = await files.open(path);
        try { await source.run('VACUUM INTO ?', [pathOf(file)]); } finally { await source.close(); }
        created.push({ name: info.ledgerNames[0], file });
      } else {
        const bundle = await files.open(path);
        try {
          for (const part of await bundle.all<{ name: string; data: Uint8Array }>('SELECT name, data FROM bundle_ledgers ORDER BY position')) {
            const file = freshFile('ledger');
            await files.writeBytes(pathOf(file), part.data);
            created.push({ name: part.name, file });
          }
        } finally {
          await bundle.close();
        }
      }
      for (const c of created) await (await openFile(c.file)).close();
    } catch (e) {
      for (const c of created) await files.remove(pathOf(c.file)).catch(() => undefined);
      throw e;
    }
    // 2. 換清單（單一交易），再關掉舊帳、刪舊檔。
    const old = await rows();
    await currentLedger.close();
    let firstId = 0;
    await lib.transaction(async (tx) => {
      await tx.run('DELETE FROM ledgers');
      for (const [i, c] of created.entries()) {
        const { lastInsertRowId } = await tx.run('INSERT INTO ledgers (name, file, position) VALUES (?, ?, ?)', [c.name, c.file, i]);
        if (i === 0) firstId = lastInsertRowId;
      }
      await setMeta(tx, CURRENT, String(firstId));
    });
    currentId = firstId;
    currentLedger = await openFile(created[0].file);
    for (const row of old) await files.remove(pathOf(row.file)).catch(() => undefined);
    return { ledgers: created.length };
  }

  async function reminders(): Promise<GlobalReminders> {
    const saved = await meta(REMINDERS);
    return saved ? { ...DEFAULT_REMINDERS, ...JSON.parse(saved) } : DEFAULT_REMINDERS;
  }

  return {
    listLedgers: () => serial(async () => (await rows()).map(({ id, name }) => ({ id, name }))),
    currentLedgerId: () => currentId,
    current: () => currentLedger,
    switchLedger: (id) => serial(() => switchTo(id)),
    addLedger: (input) => serial(async () => {
      const name = validName(input);
      if ((await rows()).length >= MAX_LEDGERS) bad('ledger_limit', `最多 ${MAX_LEDGERS} 個帳本。`);
      await nameIsFree(name);
      const file = freshFile('ledger');
      await (await openFile(file)).close(); // 建立帳本檔：遷移並放入預設分類與帳戶
      const top = await lib.get<{ top: number | null }>('SELECT MAX(position) AS top FROM ledgers');
      const { lastInsertRowId } = await lib.run('INSERT INTO ledgers (name, file, position) VALUES (?, ?, ?)', [name, file, (top?.top ?? -1) + 1]);
      return { id: lastInsertRowId, name };
    }),
    renameLedger: (id, input) => serial(async () => {
      await entry(id);
      const name = validName(input);
      await nameIsFree(name, id);
      await lib.run('UPDATE ledgers SET name = ? WHERE id = ?', [name, id]);
    }),
    reorderLedgers: (ids) => serial(async () => {
      const existing = (await rows()).map((r) => r.id);
      if (ids.length !== existing.length || [...ids].sort((a, b) => a - b).join() !== [...existing].sort((a, b) => a - b).join()) {
        bad('unknown_ledger', '帳本順序不完整，請重新整理後再試。');
      }
      await lib.transaction(async (tx) => {
        for (const [i, id] of ids.entries()) await tx.run('UPDATE ledgers SET position = ? WHERE id = ?', [i, id]);
      });
    }),
    deleteLedger: (id) => serial(async () => {
      const row = await entry(id);
      const all = await rows();
      if (all.length === 1) bad('last_ledger', '至少要留一個帳本，最後一個帳本不能刪除。');
      if (id === currentId) await switchTo(all.find((r) => r.id !== id)!.id);
      await lib.run('DELETE FROM ledgers WHERE id = ?', [id]);
      await files.remove(pathOf(row.file)).catch(() => undefined);
    }),

    getBackupStatus: () => serial(async () => ({ lastBackupAt: await meta(LAST_BACKUP), lastModifiedAt: await currentLastModified() })),
    exportBackup: (path) => serial(() => exportBundle(path)),
    recordBackupDelivered: (exportedAt) => serial(async () => {
      const time = typeof exportedAt === 'string' ? Date.parse(exportedAt) : Number.NaN;
      if (Number.isNaN(time)) throw new LedgerError('invalid_date', '備份時間格式不正確。');
      await setMeta(lib, LAST_BACKUP, new Date(time).toISOString());
    }),
    inspectBackup: (path) => serial(() => inspect(path)),
    restoreBackup: (path, opts = {}) => serial(() => restore(path, opts)),

    getReminders: () => serial(reminders),
    saveReminders: (input) => serial(async () => {
      const valid = validReminders(input);
      await lib.transaction(async (tx) => {
        await setMeta(tx, REMINDERS, JSON.stringify(valid));
        await tx.run('INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', [BACKUP_STARTED, now().toISOString()]);
      });
    }),
    getNotificationGlobals: () => serial(async () => ({ ...await reminders(), lastBackupAt: await meta(LAST_BACKUP), backupStartedAt: await meta(BACKUP_STARTED) })),
    close: () => serial(async () => { await currentLedger.close(); await lib.close(); }),
  };
}
