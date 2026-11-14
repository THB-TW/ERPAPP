// 純計算：日期與月份。日期一律是台北時間的 YYYY-MM-DD 字串，月份是 YYYY-MM。
// 台灣沒有日光節約時間，台北時間固定為 UTC+8，所以不依賴 Intl 時區資料。

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = MONTH_PATTERN.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  return Number(m[1]) >= 1 && month >= 1 && month <= 12;
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1 || month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** 把一個時間點換算成台北時間的日期字串。 */
export function taipeiDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 月份加減，例如 shiftMonth('2026-12', 1) 為 '2027-01'。 */
export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_PATTERN.exec(month);
  if (!m) throw new Error(`月份格式錯誤：${month}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}
