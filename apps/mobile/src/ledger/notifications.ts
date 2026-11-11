// 本機通知的設定與唯讀排程查詢。這一層不取得系統權限、不排原生通知，也不讀系統時鐘。
import type { Database, Queryable } from '../db/driver.ts';
import { daysInMonth, isValidMonth, shiftMonth, taipeiDate } from '../calc/dates.ts';
import { budgetProgress, budgetStatus } from './budgetViews.ts';
import { budgetFallbackMonth } from './budgetCommands.ts';
import { readStoredDocument } from './financeDocument.ts';
import { loanViews } from './loans.ts';

export type NotificationKind = 'entry' | 'budgetOverrun' | 'backupAfterClose' | 'backupOverdue'
  | 'monthlyClose' | 'creditCardStatement' | 'loanPayment';

export interface NotificationSettings {
  enabled: Record<NotificationKind, boolean>;
  /** 台北時間，HH:mm；其他日期型提醒固定為 09:00。 */
  entryTime: string;
  /** 僅保存個人發薪日，不把它當月結日，也不另發薪資預測提醒。 */
  payday: number;
  monthlyCloseDay: number;
  creditCardClosingDay: number;
  /** 個別信用卡優先於共用結帳日；停用卡不提醒。 */
  creditCardClosingDays: { accountId: number; day: number }[];
  /** 沒有設定繳款日的貸款不排提醒；在繳款日前一天 09:00 提醒。 */
  loanDueDays: { loanId: number; day: number }[];
}

export interface PlannedNotification {
  /** 同一提醒有穩定識別碼；原生層依識別碼替換，不能每次同步都追加。 */
  id: string;
  kind: NotificationKind;
  /** ISO 8601 UTC；即時提醒等於查詢輸入的 now。 */
  fireAt: string;
  title: string;
  body: string;
}

export interface NotificationPlanInput {
  now: Date;
  /** 含終點，預設未來 30 天，最多 366 天；之後由原生層定期重新取得完整清單。 */
  through?: Date;
  /** 省略即讀取帳本設定；可傳未儲存的設定作預覽。 */
  settings?: NotificationSettings;
  /** 畫面沿用 closeEntitlement 的集中判斷；服務不讀 UI／StoreKit。 */
  hasEntitlement: boolean;
  /** period 是該卡結帳日所在的 YYYY-MM；票 12 合併後由其查詢注入。缺省或 null 表示未知。 */
  statementImports?: readonly { accountId: number; period: string; imported: boolean | null }[];
  /** 原生層日後保存已送達的識別碼，可避免已送達的一次性提醒再次出現。 */
  deliveredIds?: readonly string[];
}

export interface NotificationsLedger {
  getNotificationSettings(): Promise<NotificationSettings>;
  saveNotificationSettings(settings: NotificationSettings): Promise<void>;
  getNotificationPlan(input: NotificationPlanInput): Promise<PlannedNotification[]>;
}

const SETTINGS_KEY = 'notification_settings';
// 首次儲存後固定，不因設定或交易編輯往後延。從未備份時，由此起算 35 天。
const BACKUP_START_KEY = 'notification_backup_started_at';
const DAY = 86_400_000;
const KINDS: readonly NotificationKind[] = ['entry', 'budgetOverrun', 'backupAfterClose', 'backupOverdue',
  'monthlyClose', 'creditCardStatement', 'loanPayment'];

/** 單獨保留輸入錯誤，不擴張所有帳務指令共用的 errors.ts。 */
export class NotificationSettingsError extends Error {
  constructor(message: string) { super(message); this.name = 'NotificationSettingsError'; }
}

function defaults(): NotificationSettings {
  return { enabled: { entry: false, budgetOverrun: false, backupAfterClose: false, backupOverdue: false,
    monthlyClose: false, creditCardStatement: false, loanPayment: false },
  entryTime: '21:00', payday: 5, monthlyCloseDay: 7, creditCardClosingDay: 7,
  creditCardClosingDays: [], loanDueDays: [] };
}

