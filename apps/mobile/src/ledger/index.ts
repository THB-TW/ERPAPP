// 帳本服務：唯一的測試切入點。畫面只能透過這裡的指令與查詢碰資料。
import type { Database } from '../db/driver.ts';
import { migrate, type Migration } from '../db/migrate.ts';
import { isValidDate, isValidMonth, taipeiDate } from '../calc/dates.ts';
import {
  effectiveRevision,
  mappedBudgetCategory,
  openMonth,
} from '../calc/budgetEngine.ts';
import { serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetCommand, BudgetRevision } from '../calc/budgetTypes.ts';
import { parseImportedDocument, readStoredDocument, replaceDocument } from './financeDocument.ts';
import { budgetFallbackMonth, executeBudgetCommand, type BudgetCommandAccess, type BudgetCommandPreview } from './budgetCommands.ts';
import { getBudgetProgress } from './budgetPage.ts';
import type { BudgetProgress } from './budgetViews.ts';
import { listActiveCategories } from './categoryLifecycle.ts';
import { importLegacy, type LegacyImportData, type LegacyImportResult } from './legacyImport.ts';
import { isMonthClosed } from './monthLock.ts';
import { INVALID_DATE_MESSAGE } from './transactionRules.ts';
import {
  deleteTransaction,
  getTransaction,
  insertTransaction,
  transactionsBetween,
  updateTransaction,
  type DayTransaction,
  type NewTransaction,
  type TransactionDetail,
} from './transactions.ts';
import {
  budgetAdjustments,
  budgetMonth,
  budgetMonths,
  budgetStatus,
  type BudgetAdjustmentView,
  type BudgetMonthSummary,
  type BudgetMonthView,
  type BudgetStatus,
} from './budgetViews.ts';
import { categoryMonthTransactions, monthBreakdown, type MonthBreakdown } from './report.ts';
import type { Flow } from './defaults.ts';
import { accountCommands, type AccountsLedger } from './accounts.ts';
import { transferCommands, type TransfersLedger } from './transfers.ts';
import { LedgerError } from './errors.ts';
import { ledgerMigrations } from './migrations.ts';
import { listAssetChecks, previewAssetCheck, recordAssetCheck, type AssetCheckPreview, type AssetCheckRequest, type AssetCheckRecord, type RecordAssetCheckRequest } from './assetCheck.ts';
export type { AssetCheckPreview, AssetCheckRequest, AssetCheckAccount, AssetCheckMovement, AssetCheckRecord, RecordAssetCheckRequest } from './assetCheck.ts';
import { completeMonthlyClose, monthlyCloseDraft, monthlyCloseSnapshot, previewMonthlyClose, type CompleteMonthlyCloseRequest, type MonthlyCloseDraft, type MonthlyClosePreview, type MonthlyCloseRequest, type MonthlyCloseSnapshot } from './monthlyClose.ts';
import { backupCommands, trackModifications, type BackupFiles, type BackupInspection, type BackupStatus, type RestoreResult } from './backup.ts';
export type { BackupFiles, BackupInspection, BackupStatus, RestoreResult } from './backup.ts';

export type { AccountKind, Flow } from './defaults.ts';
export { LedgerError } from './errors.ts';
export { inspectLedgerFile } from './inspect.ts';
export type { LedgerFileCheck } from './inspect.ts';
export type { LedgerErrorCode } from './errors.ts';
export { BudgetRuleError } from '../calc/budgetEngine.ts';
export type { BudgetCommand, BudgetRevision } from '../calc/budgetTypes.ts';
export type { BudgetCommandAccess, BudgetCommandPreview } from './budgetCommands.ts';
export type { BudgetProgress, BudgetProgressRow } from './budgetViews.ts';
export type {
  BudgetAdjustmentView, BudgetMonthSummary, BudgetMonthView, BudgetReserveView, BudgetStatus,
} from './budgetViews.ts';

