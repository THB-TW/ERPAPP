// 從財務文件的原始值，獨立算出每個月「應該」是什麼。算法照 tools/export-finance-baseline.ps1 逐月比對 dbo.Property 的做法
// （可用餘額＝原始可用餘額＋更正－補入；總儲備金＝各類別儲備合計＋補入；帳面總資產＝三者＋學費儲備＋歷史差異），
// 再延伸到各分類（補入加到 To；挪用從 From 搬到 To）。刻意不呼叫 App 的 budgetEngine.position，兩邊算法互為獨立。
import { LegacyExportError } from '../legacy-convert/legacyData.ts';
import type { RawDocument } from './sources.ts';

export interface ExpectedPosition {
  income: number;
  surplus: number;
  spare: number;
  tuition: number;
  reserve: number;
  total: number;
  legacyTotalDifference: number;
  balances: Map<string, number>;
}

export function expectedPositions(doc: RawDocument): Map<string, ExpectedPosition> {
  const closedMonths = new Set(doc.months.map((m) => m.month));
  const result = new Map<string, ExpectedPosition>();
  for (const m of doc.months) {
    if (result.has(m.month)) throw new LegacyExportError(`財務文件的 ${m.month} 有重複的月結。`);
    let spare = m.rawSpare;
    const balances = new Map(m.balances);
    const bump = (id: string | null, delta: number) => {
      if (id === null) throw new LegacyExportError('財務文件的調整缺少類別。');
      balances.set(id, (balances.get(id) ?? 0) + delta);
    };
    for (const a of doc.adjustments) {
      // 晚於該月，或所屬月份已被撤銷（待重結）的調整不算。
      if (a.month > m.month || !closedMonths.has(a.month)) continue;
      if (a.kind === 'correct') {
        spare += a.amount;
      } else if (a.kind === 'fund') {
        spare -= a.amount;
        bump(a.to, a.amount);
      } else if (a.kind === 'transfer') {
        bump(a.from, -a.amount);
        bump(a.to, a.amount);
      } else {
        throw new LegacyExportError(`財務文件有不認得的調整種類「${a.kind}」，需要明確對應後才能比對。`);
      }
    }
    let reserve = 0;
    for (const v of balances.values()) reserve += v;
    result.set(m.month, {
      income: m.income, surplus: m.surplus, spare, tuition: m.tuition, reserve, legacyTotalDifference: m.legacyTotalDifference,
      total: spare + m.tuition + reserve + m.legacyTotalDifference, balances,
    });
  }
  return result;
}