function validateSettings(input: NotificationSettings): NotificationSettings {
  const fail = (message: string): never => { throw new NotificationSettingsError(message); };
  if (!input || !input.enabled || KINDS.some((kind) => typeof input.enabled[kind] !== 'boolean')) {
    fail('每項通知開關設定都須為開啟或關閉。');
  }
  if (typeof input.entryTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.entryTime)) {
    fail('記帳提醒時間請用 00:00～23:59 的 HH:mm 格式。');
  }
  const validDay = (day: number) => Number.isSafeInteger(day) && day >= 1 && day <= 31;
  if (![input.payday, input.monthlyCloseDay, input.creditCardClosingDay].every(validDay)) {
    fail('發薪日、月結日與信用卡結帳日期設定須為 1～31 的整數。');
  }
  function dates<T extends 'accountId' | 'loanId'>(rows: ({ day: number } & Record<T, number>)[], key: T) {
    const seen = new Set<number>();
    if (!Array.isArray(rows)) fail('卡片與貸款日期設定須為清單。');
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row[key]) || row[key] < 1 || !validDay(row.day) || seen.has(row[key])) {
        fail('卡片與貸款日期設定須使用不重複的有效編號與 1～31 的日期。');
      }
      seen.add(row[key]);
    }
    return rows.map((row) => ({ [key]: row[key], day: row.day })) as ({ day: number } & Record<T, number>)[];
  }
  return { enabled: Object.fromEntries(KINDS.map((kind) => [kind, input.enabled[kind]])) as NotificationSettings['enabled'],
    entryTime: input.entryTime, payday: input.payday, monthlyCloseDay: input.monthlyCloseDay,
    creditCardClosingDay: input.creditCardClosingDay,
    creditCardClosingDays: dates(input.creditCardClosingDays, 'accountId'), loanDueDays: dates(input.loanDueDays, 'loanId') };
}

async function setting(q: Queryable, key: string): Promise<string | null> {
  return (await q.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]))?.value ?? null;
}
async function readSettings(q: Queryable): Promise<NotificationSettings> {
  const stored = await setting(q, SETTINGS_KEY);
  // 預設只回傳，不寫資料，保留空帳本供舊帳帶入。
  if (stored === null) return defaults();
  try { return validateSettings(JSON.parse(stored) as NotificationSettings); }
  catch { throw new NotificationSettingsError('通知設定無法讀取，請重新儲存通知設定。'); }
}
async function saveSettings(q: Queryable, input: NotificationSettings, now: Date): Promise<void> {
  const validated = validateSettings(input);
  await q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [SETTINGS_KEY, JSON.stringify(validated)]);
  await q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
    [BACKUP_START_KEY, now.toISOString()]);
}

function dateAt(month: string, day: number, time = '09:00'): Date {
  const [year, m] = month.split('-').map(Number);
  const clamped = String(Math.min(day, daysInMonth(year, m))).padStart(2, '0');
  return new Date(`${month}-${clamped}T${time}:00+08:00`);
}

function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let month = first; ; month = shiftMonth(month, 1)) {
    months.push(month);
    // 在最後一個有效月份就停止，避免 9999-12 移到五位數年份後失去字串排序。
    if (month === last) return months;
  }
}

