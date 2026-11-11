// 帳本服務：唯一的測試切入點。畫面只能透過這裡的指令與查詢碰資料。
import type { Database, Queryable } from '../db/driver.ts';
import { migrate } from '../db/migrate.ts';
import { isValidDate, isValidMonth, taipeiDate } from '../calc/dates.ts';
import {
  BUDGET_ACTOR,
  BudgetRuleError,
  applyBudgetCommand,
  effectiveRevision,
  mappedBudgetCategory,
  openMonth,
  position,
} from '../calc/budgetEngine.ts';
import { BudgetDocumentError, parseBudgetDocument, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetCommand, BudgetExpense } from '../calc/budgetTypes.ts';
import { readStoredDocument, replaceDocument, writeState } from './financeDocument.ts';
import { assertDateOpen } from './monthLock.ts';
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
import type { AccountKind, Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { ledgerMigrations } from './migrations.ts';

export type { AccountKind, Flow } from './defaults.ts';
export { LedgerError } from './errors.ts';
export type { LedgerErrorCode } from './errors.ts';
export { BudgetRuleError } from '../calc/budgetEngine.ts';
export type { BudgetCommand } from '../calc/budgetTypes.ts';
export type {
  BudgetAdjustmentView, BudgetMonthSummary, BudgetMonthView, BudgetReserveView, BudgetStatus,
} from './budgetViews.ts';

export interface Category { id: number; name: string; flow: Flow }
export interface Account { id: number; name: string; kind: AccountKind }

export interface NewTransaction {
  date: string;
  categoryId: number;
  accountId: number;
  flow: Flow;
  amount: number;
  note?: string;
}

export interface DayTransaction {
  id: number;
  date: string;
  flow: Flow;
  amount: number;
  note: string;
  categoryId: number;
  categoryName: string;
  accountId: number;
  accountName: string;
}

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
}

export interface BudgetCommandResult {
  /** 指令執行後的財務文件版本。 */
  version: number;
  /** true 表示這個操作識別碼先前已完成，這次沒有重做。 */
  replayed: boolean;
}

export interface Ledger {
  getMonthCalendar(month: string): Promise<MonthCalendar>;
  addTransaction(input: NewTransaction): Promise<{ id: number }>;
  getDayTransactions(date: string): Promise<DayTransaction[]>;
  listCategories(): Promise<Category[]>;
  listAccounts(): Promise<Account[]>;

  // ---- 預算與月結（票 03）----
  /**
   * 執行一個預算指令（caps、add、map、retire、transfer、fund、correct、reverse、rollback、close）。
   * 在同一個資料庫交易內讀文件、套用引擎、寫回。close 的實支由該月支出交易彙總，當月收入由 command.amount 傳入
   * （票 11 才改成自動帶入）。被拒時丟 BudgetRuleError（kind 為 argument／operation／overflow）或 LedgerError。
   */
  runBudgetCommand(command: BudgetCommand): Promise<BudgetCommandResult>;
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
  /** 以舊系統格式輸出目前的財務文件（尚無文件時為空狀態）。 */
  exportFinanceDocument(): Promise<string>;

  close(): Promise<void>;
}

const INVALID_DATE_MESSAGE = '日期格式不正確，請用 YYYY-MM-DD 的有效日期。';

const MONTH_MESSAGE = '月份格式不正確，請用 YYYY-MM。';

