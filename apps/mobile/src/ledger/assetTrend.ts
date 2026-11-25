// 財產趨勢（2026-11-25 翰陞定案，規格 .scratch/ledgers-trend-icons 第 7–10 點）：明細第三頁的折線圖資料。
// 只取已月結月份；每月的數字直接用「財產分配」同一個計算（investmentPortfolio 帶月底日期），
// 所以兩邊一定對得上。未月結的月份沒有帳面總資產，不畫。
import type { Queryable } from '../db/driver.ts';
import { daysInMonth } from '../calc/dates.ts';
import { readStoredDocument } from './financeDocument.ts';
import { budgetMonths } from './budgetViews.ts';
import { investmentPortfolio } from './investment.ts';

export interface AssetTrendPoint {
  month: string;
  /** 該月月結的帳面總資產（投資以投入本金計）。 */
  book: number;
  /** 使用中投資標的在月底的市值合計；沒有估值的標的用成本。 */
  investment: number;
  /** 財產＝帳面總資產－累計投入淨額＋投資市值（＝財產分配的合計）。 */
  total: number;
  /** 有使用中標的在月底前還沒有任何估值，市值以成本估算。 */
  investmentAtCost: boolean;
}

const monthEnd = (month: string) => `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, '0')}`;

/** 依月份由舊到新。 */
export async function assetTrend(q: Queryable): Promise<AssetTrendPoint[]> {
  const months = budgetMonths((await readStoredDocument(q)).state);
  const points: AssetTrendPoint[] = [];
  for (const { month } of months) {
    const p = await investmentPortfolio(q, monthEnd(month));
    const active = p.positions.filter((x) => x.active);
    points.push({
      month,
      book: p.bookTotal,
      investment: active.reduce((sum, x) => sum + x.marketValue, 0),
      total: p.allocationTotal,
      investmentAtCost: active.some((x) => !x.hasValuation && x.cost !== 0),
    });
  }
  return points;
}
