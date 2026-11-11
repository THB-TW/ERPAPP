// 舊學費只有儲備與提撥，不能據此推造貸款總額、本金或結清月。
import type { Queryable } from '../db/driver.ts';
import type { BudgetState } from '../calc/budgetTypes.ts';

export async function hasLoanTables(q: Queryable): Promise<boolean> {
  return Boolean(await q.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'loans'"));
}

export async function initializeLegacyTuition(q: Queryable, state: BudgetState): Promise<void> {
  // 舊版備份測試與轉換工具可明確使用舊遷移清單。
  if (!await hasLoanTables(q)) return;
  if (await q.get('SELECT 1 FROM loans WHERE legacy = 1')) return;
  const hasTuitionCap = state.revisions.some((r) => r.tuition !== 0);
  if (!hasTuitionCap && (await q.get('SELECT 1 FROM loans') || !state.months.some((m) => m.tuition !== 0))) return;
  const id = (await q.run("INSERT INTO loans (category_id, created_month, legacy) VALUES (NULL, '1900-01', 1)")).lastInsertRowId;
  await q.run(`INSERT INTO loan_terms (loan_id, month, name, total_amount, monthly_payment, remaining_principal, expected_end_month, reason, time)
    VALUES (?, '1900-01', '學費儲備', NULL, NULL, NULL, NULL, '舊學費儲備原樣承接；本金資料待補', ?)`,
  [id, '']);
}

/** 舊格式文件不含貸款表；整份取代時一起重建衍生資料，避免沿用另一份文件的本金與快照。 */
export async function replaceLegacyLoans(q: Queryable, state: BudgetState): Promise<void> {
  if (!await hasLoanTables(q)) return;
  await q.run('DELETE FROM loan_closes');
  await q.run('DELETE FROM loan_terms');
  await q.run('DELETE FROM loans');
  await initializeLegacyTuition(q, state);
}