async function notificationPlan(q: Queryable, input: NotificationPlanInput): Promise<PlannedNotification[]> {
  const now = input.now;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new NotificationSettingsError('通知查詢的目前時間不正確。');
  const through = input.through ?? new Date(now.getTime() + 30 * DAY);
  if (!(through instanceof Date) || !Number.isFinite(through.getTime()) || through < now
    || through.getTime() - now.getTime() > 366 * DAY) throw new NotificationSettingsError('通知查詢範圍須在目前時間起 366 天內。');
  const today = taipeiDate(now);
  const lastDate = taipeiDate(through);
  const month = today.slice(0, 7);
  const endMonth = lastDate.slice(0, 7);
  if (!isValidMonth(month) || !isValidMonth(endMonth)) throw new NotificationSettingsError('通知查詢時間超出可用年份。');
  const config = input.settings ? validateSettings(input.settings) : await readSettings(q);
  const delivered = new Set(input.deliveredIds ?? []);
  const result: PlannedNotification[] = [];
  const add = (kind: NotificationKind, key: string, at: Date, title: string, body: string) => {
    const id = `${kind}:${key}`;
    if (!config.enabled[kind] || delivered.has(id) || at < now || at > through) return;
    result.push({ id, kind, fireAt: at.toISOString(), title, body });
  };
  const immediateOrFuture = (at: Date) => at < now ? now : at;

  if (config.enabled.entry) {
    for (let day = new Date(`${today}T00:00:00+08:00`); day <= through; day = new Date(day.getTime() + DAY)) {
      const date = taipeiDate(day);
      add('entry', date, new Date(`${date}T${config.entryTime}:00+08:00`), '記帳提醒', '花一點時間，記下今天的交易。');
    }
  }

  const { state } = await readStoredDocument(q);
  const fallback = await budgetFallbackMonth(q, now);
  if (config.enabled.budgetOverrun) {
    // 與預算頁共用歸屬與上限計算；尚未發生的未來交易不提前發超支通知。
    const expenses = await q.all<{ categoryId: number; name: string; spent: number }>(
      `SELECT c.id AS categoryId, c.name, SUM(t.amount) AS spent FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE t.flow = 'expense' AND t.date >= ? AND t.date <= ? GROUP BY c.id ORDER BY c.id`, [`${month}-01`, today]);
    for (const row of budgetProgress(state, month, fallback, expenses).rows) {
      if (row.cap !== null && row.spent > row.cap) {
        // 鎖定畫面不放金額、帳戶名稱或備註；分類以識別碼區分通知。
        add('budgetOverrun', `${month}:${row.categoryId}`, now, '預算超支提醒', '有分類的本月支出已超過預算上限，請開啟 App 查看。');
      }
    }
  }

  const backupAt = (await q.get<{ value: string }>("SELECT value FROM ledger_meta WHERE key = 'last_backup_at'"))?.value ?? null;
  if (config.enabled.backupAfterClose) {
    const latest = state.months.filter((m) => !m.migrated && new Date(m.time) <= now)
      .sort((a, b) => a.month.localeCompare(b.month)).at(-1);
    if (latest && (backupAt === null || new Date(backupAt) < new Date(latest.time))) {
      add('backupAfterClose', latest.id, now, '月結完成，記得備份', '請匯出備份檔，保存最新的月結資料。');
    }
  }
  if (config.enabled.backupOverdue) {
    const anchor = backupAt ?? await setting(q, BACKUP_START_KEY);
    if (anchor !== null) {
      // 「超過」35 天：恰滿 35 天不發；未逾期也能先排好一次性提醒。
      const due = new Date(new Date(anchor).getTime() + 35 * DAY + 1);
      if (Number.isFinite(due.getTime())) add('backupOverdue', anchor, immediateOrFuture(due), '備份提醒', '已超過 35 天未備份，請匯出備份檔。');
    }
  }

  if (input.hasEntitlement === true) {
    if (config.enabled.monthlyClose) {
      const open = budgetStatus(state, fallback).openMonth;
      for (const m of monthsBetween(month, endMonth)) {
        if (open <= shiftMonth(m, -1)) {
          add('monthlyClose', `${open}:${m}`, immediateOrFuture(dateAt(m, config.monthlyCloseDay)),
            '月結提醒', `${open} 尚未月結，請開啟 App 核對並完成月結。`);
        }
      }
    }
    if (config.enabled.creditCardStatement) {
      const cards = await q.all<{ id: number }>("SELECT id FROM accounts WHERE kind = 'credit_card' AND active = 1 ORDER BY id");
      const seen = new Set<string>();
      for (const status of input.statementImports ?? []) {
        if (!status || !Number.isSafeInteger(status.accountId) || !isValidMonth(status.period)
          || ![true, false, null].includes(status.imported)) throw new NotificationSettingsError('信用卡帳單匯入狀態設定不正確。');
        const key = `${status.accountId}:${status.period}`;
        if (seen.has(key)) throw new NotificationSettingsError('信用卡同卡同期的匯入狀態設定不可重複。');
        seen.add(key);
        if (status.imported !== false || !cards.some((card) => card.id === status.accountId)) continue;
        const closingDay = config.creditCardClosingDays.find((c) => c.accountId === status.accountId)?.day ?? config.creditCardClosingDay;
        const at = new Date(dateAt(status.period, closingDay).getTime() + DAY);
        add('creditCardStatement', key, immediateOrFuture(at), '信用卡帳單提醒', '有信用卡帳單尚未匯入，請開啟 App 查看。');
      }
    }
    if (config.enabled.loanPayment && config.loanDueDays.length) {
      // 多看一個月，涵蓋下月 1 日繳款、這個月最後一天就要提醒的情形。
      const finalDueMonth = endMonth === '9999-12' ? endMonth : shiftMonth(endMonth, 1);
      for (const m of monthsBetween(month, finalDueMonth)) {
        const loans = await loanViews(q, m, state);
        for (const due of config.loanDueDays) {
          const current = loans.find((loan) => loan.id === due.loanId);
          if (!current || current.needsSetup || current.remainingPrincipal === null || current.remainingPrincipal <= 0) continue;
          add('loanPayment', `${due.loanId}:${m}`, new Date(dateAt(m, due.day).getTime() - DAY),
            '貸款／分期繳款提醒', '有貸款／分期即將到繳款日，請開啟 App 查看。');
        }
      }
    }
  }
  return result.sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id));
}

/** index.ts 只接入同一條序列；設定寫入使用 openLedger 已追蹤修改時間的 db.transaction。 */
export function notificationCommands(db: Database, serial: <T>(task: () => Promise<T>) => Promise<T>, now: () => Date): NotificationsLedger {
  return {
    getNotificationSettings: () => serial(() => readSettings(db)),
    saveNotificationSettings: (input) => serial(() => db.transaction((tx) => saveSettings(tx, input, now()))),
    getNotificationPlan: (input) => serial(() => notificationPlan(db, input)),
  };
}
