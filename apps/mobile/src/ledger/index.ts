// 帳本服務：唯一的測試切入點。畫面只能透過這裡的指令與查詢碰資料。
import type { Database } from '../db/driver.ts';
import { migrate } from '../db/migrate.ts';
import { isValidDate, isValidMonth } from '../calc/dates.ts';
import type { AccountKind, Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { ledgerMigrations } from './migrations.ts';

export type { AccountKind, Flow } from './defaults.ts';
export { LedgerError } from './errors.ts';
export type { LedgerErrorCode } from './errors.ts';

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

export interface Ledger {
  getMonthCalendar(month: string): Promise<MonthCalendar>;
  addTransaction(input: NewTransaction): Promise<{ id: number }>;
  getDayTransactions(date: string): Promise<DayTransaction[]>;
  listCategories(): Promise<Category[]>;
  listAccounts(): Promise<Account[]>;
  close(): Promise<void>;
}

export async function openLedger(db: Database): Promise<Ledger> {
  await migrate(db, ledgerMigrations);

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
            throw new LedgerError('invalid_date', '日期格式不正確，請用 YYYY-MM-DD 的有效日期。');
          }
          if (input.flow !== 'expense' && input.flow !== 'income') {
            throw new LedgerError('invalid_flow', '收支別只能是「支出」或「收入」。');
          }
          if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
            throw new LedgerError('invalid_amount', '金額必須是大於 0 的整數（新台幣元）。');
          }
          const category = await tx.get('SELECT id FROM categories WHERE id = ?', [input.categoryId]);
          if (!category) {
            throw new LedgerError('unknown_category', '找不到這個分類，請先到分類設定新增。');
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
          throw new LedgerError('invalid_date', '日期格式不正確，請用 YYYY-MM-DD 的有效日期。');
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
    close: () => serial(() => db.close()),
  };
}
