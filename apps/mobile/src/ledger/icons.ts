// 圖示：名稱之外另存的一個表情符號（選填）。名稱不含圖示，所以 CSV 匯入、舊帳比對與搬家都照名稱對應。
import { LedgerError } from './errors.ts';

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
