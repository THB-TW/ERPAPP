// 重算報告（純函式，只出報告，不影響成功或失敗）：用 App 的月結引擎，從原始交易把各月再算一遍，列出與存檔數字的差異。
//
// 方法：逐月「單步重算」。每個月 M 都從存檔的前一個月（M-1）當期初，套用 M 當時凍結的上限快照與分類歸屬，
// 以 M 的支出交易（依歸屬分配）與收入交易合計，呼叫引擎的 close 指令算出 M，再與存檔的 M 比對。
// 不從最早的月份一路累積重算：累積會把一個月的差異帶進之後每個月，看不出差異出在哪個月。
//
// 限制（舊系統本身就明定舊月份不能用現在的交易重算）：
// - 最早的月份沒有前一個月可當期初；沒有上限快照的月份（舊系統只有部分月份留有上限紀錄）沒有當時的上限；
//   交易有分類沒有歸屬到任何預算類別的月份，引擎會拒絕。這些一律標「無法重算」並寫原因，不硬湊數字。
// - 前一個月有歷史總資產差異時，引擎本來拒絕往下月結；這裡把期初的差異當 0 帶入（差異只影響帳面總資產，
//   不影響可用餘額、學費儲備與各分類儲備）。重算結果只比對這些會被月結改動的欄位，不比對帳面總資產。
// - 早期的手動調整（挪用、補入儲備、前期更正）不在月結裡，所以不會被重算出來；比對的是「原始月結」的存檔值（不含調整）。
// - 沿用前期上限版本的月份：快照是較早月份設定的上限，重算用的是那份快照，當時實際的調整過程可能不同。
// - 期初基準差額：舊資料帶入時，最近月份的「其他」帶有 Property.budget 與累計列合計的差額，月結引擎不會憑空算出它。
// - 早期的當月收入是使用者手動輸入的（舊系統存的是輸入值），不是收入交易的加總；重算用交易加總，兩者本來就可能不同。
// - 存檔的交易是現在的交易，不是當時月結時的交易；差異不代表 App 算錯。
import { BudgetRuleError, applyBudgetCommand, mappedBudgetCategory } from '../../src/calc/budgetEngine.ts';
import type { BudgetState } from '../../src/calc/budgetTypes.ts';
import { shiftMonth } from '../../src/calc/dates.ts';

export type NotRecomputableCode = 'no_prior_month' | 'no_cap_snapshot' | 'unmapped_expense' | 'engine_refused';

export const NOT_RECOMPUTABLE_TEXT: Record<NotRecomputableCode, string> = {
  no_prior_month: '前一個月沒有存檔，沒有期初可接',
  no_cap_snapshot: '該月沒有上限快照（舊系統只有部分月份留有上限紀錄）',
  unmapped_expense: '當月有支出分類沒有歸屬到預算類別',
  engine_refused: '引擎拒絕月結',
};

export interface RecomputeFieldDiff { field: string; kind: string; stored: number; recomputed: number }
export interface RecomputeMonth {
  month: string;
  status: 'match' | 'differs' | 'not_recomputable';
  code?: NotRecomputableCode;
  /** 無法重算的詳細原因（完整報告用，可能含分類名稱）。 */
  detail?: string;
  differences: RecomputeFieldDiff[];
}

export interface TransactionsOfMonth {
  /** 當月收入交易合計（帳本服務 getMonthIncome）。 */
  income: number;
  /** 當月每一筆支出（分類名稱與金額），不含收入。 */
  expenses: { category: string; amount: number }[];
}

/** 把支出交易依月份（交易日期的 YYYY-MM）分桶；收入不算。給重算報告用。 */
export function bucketExpensesByMonth(transactions: { date: string; flow: string; categoryName: string; amount: number }[]): Map<string, { category: string; amount: number }[]> {
  const byMonth = new Map<string, { category: string; amount: number }[]>();
  for (const t of transactions) {
    if (t.flow !== 'expense') continue;
    const month = t.date.slice(0, 7);
    const list = byMonth.get(month);
    if (list) list.push({ category: t.categoryName, amount: t.amount });
    else byMonth.set(month, [{ category: t.categoryName, amount: t.amount }]);
  }
  return byMonth;
}

export function recomputeMonths(
  /** 帳本裡的財務文件（原始月結，不含調整的影響）。 */
  state: BudgetState,
  transactions: (month: string) => TransactionsOfMonth,
): RecomputeMonth[] {
  const stored = new Map(state.months.map((m) => [m.month, m]));
  return [...stored.keys()].sort().map((month): RecomputeMonth => {
    const target = stored.get(month)!;
    const none = (code: NotRecomputableCode, detail?: string): RecomputeMonth =>
      ({ month, status: 'not_recomputable', code, detail: detail ?? NOT_RECOMPUTABLE_TEXT[code], differences: [] });
    const prior = stored.get(shiftMonth(month, -1));
    if (!prior) return none('no_prior_month');
    if (!target.revision) return none('no_cap_snapshot');
    const tx = transactions(month);
    const unmapped = [...new Set(tx.expenses.filter((e) => mappedBudgetCategory(target.revision!, e.category) === undefined).map((e) => e.category))].sort();
    if (unmapped.length > 0) return none('unmapped_expense', `${NOT_RECOMPUTABLE_TEXT.unmapped_expense}：${unmapped.map((n) => `「${n}」`).join('、')}`);

    const base: BudgetState = {
      version: 0, categories: state.categories, revisions: [target.revision], closeHistory: [], adjustments: [], receipts: [], checks: [],
      months: [{ ...prior, legacyTotalDifference: 0 }],
    };
    let closed;
    try {
      const after = applyBudgetCommand(
        base,
        { action: 'close', operationId: '00000000-0000-4000-8000-000000000001', version: 0, month, reason: '比對重算', amount: tx.income },
        { actor: 'legacy-compare', time: `${month}-15T00:00:00+08:00`, expenses: tx.expenses },
      );
      closed = after.months.find((m) => m.month === month)!;
    } catch (e) {
      if (e instanceof BudgetRuleError) return none('engine_refused', `${NOT_RECOMPUTABLE_TEXT.engine_refused}：${e.message}`);
      throw e;
    }

    const differences: RecomputeFieldDiff[] = [];
    const cmp = (field: string, kind: string, a: number, b: number) => {
      if (a !== b) differences.push({ field, kind, stored: a, recomputed: b });
    };
    cmp('當月收入（以收入交易合計重算）', '當月收入', target.income, closed.income);
    cmp('當月盈餘', '當月盈餘', target.surplus, closed.surplus);
    cmp('原始可用餘額（不含調整）', '可用餘額', target.rawSpare, closed.rawSpare);
    cmp('學費儲備', '學費儲備', target.tuition, closed.tuition);
    const nameOf = (id: string) => state.categories.find((c) => c.id === id)?.name ?? id;
    for (const [what, a, b] of [['當月儲備變動', target.changes, closed.changes], ['累計儲備', target.balances, closed.balances]] as const) {
      for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        cmp(`${what}：${nameOf(id)}`, what, Object.hasOwn(a, id) ? a[id] : 0, Object.hasOwn(b, id) ? b[id] : 0);
      }
    }
    return { month, status: differences.length > 0 ? 'differs' : 'match', differences };
  });
}