export async function openLedger(db: Database, options: LedgerOptions = {}): Promise<Ledger> {
  await migrate(db, ledgerMigrations);
  const now = options.now ?? (() => new Date());
  const fallbackMonth = () => taipeiDate(now()).slice(0, 7);

  // 所有指令與查詢排成一條隊：寫入交易進行中，不會有別的查詢插進來（expo-sqlite 的交易會把
  // 同時發出的查詢也算進去）。這也是「已月結月份不得默默改動」之後掛上檢查的唯一入口。
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  return {
    addTransaction: (input) =>
      serial(() =>
        db.transaction(async (tx) => {
          if (!isValidDate(input.date)) {
            throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
          }
          if (input.flow !== 'expense' && input.flow !== 'income') {
            throw new LedgerError('invalid_flow', '收支別只能是「支出」或「收入」。');
          }
          if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
            throw new LedgerError('invalid_amount', '金額必須是大於 0 的整數（新台幣元）。');
          }
          await assertDateOpen(tx, input.date); // 已結月份鎖定的唯一檢查點
          const category = await tx.get<{ flow: Flow }>('SELECT flow FROM categories WHERE id = ?', [
            input.categoryId,
          ]);
          if (!category) {
            throw new LedgerError('unknown_category', '找不到這個分類，請先到分類設定新增。');
          }
          if (category.flow !== input.flow) {
            throw new LedgerError(
              'flow_mismatch',
              category.flow === 'income' ? '這是收入分類，不能記成支出。' : '這是支出分類，不能記成收入。',
            );
          }
          const account = await tx.get('SELECT id FROM accounts WHERE id = ?', [input.accountId]);
          if (!account) {
            throw new LedgerError('unknown_account', '找不到這個帳戶。');
          }
          const result = await tx.run(
            'INSERT INTO transactions (date, category_id, account_id, flow, amount, note) VALUES (?, ?, ?, ?, ?, ?)',
            [input.date, input.categoryId, input.accountId, input.flow, input.amount, input.note ?? ''],
          );
          return { id: result.lastInsertRowId };
        }),
      ),

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
        if (!isValidDate(date)) {
          throw new LedgerError('invalid_date', INVALID_DATE_MESSAGE);
        }
        return db.all<DayTransaction>(
          `SELECT t.id, t.date, t.flow, t.amount, t.note,
                  t.category_id AS categoryId, c.name AS categoryName,
                  t.account_id AS accountId, a.name AS accountName
             FROM transactions t
             JOIN categories c ON c.id = t.category_id
             JOIN accounts a ON a.id = t.account_id
            WHERE t.date = ? ORDER BY t.id`,
          [date],
        );
      }),

    listCategories: () =>
      serial(() => db.all<Category>('SELECT id, name, flow FROM categories ORDER BY sort_order')),
    listAccounts: () =>
      serial(() => db.all<Account>('SELECT id, name, kind FROM accounts ORDER BY sort_order')),

    runBudgetCommand: (command) =>
      serial(() =>
        db.transaction(async (tx) => {
          const { exists, state } = await readStoredDocument(tx);
          const operationId = typeof command.operationId === 'string' ? command.operationId.toLowerCase() : '';
          const replay = state.receipts.some((r) => r.id === operationId);
          if (!replay) await assertCategoryNamesAvailable(tx, command);
          let expenses: BudgetExpense[] | undefined;
          if (command.action === 'close' && !replay && isValidMonth(command.month)) {
            expenses = await monthExpenses(tx, command.month);
          }
          const after = applyBudgetCommand(state, command, { actor: BUDGET_ACTOR, time: now().toISOString(), expenses });
          if (after === state) return { version: state.version, replayed: true };
          await writeState(tx, exists, state.version, after);
          await syncExpenseCategory(tx, command);
          return { version: after.version, replayed: false };
        }),
      ),

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
      serial(async () => budgetStatus((await readStoredDocument(db)).state, fallbackMonth())),

    getBudgetMonth: (month) =>
      serial(async () => {
        if (!isValidMonth(month)) throw new LedgerError('invalid_month', MONTH_MESSAGE);
        const view = budgetMonth((await readStoredDocument(db)).state, month, fallbackMonth());
        if (!view) throw new LedgerError('month_not_closed', `${month} 尚未月結。`);
        return view;
      }),

    listBudgetMonths: () => serial(async () => budgetMonths((await readStoredDocument(db)).state)),

    listBudgetAdjustments: () => serial(async () => budgetAdjustments((await readStoredDocument(db)).state)),

    getUnmappedExpenseCategories: (month) =>
      serial(async () => {
        const { state } = await readStoredDocument(db);
        const target = month ?? openMonth(state, fallbackMonth());
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
          let state;
          try {
            state = parseBudgetDocument(document);
            for (const m of state.months) position(state, m.month); // 驗證每個月的位置與合計都算得出來
          } catch (error) {
            if (error instanceof BudgetDocumentError || error instanceof BudgetRuleError) {
              throw new LedgerError('invalid_document', `財務文件無法匯入：${error.message}`);
            }
            throw error;
          }
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

    close: () => serial(() => db.close()),
  };
}

// ---- 預算指令的資料庫側輔助 ----

/** 新增或歸屬預算類別會用到的交易分類名稱（C# BudgetWorkspace.Execute 的 sourceName）。 */
function sourceCategoryName(command: BudgetCommand): string | null {
  if (command.action === 'add') return (command.name ?? '').trim() || null;
  if (command.action === 'map') return (command.sourceCategory ?? '').trim() || null;
  return null;
}

async function assertCategoryNamesAvailable(tx: Queryable, command: BudgetCommand): Promise<void> {
  const name = sourceCategoryName(command);
  if (name === null) return;
  const clash = await tx.get("SELECT 1 AS hit FROM categories WHERE name = ? COLLATE NOCASE AND flow <> 'expense'", [name]);
  if (clash) throw new LedgerError('category_name_conflict', '這個名稱已用於收入分類，請使用其他支出名稱。');
}

/** 指令成功後，若同名交易分類不存在就建立一個支出分類，讓使用者能直接記這個類別的帳。 */
async function syncExpenseCategory(tx: Queryable, command: BudgetCommand): Promise<void> {
  const name = sourceCategoryName(command);
  if (name === null) return;
  const existing = await tx.get('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [name]);
  if (existing) return;
  const last = await tx.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM categories');
  await tx.run("INSERT INTO categories (name, flow, sort_order) VALUES (?, 'expense', ?)", [name, (last?.top ?? -1) + 1]);
}

/** 該月每一筆支出交易（分類名稱與金額）。收入與轉帳不算；實支以分類名稱交給引擎依歸屬分配。 */
async function monthExpenses(tx: Queryable, month: string): Promise<BudgetExpense[]> {
  const rows = await tx.all<{ category: string; amount: number }>(
    `SELECT c.name AS category, t.amount AS amount FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.flow = 'expense' AND substr(t.date, 1, 7) = ? ORDER BY t.id`,
    [month],
  );
  return rows;
}
