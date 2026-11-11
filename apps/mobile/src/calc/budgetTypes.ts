// 預算引擎的資料形狀。移植自舊系統 Services/Budgeting/BudgetState.cs。
// 欄位名稱是 C# 屬性名稱的 camelCase（Version → version）；與舊財務文件 JSON（PascalCase）的對應
// 在 budgetDocument.ts。金額一律是新台幣整數，且必須是安全整數。
// 時間一律是 ISO 8601 字串（對應 C# DateTimeOffset），由呼叫端傳入，引擎不讀時鐘。

export interface BudgetCategoryDefinition {
  id: string;
  name: string;
  /** 'reserve'（儲備類）、'fixed'（固定支出）、'actual'（照實支）。 */
  kind: string;
}

export interface BudgetLimit {
  categoryId: string;
  amount: number;
}

/** 某月某一次儲存的完整上限與分類歸屬（上限版本）。 */
export interface BudgetRevision {
  id: string;
  month: string;
  limits: BudgetLimit[];
  /** 交易分類名稱 → 預算類別 id。 */
  mapping: Record<string, string>;
  /** 學費儲備每月提撥（票 19 才一般化為貸款）。 */
  tuition: number;
  reason: string;
  actor: string;
  time: string;
}

/** 原始月結（不含其後的手動調整）。 */
export interface MonthClose {
  id: string;
  month: string;
  income: number;
  surplus: number;
  rawSpare: number;
  tuition: number;
  balances: Record<string, number>;
  changes: Record<string, number>;
  expenses: Record<string, number>;
  revision: BudgetRevision | null;
  migrated: boolean;
  legacyTotalDifference: number;
  legacyBalanceAnchor: number;
  time: string;
  actor: string;
}

export interface BudgetAmountChange {
  month: string;
  /** 'spare'、'total' 或 'reserve'。 */
  field: string;
  categoryId: string | null;
  before: number;
  after: number;
}

export interface BudgetAdjustment {
  id: string;
  month: string;
  /** 'transfer'（挪用）、'fund'（補入儲備）、'correct'（前期更正）。 */
  kind: string;
  amount: number;
  from: string | null;
  to: string | null;
  reason: string;
  actor: string;
  time: string;
  reverses: string | null;
  changes: BudgetAmountChange[];
}

export interface BudgetReceipt {
  id: string;
  fingerprint: string;
  action: string;
  month: string;
  reason: string;
  actor: string;
  time: string;
}

export interface BudgetState {
  version: number;
  categories: BudgetCategoryDefinition[];
  revisions: BudgetRevision[];
  months: MonthClose[];
  closeHistory: MonthClose[];
  adjustments: BudgetAdjustment[];
  receipts: BudgetReceipt[];
  /** 總資產核對紀錄（票 13 才使用）。內部形狀這張票原樣保存，不解讀。 */
  checks: unknown[];
}

export interface BudgetCommand {
  action: string;
  operationId: string;
  version: number;
  month: string;
  reason: string;
  from?: string | null;
  to?: string | null;
  amount?: number;
  name?: string | null;
  /** 預設 'reserve'（同 C#）。 */
  kind?: string;
  limits?: BudgetLimit[];
  tuition?: number;
  sourceCategory?: string | null;
  reverses?: string | null;
}

/** 月結時某一筆支出：交易分類名稱與正整數金額。 */
export interface BudgetExpense {
  category: string;
  amount: number;
}

export interface MonthPosition {
  month: string;
  income: number;
  /** 可用餘額。 */
  spare: number;
  /** 學費儲備。 */
  tuition: number;
  /** 各類別儲備。 */
  balances: Record<string, number>;
  /** 總儲備金。與可用餘額互斥，不重複計算。 */
  reserve: number;
  legacyTotalDifference: number;
  /** 帳面總資產 ＝ 可用餘額 ＋ 學費儲備 ＋ 總儲備金 ＋ 歷史差異。 */
  total: number;
}
