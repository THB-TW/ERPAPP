export interface Entry {
  id: string; date: string; category: string; amount: number; account: string; member: string;
  type: '支' | '收'; note: string; source: string;
}
export interface Draft extends Omit<Entry, 'id' | 'source'> { operationId: string; }
export interface CategoryBudget {
  id: string; name: string; kind: 'reserve' | 'fixed' | 'actual'; cap: number; spent: number;
  remaining: number | null; confirmedReserve: number | null;
}
export interface Budget {
  month: string; closed: boolean; categories: CategoryBudget[]; spent: number; income: number;
  transactionCount: number; unmapped: { name: string; amount: number }[];
  closedThrough: string; carried: boolean;
}
export interface Bootstrap {
  owner: string; mode: 'local-preview'; today: string; accounts: string[]; members: string[];
  incomeCategories: string[]; budget: Budget;
  defaults: { account: string; member: string; category: string };
}
export interface SaveResult { entry: Entry; replay: boolean; budget: Budget; }
export interface HistoryMonth { month: string; spare: number; tuition: number; reserve: number; total: number; difference: number; }
export interface SqlStatement {
  bind(...values: (string | number | null)[]): SqlStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface SqlDatabase { prepare(sql: string): SqlStatement; }
