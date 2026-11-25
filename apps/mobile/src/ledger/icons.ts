// 圖示：名稱之外另存的一個表情符號（選填）。名稱不含圖示，所以 CSV 匯入、舊帳比對與搬家都照名稱對應。
import type { Queryable } from '../db/driver.ts';
import { LedgerError } from './errors.ts';
import { ACCOUNT_ICONS, ACCOUNT_KIND_ICONS, CATEGORY_ICONS, SELF_MEMBER_ICON, type AccountKind } from './defaults.ts';

/** 回傳整理後的圖示；空白或 null 表示沒有圖示。最多 4 個字元、不含空白與英文字母（用手機表情鍵盤輸入）。 */
export function validIcon(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const icon = value.trim();
  if (icon === '') return null;
  if (Array.from(icon).length > 4 || /[A-Za-z\s]/.test(icon)) {
    throw new LedgerError('invalid_icon', '圖示請輸入一個表情符號。');
  }
  return icon;
}

const blank = "(icon IS NULL OR TRIM(icon) = '')";

/** 只把空白圖示依名稱（完全相同）補上內建圖示；帳戶找不到名稱時依種類。不動名稱與金額。 */
export async function fillDefaultIcons(q: Queryable): Promise<void> {
  for (const [name, icon] of Object.entries(CATEGORY_ICONS)) {
    await q.run(`UPDATE categories SET icon = ? WHERE name = ? AND ${blank}`, [icon, name]);
  }
  for (const [name, icon] of Object.entries(ACCOUNT_ICONS)) {
    await q.run(`UPDATE accounts SET icon = ? WHERE name = ? AND ${blank}`, [icon, name]);
  }
  for (const [kind, icon] of Object.entries(ACCOUNT_KIND_ICONS) as [AccountKind, string][]) {
    await q.run(`UPDATE accounts SET icon = ? WHERE kind = ? AND ${blank}`, [icon, kind]);
  }
  await q.run(`UPDATE members SET icon = ? WHERE is_self = 1 AND ${blank}`, [SELF_MEMBER_ICON]);
}
