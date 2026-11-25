// 備份頁用的純文字與路徑換算（不碰 React 與原生模組，所以可以在雲端測）。
import { taipeiDate } from '../calc/dates.ts';

/** 超過這麼多天沒備份就提醒（規格：35 天）。 */
export const BACKUP_REMINDER_DAYS = 35;

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function taipeiParts(time: Date) {
  const iso = new Date(time.getTime() + TAIPEI_OFFSET_MS).toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  return { year: iso.slice(0, 4), month: iso.slice(5, 7), day: iso.slice(8, 10), hour: iso.slice(11, 13), minute: iso.slice(14, 16), second: iso.slice(17, 19) };
}

/** 匯出檔名：台北時間，只用英數與連字號（路徑與分享都不用再跳脫）。 */
export function backupFileName(now: Date): string {
  const p = taipeiParts(now);
  return `ledger-backup-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}.db`;
}

/** ISO 時間顯示成台北時間，例如「2026 年 11 月 12 日 00:30」。 */
export function taipeiDateTime(iso: string): string {
  const p = taipeiParts(new Date(iso));
  return `${p.year} 年 ${Number(p.month)} 月 ${Number(p.day)} 日 ${p.hour}:${p.minute}`;
}

/** 設定頁「上次備份日期」的文字，以及是否該提醒（沒備份過，或超過 35 天）。天數以台北日期計。 */
export function describeLastBackup(lastBackupAt: string | null, now: Date): { text: string; overdue: boolean } {
  if (lastBackupAt === null) return { text: '還沒有備份過', overdue: true };
  const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
  const days = Math.max(0, dayNumber(taipeiDate(now)) - dayNumber(taipeiDate(new Date(lastBackupAt))));
  return {
    text: `${taipeiDateTime(lastBackupAt)}（${days === 0 ? '今天' : `${days} 天前`}）`,
    overdue: days > BACKUP_REMINDER_DAYS,
  };
}

/** 選檔器給的 file:// 網址換成 SQLite 用的一般路徑。 */
export function fileUriToPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  return uri.slice('file://'.length).split('/').map(decodeURIComponent).join('/');
}

/** 一般路徑換成分享面板用的 file:// 網址。 */
export function pathToFileUri(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}