export type { CategoryShare, MonthBreakdown } from './report.ts';
export type { CompleteMonthlyCloseRequest, MonthlyCloseDraft, MonthlyClosePreview, MonthlyCloseRequest, MonthlyCloseRow, MonthlyCloseSnapshot } from './monthlyClose.ts';

export interface Category { id: number; name: string; flow: Flow }
export type { Account, AccountBalance, NewAccount, AccountChanges } from './accounts.ts';
export type { NewTransfer, TransferDetail } from './transfers.ts';
export interface Member { id: number; name: string }
export type { LegacyImportData, LegacyImportResult } from './legacyImport.ts';

export type { DayTransaction, NewTransaction, TransactionDetail } from './transactions.ts';

export interface CalendarDay {
  date: string;
  expenseTotal: number;
  incomeTotal: number;
  count: number;
}

export interface MonthCalendar {
  month: string;
  /** 只含當月有帳的日子，依日期由小到大。 */
  days: CalendarDay[];
}

export interface LedgerOptions {
  /** 目前時間。預設為系統時鐘；測試傳固定值。時間由這裡傳給純計算，引擎不讀時鐘。 */
  now?: () => Date;
  /** 備份檔的存放位置與開檔能力（票 16）；沒有接上時備份指令丟 LedgerError('backup_unavailable')。 */
  backupFiles?: BackupFiles;
  /** 只給測試模擬「之後的 App 版本」用；預設為帳本的遷移清單。 */
  migrations?: readonly Migration[];
}

export interface BudgetCommandResult {
  /** 指令執行後的財務文件版本。 */
  version: number;
  /** true 表示這個操作識別碼先前已完成，這次沒有重做。 */
  replayed: boolean;
}

export interface Ledger extends AccountsLedger, TransfersLedger {
  previewAssetCheck(input: AssetCheckRequest): Promise<AssetCheckPreview>;
  recordAssetCheck(input: RecordAssetCheckRequest): Promise<AssetCheckRecord>;
  listAssetChecks(month?: string): Promise<AssetCheckRecord[]>;
  /** 月結精靈的開放月份與唯讀收入；當月尚未結束時不能完成。 */
  getMonthlyCloseDraft(): Promise<MonthlyCloseDraft>;
  /** 讀當月收入並立即試算，不寫入月結或快照。 */
  previewMonthlyClose(input: MonthlyCloseRequest): Promise<MonthlyClosePreview>;
  /** 確認仍與預覽相符才月結；同操作識別碼重送不重做。 */
  completeMonthlyClose(input: CompleteMonthlyCloseRequest): Promise<BudgetCommandResult>;
  /** 已結月份的原始計算與調整後資產；不以現在交易重算歷史。 */
  getMonthlyCloseSnapshot(month: string): Promise<MonthlyCloseSnapshot>;
  getMonthCalendar(month: string): Promise<MonthCalendar>;
  addTransaction(input: NewTransaction): Promise<{ id: number }>;
  /** 修改交易的全部欄位。原日期或新日期落在已結月份都會被拒（month_closed）。 */
  updateTransaction(id: number, input: NewTransaction): Promise<void>;
  /** 刪除交易。已結月份的交易不能刪（month_closed）。 */
  deleteTransaction(id: number): Promise<void>;
  /** 單筆交易（修改表單用）；不存在丟 LedgerError('unknown_transaction')。 */
  getTransaction(id: number): Promise<TransactionDetail>;
  /** 該月是否已月結（含期初基準月）。畫面用來把交易標成鎖定。 */
  isMonthClosed(month: string): Promise<boolean>;
  getDayTransactions(date: string): Promise<DayTransaction[]>;
  /** 預設查開放月份；傳月份可取得當時可選的交易分類（撤銷月結後編輯舊交易使用）。 */
  listCategories(month?: string): Promise<Category[]>;
  listMembers(): Promise<Member[]>;
  /** 全域設定的開帳日（某月 1 號，YYYY-MM-DD）；尚未設定為 null。開帳日以前的交易不計入帳戶餘額（票 08）。 */
  getOpeningDate(): Promise<string | null>;
  /** 日期區間內（含兩端）的全部交易，依日期、編號排序。給讀回核對與匯出用。 */
  listTransactions(from: string, to: string): Promise<DayTransaction[]>;

