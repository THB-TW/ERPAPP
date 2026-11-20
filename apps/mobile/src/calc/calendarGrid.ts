import { daysInMonth } from './dates.ts';

/** 整月月曆的格子：週日起算，每週 7 格，月初之前與月底之後補 null。 */
export function monthGrid(month: string): (string | null)[][] {
  const [year, mon] = month.split('-').map(Number);
  const leading = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay(); // 0 = 週日
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let day = 1; day <= daysInMonth(year, mon); day++) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
