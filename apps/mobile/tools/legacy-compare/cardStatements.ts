import type { Ledger } from '../../src/ledger/index.ts';
import type { RawCardStatement } from '../legacy-convert/legacyData.ts';
import { parseDate, text } from '../legacy-convert/plan.ts';
import type { Difference } from './compare.ts';
import { ConversionStopped } from '../legacy-convert/source.ts';

export interface CardStatementComparison {
  differences: Difference[];
  sourceCount: number;
  appCount: number;
  sourceSum: number;
  appSum: number;
}

function safeTotal(rows: readonly { amount: unknown }[], side: string): number {
  let total = 0;
  for (const row of rows) {
    if (typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount < 0) {
      throw new ConversionStopped(`${side}信用卡明細金額不是非負安全整數，已停止比對，不修補來源。`);
    }
    total += row.amount;
    if (!Number.isSafeInteger(total)) {
      throw new ConversionStopped(`${side}信用卡明細金額合計超過安全整數範圍，已停止比對，不能拿捨入值當作驗收證據。`);
    }
  }
  return total;
}

/** 舊表沒有卡識別，核對來源可證明的日期／店家／金額多重集合；所屬卡另由轉換讀回驗證。 */
export function compareCardStatements(app: Awaited<ReturnType<Ledger['listCardStatements']>>, source: readonly RawCardStatement[]): CardStatementComparison {
  const differences: Difference[] = [];
  const sourceSum = safeTotal(source, '來源');
  const appSum = safeTotal(app, 'App');
  const eq = (field: string, expected: number, actual: number) => {
    if (expected !== actual) differences.push({ scope: '信用卡明細', kind: '信用卡明細總計', field, source: '來源信用卡表', expected, actual });
  };
  eq('信用卡明細總筆數', source.length, app.length);
  eq('信用卡明細金額加總', sourceSum, appSum);
  const counts = new Map<string, number>();
  const key = (date: unknown, merchant: unknown, amount: unknown) => JSON.stringify([parseDate(date) ?? String(date), text(merchant) ?? '', amount]);
  for (const row of source) {
    const k = key(row.date, row.merchant, row.amount);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const row of app) {
    const k = key(row.date, row.merchant, row.amount);
    counts.set(k, (counts.get(k) ?? 0) - 1);
  }
  for (const [k, count] of counts) {
    if (count === 0) continue;
    const [date, merchant, amount] = JSON.parse(k) as [string, string, number];
    differences.push({ scope: '信用卡明細', month: date.slice(0, 7), kind: '信用卡明細逐筆內容',
      field: `逐筆 ${date} ${merchant} ${amount}`, source: '來源信用卡表',
      expected: count > 0 ? `來源比 App 多 ${count} 筆` : '來源沒有', actual: count > 0 ? 'App 沒有' : `App 比來源多 ${-count} 筆` });
  }
  return { differences, sourceCount: source.length, appCount: app.length, sourceSum, appSum };
}