  // ---- 明細（票 09）----
  /** 該月某收支別的分類彙總與占比（圓餅圖與類別列表）。轉帳不計入。 */
  getMonthBreakdown(month: string, flow: Flow): Promise<MonthBreakdown>;
  /** 某分類在該月的交易，日期新的在前。 */
  getCategoryMonthTransactions(month: string, categoryId: number): Promise<DayTransaction[]>;

  // ---- 預算與月結（票 03）----
  /**
   * 執行一個預算指令（caps、add、edit、map、retire、transfer、fund、correct、reverse、rollback、close）。
   * 在同一個資料庫交易內讀文件、套用引擎、寫回。close 的實支由該月支出交易彙總，當月收入由 command.amount 傳入
   * （保留舊帳工具相容；App 精靈使用 completeMonthlyClose 自動帶入）。被拒時丟 BudgetRuleError 或 LedgerError。
   * App 必須帶入 access.hasEntitlement；App 的 close 寫入請改走已核對的 completeMonthlyClose。
   * 省略 access 只供既有移植測試與舊帳工具相容使用。
   */
  runBudgetCommand(command: BudgetCommand, access?: BudgetCommandAccess): Promise<BudgetCommandResult>;
  /** 僅計算，不寫入；確認時重送相同指令，仍會重新檢查版本與開放月份。 */
  previewBudgetCommand(command: BudgetCommand, access?: BudgetCommandAccess): Promise<BudgetCommandPreview>;
  /** 免費的上限與實支進度；預設為日曆本月，與開放月份分開。 */
  getBudgetProgress(month?: string): Promise<BudgetProgress>;
  /** 完整上限版本與修改原因，依儲存順序列出。 */
  listBudgetRevisions(): Promise<BudgetRevision[]>;
  /** 該月收入交易的合計（票 11 月結精靈用來帶入當月收入）。 */
  getMonthIncome(month: string): Promise<number>;
  getBudgetStatus(): Promise<BudgetStatus>;
  /** 某個已結月份的位置與上限快照；該月未結則丟 LedgerError('month_not_closed')。 */
  getBudgetMonth(month: string): Promise<BudgetMonthView>;
  listBudgetMonths(): Promise<BudgetMonthSummary[]>;
  listBudgetAdjustments(): Promise<BudgetAdjustmentView[]>;
  /** 該月（預設開放月份）有支出、但在生效的上限版本裡沒有有效歸屬的交易分類名稱。 */
  getUnmappedExpenseCategories(month?: string): Promise<string[]>;
  /**
   * 受控的財務文件匯入入口（舊帳轉換程式、備份還原與測試使用）。文件為舊系統格式的 JSON。
   * 已有文件時必須明確指定 replace: true 才會取代；文件內部不一致（例如合計溢位）會被拒。
   */
  importFinanceDocument(document: string, options?: { replace?: boolean }): Promise<{ version: number }>;
  /**
   * 舊帳整批帶入（票 04 轉換程式專用）：交易、財務文件、帳戶、分類、成員在同一個資料庫交易內寫入。
   * 只允許在空帳本（沒有交易、沒有財務文件，分類與帳戶仍是出廠預設）上執行，並取代出廠預設的分類與帳戶。
   * 舊月份以搬遷月份的身分帶入，所以不受已結月份鎖定限制，也不重算；任何一處不合就整批還原。
   */
  importLegacyLedger(data: LegacyImportData): Promise<LegacyImportResult>;
  /** 以舊系統格式輸出目前的財務文件（尚無文件時為空狀態）。 */
  exportFinanceDocument(): Promise<string>;

