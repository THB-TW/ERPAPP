// 預算頁與月結列表要顯示的數字：由財務文件（BudgetState）算出的唯讀檢視。純函式，不碰資料庫。
import {
  effectiveRevision,
  latestMonth,
  openMonth,
  position,
  mappedBudgetCategory,
  BudgetRuleError,
} from '../calc/budgetEngine.ts';
import type { BudgetAmountChange, BudgetCategoryDefinition, BudgetRevision, BudgetState } from '../calc/budgetTypes.ts';

export interface BudgetStatus {
  version: number;
  /** 最近一次月結的月份；還沒有任何月結為 null。 */
  latestMonth: string | null;
  /** 開放月份：只能調整這個月的上限與分類歸屬。 */
  openMonth: string;
  /** 目前生效（開放月份採用）的上限版本；還沒設定過為 null。 */
  currentRevision: BudgetRevision | null;
  categories: (BudgetCategoryDefinition & { active: boolean })[];
}

export interface BudgetProgressRow {
  categoryId: string;
  name: string;
  kind: 'reserve' | 'fixed' | 'actual';
  cap: number | null;
  spent: number;
  remaining: number | null;
}

export interface BudgetProgress {
  month: string;
  openMonth: string;
  rows: BudgetProgressRow[];
  unmapped: { categoryId: number; name: string; spent: number }[];
  totalSpent: number;
  totalCap: number;
}

function safeSum(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new BudgetRuleError('overflow', '金額超出可安全計算的範圍，已拒絕。');
  return result;
}

/** 沿用引擎的有效版本與歸屬規則；實支由帳本服務查出，不重算任何月結。 */
export function budgetProgress(state: BudgetState, month: string, fallback: string,
  expenses: { categoryId: number; name: string; spent: number }[]): BudgetProgress {
  const closed = state.months.find((m) => m.month === month);
  const revision = closed ? closed.revision : effectiveRevision(state, month);
  const rows: BudgetProgressRow[] = (revision?.limits ?? []).map((l) => {
    const definition = state.categories.find((c) => c.id === l.categoryId);
    if (!definition || !['reserve', 'fixed', 'actual'].includes(definition.kind)) throw new BudgetRuleError('operation', '找不到有效的預算類別與用途。');
    return { categoryId: l.categoryId, name: definition.name, kind: definition.kind as BudgetProgressRow['kind'],
      cap: definition.kind === 'actual' ? null : l.amount, spent: 0, remaining: definition.kind === 'actual' ? null : l.amount };
  });
  const unmapped: BudgetProgress['unmapped'] = [];
  let totalSpent = 0;
  for (const expense of expenses) {
    totalSpent = safeSum(totalSpent, expense.spent);
    const id = revision && mappedBudgetCategory(revision, expense.name);
    const row = rows.find((r) => r.categoryId === id);
    if (!row) unmapped.push(expense);
    else {
      row.spent = safeSum(row.spent, expense.spent);
      row.remaining = row.cap === null ? null : safeSum(row.cap, -row.spent);
    }
  }
  return { month, openMonth: openMonth(state, fallback), rows, unmapped, totalSpent,
    totalCap: rows.reduce((sum, r) => safeSum(sum, r.cap ?? 0), 0) };
}

export interface BudgetReserveView {
  categoryId: string;
  name: string;
  kind: string;
  /** 是否仍在開放月份的上限版本內（停用的類別只留歷史餘額）。 */
  active: boolean;
  balance: number;
}

export interface BudgetMonthView {
  month: string;
  income: number;
  /** 當月盈餘（原始月結值）。 */
  surplus: number;
  /** 可用餘額（含已生效的前期更正與補入儲備）。 */
  spare: number;
  /** 學費儲備。 */
  tuition: number;
  /** 總儲備金（各類別儲備合計）。 */
  reserve: number;
  /** 帳面總資產。 */
  total: number;
  legacyTotalDifference: number;
  reserves: BudgetReserveView[];
  /** 該月月結採用並凍結的上限快照；舊帳期初基準月沒有。 */
  capSnapshot: BudgetRevision | null;
  migrated: boolean;
}

export interface BudgetMonthSummary {
  month: string;
  income: number;
  surplus: number;
  spare: number;
  tuition: number;
  reserve: number;
  total: number;
  migrated: boolean;
}

export interface BudgetAdjustmentView {
  id: string;
  month: string;
  kind: string;
  amount: number;
  from: string | null;
  to: string | null;
  reason: string;
  time: string;
  reverses: string | null;
  /** 這筆已被沖銷。 */
  reversed: boolean;
  /** 所屬月份已被撤銷，等該月重結時恢復影響。 */
  pending: boolean;
  changes: BudgetAmountChange[];
}

export function budgetStatus(state: BudgetState, fallbackMonth: string): BudgetStatus {
  const open = openMonth(state, fallbackMonth);
  const revision = effectiveRevision(state, open) ?? null;
  const active = new Set(revision?.limits.map((l) => l.categoryId));
  const latest = latestMonth(state);
  return {
    version: state.version,
    latestMonth: latest === '' ? null : latest,
    openMonth: open,
    currentRevision: revision,
    categories: state.categories.map((c) => ({ ...c, active: active.has(c.id) })),
  };
}

export function budgetMonth(state: BudgetState, month: string, fallbackMonth: string): BudgetMonthView | null {
  const raw = state.months.find((m) => m.month === month);
  if (!raw) return null;
  const p = position(state, month);
  const active = new Set(effectiveRevision(state, openMonth(state, fallbackMonth))?.limits.map((l) => l.categoryId));
  return {
    month, income: p.income, surplus: raw.surplus, spare: p.spare, tuition: p.tuition, reserve: p.reserve, total: p.total,
    legacyTotalDifference: p.legacyTotalDifference,
    reserves: Object.keys(p.balances).map((id) => {
      const definition = state.categories.find((c) => c.id === id);
      return { categoryId: id, name: definition?.name ?? id, kind: definition?.kind ?? '', active: active.has(id), balance: p.balances[id] };
    }),
    capSnapshot: raw.revision,
    migrated: raw.migrated,
  };
}

export function budgetMonths(state: BudgetState): BudgetMonthSummary[] {
  return [...state.months]
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    .map((raw) => {
      const p = position(state, raw.month);
      return { month: raw.month, income: p.income, surplus: raw.surplus, spare: p.spare, tuition: p.tuition, reserve: p.reserve, total: p.total, migrated: raw.migrated };
    });
}

export function budgetAdjustments(state: BudgetState): BudgetAdjustmentView[] {
  return state.adjustments.map((a) => ({
    id: a.id, month: a.month, kind: a.kind, amount: a.amount, from: a.from, to: a.to, reason: a.reason, time: a.time,
    reverses: a.reverses,
    reversed: state.adjustments.some((x) => x.reverses === a.id),
    pending: !state.months.some((m) => m.month === a.month),
    changes: a.changes,
  }));
}