  // ---- 備份與還原（票 16，免費與到期後都可用）----
  /** 上次備份時間與帳本最後修改時間（ISO 8601，UTC）。 */
  getBackupStatus(): Promise<BackupStatus>;
  /** 把整本帳匯出成 path 的備份檔（不覆寫既有檔案）。上次備份時間要等 recordBackupDelivered 才記。 */
  exportBackup(path: string): Promise<{ path: string; exportedAt: string }>;
  /** 備份檔確定送出（存到檔案、iCloud Drive 或 AirDrop）後，記下上次備份時間；傳 exportBackup 回傳的 exportedAt。 */
  recordBackupDelivered(exportedAt: string): Promise<void>;
  /** 驗證備份檔（識別標記、結構版本、完整性）並讀出時間；不合格丟 LedgerError。 */
  inspectBackup(path: string): Promise<BackupInspection>;
  /**
   * 匯入備份檔：整本取代、不合併。取代前自動另存目前的帳（回傳路徑，可再用來復原）。
   * 備份比目前的帳舊時丟 LedgerError('backup_older')，使用者確認後帶 allowOlder: true 再呼叫。
   */
  restoreBackup(path: string, options?: { allowOlder?: boolean }): Promise<RestoreResult>;

  close(): Promise<void>;
}

const MONTH_MESSAGE = '月份格式不正確，請用 YYYY-MM。';

export async function openLedger(rawDb: Database, options: LedgerOptions = {}): Promise<Ledger> {
  const migrations = options.migrations ?? ledgerMigrations;
  await migrate(rawDb, migrations);
  const now = options.now ?? (() => new Date());
  // 所有寫入交易自動記下帳本最後修改時間（備份檔的「最後修改時間」）；備份指令本身用 rawDb，不算變動。
  const db = trackModifications(rawDb, now);
  const backup = backupCommands(rawDb, options.backupFiles, migrations, now);
  const fallbackMonth = () => budgetFallbackMonth(db, now());

  // 所有指令與查詢排成一條隊：寫入交易進行中，不會有別的查詢插進來（expo-sqlite 的交易會把
  // 同時發出的查詢也算進去）。這也是「已月結月份不得默默改動」之後掛上檢查的唯一入口。
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  return {
    previewAssetCheck: (input) => serial(() => previewAssetCheck(db, input, now())),
    recordAssetCheck: (input) => serial(() => db.transaction((tx) => recordAssetCheck(tx, input, now()))),
    listAssetChecks: (month) => serial(() => listAssetChecks(db, month)),
    getMonthlyCloseDraft: () => serial(() => monthlyCloseDraft(db, now())),
    previewMonthlyClose: (input) => serial(() => previewMonthlyClose(db, input, now())),
    completeMonthlyClose: (input) => serial(() => db.transaction((tx) => completeMonthlyClose(tx, input, now()))),
    getMonthlyCloseSnapshot: (month) => serial(() => monthlyCloseSnapshot(db, month, now())),
    ...accountCommands(db, serial, () => taipeiDate(now())),
    ...transferCommands(db, serial),
    addTransaction: (input) => serial(() => db.transaction((tx) => insertTransaction(tx, input))),
    updateTransaction: (id, input) => serial(() => db.transaction((tx) => updateTransaction(tx, id, input))),
    deleteTransaction: (id) => serial(() => db.transaction((tx) => deleteTransaction(tx, id))),
    getTransaction: (id) => serial(() => getTransaction(db, id)),
    isMonthClosed: (month) =>
      serial(async () => {
        if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
        return isMonthClosed(db, month);
      }),

    getMonthCalendar: (month) =>
      serial(async () => {
        if (!isValidMonth(month)) {
          throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
        }
        const days = await db.all<CalendarDay>(
          `SELECT date,
                  COALESCE(SUM(CASE WHEN flow = 'expense' THEN amount END), 0) AS expenseTotal,
                  COALESCE(SUM(CASE WHEN flow = 'income' THEN amount END), 0) AS incomeTotal,
                  COUNT(*) AS count
             FROM transactions WHERE substr(date, 1, 7) = ?
            GROUP BY date ORDER BY date`,
          [month],
        );
        return { month, days };
      }),

    getDayTransactions: (date) =>
      serial(async () => {
        if (!isValidDate(date)) throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
        return transactionsBetween(db, date, date);
      }),

    listTransactions: (from, to) =>
      serial(async () => {
        if (!isValidDate(from) || !isValidDate(to)) throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
        return transactionsBetween(db, from, to);
      }),

    getMonthBreakdown: (month, flow) => serial(() => monthBreakdown(db, month, flow)),
    getCategoryMonthTransactions: (month, categoryId) => serial(() => categoryMonthTransactions(db, month, categoryId)),

    getOpeningDate: () =>
      serial(async () => (await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_date'"))?.value ?? null),

    listCategories: (month) => serial(async () => {
      const target = month ?? budgetStatus((await readStoredDocument(db)).state, await fallbackMonth()).openMonth;
      if (!isValidMonth(target)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
      return listActiveCategories(db, target);
    }),
    listMembers: () => serial(() => db.all<Member>('SELECT id, name FROM members ORDER BY sort_order')),

    importLegacyLedger: (data) => serial(() => db.transaction((tx) => importLegacy(tx, data))),

    runBudgetCommand: (command, access) =>
      serial(() => db.transaction(async (tx) => (await executeBudgetCommand(tx, command, now(), false, access)).result)),
    previewBudgetCommand: (command, access) => serial(async () => (await executeBudgetCommand(db, command, now(), true, access)).preview),
    getBudgetProgress: (month) => serial(() => getBudgetProgress(db, now(), month)),
    listBudgetRevisions: () => serial(async () => (await readStoredDocument(db)).state.revisions),

    getMonthIncome: (month) =>
      serial(async () => {
        if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
        const row = await db.get<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE flow = 'income' AND substr(date, 1, 7) = ?",
          [month],
        );
        return row?.total ?? 0;
      }),

    getBudgetStatus: () =>
      serial(async () => budgetStatus((await readStoredDocument(db)).state, await fallbackMonth())),

    getBudgetMonth: (month) =>
      serial(async () => {
        if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
        const view = budgetMonth((await readStoredDocument(db)).state, month, await fallbackMonth());
        if (!view) throw new LedgerError('month_not_closed', `${month} 尚未月結。`);
        return view;
      }),

    listBudgetMonths: () => serial(async () => budgetMonths((await readStoredDocument(db)).state)),

    listBudgetAdjustments: () => serial(async () => budgetAdjustments((await readStoredDocument(db)).state)),

    getUnmappedExpenseCategories: (month) =>
      serial(async () => {
        const { state } = await readStoredDocument(db);
        const target = month ?? openMonth(state, await fallbackMonth());
        if (!isValidMonth(target)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
        const revision = effectiveRevision(state, target);
        const rows = await db.all<{ name: string }>(
          `SELECT DISTINCT c.name AS name FROM transactions t JOIN categories c ON c.id = t.category_id
            WHERE t.flow = 'expense' AND substr(t.date, 1, 7) = ?`,
          [target],
        );
        return rows
          .map((r) => r.name)
          .filter((name) => !revision || mappedBudgetCategory(revision, name) === undefined)
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      }),

    importFinanceDocument: (document, importOptions = {}) =>
      serial(() =>
        db.transaction(async (tx) => {
          const state = parseImportedDocument(document);
          const { exists } = await readStoredDocument(tx);
          if (exists && !importOptions.replace) {
            throw new LedgerError('document_exists', '已經有財務文件，匯入會取代現有的預算與月結資料；請明確指定取代。');
          }
          await replaceDocument(tx, state);
          return { version: state.version };
        }),
      ),

    exportFinanceDocument: () =>
      serial(async () => serializeBudgetDocument((await readStoredDocument(db)).state)),

    getBackupStatus: () => serial(backup.status),
    exportBackup: (path) => serial(() => backup.export(path)),
    recordBackupDelivered: (exportedAt) => serial(() => backup.recordDelivered(exportedAt)),
    inspectBackup: (path) => serial(() => backup.inspect(path)),
    restoreBackup: (path, restoreOptions) => serial(() => backup.restore(path, restoreOptions)),

    close: () => serial(() => db.close()),
  };
}
