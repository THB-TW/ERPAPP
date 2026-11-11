// 預算指令與預覽共用同一次純計算；只有確認儲存才寫入，並由 index.ts 包在 SQLite 交易內。
import type { Queryable } from '../db/driver.ts';
import { taipeiDate } from '../calc/dates.ts';
import { BUDGET_ACTOR, applyBudgetCommand, BudgetRuleError } from '../calc/budgetEngine.ts';
import type { BudgetAmountChange, BudgetCommand, BudgetExpense, BudgetState } from '../calc/budgetTypes.ts';
import { readStoredDocument, writeState } from './financeDocument.ts';
import { budgetStatus, type BudgetStatus } from './budgetViews.ts';
import { categoryAvailability, ensureExpenseCategory, renameExpenseCategory, setCategoryInactive } from './categoryLifecycle.ts';
import { LedgerError } from './errors.ts';
import { assertCardReconciliation } from './cardReconciliation.ts';
import { loanCategoryNames, prepareLoanClose, saveLoanClose } from './loans.ts';
import { initializeLegacyTuition } from './loanMigration.ts';

export interface BudgetCommandPreview {
  before: BudgetStatus;
  after: BudgetStatus;
  /** 停用有儲備的類別時，預覽引擎產生的守恆挪用。 */
  changes: BudgetAmountChange[];
}

export interface BudgetCommandAccess {
  /** 舊帳工具可省略；App 的付費指令須明確帶入訂閱模組判斷。 */
  hasEntitlement?: boolean;
}

export function assertMonthlyCloseAccess(hasEntitlement: boolean): void {
  if (hasEntitlement !== true) throw new BudgetRuleError('operation', '需要有效的付費權益才能進行月結。');
}

export async function budgetFallbackMonth(q: Queryable, now: Date): Promise<string> {
  return (await q.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_date'"))?.value.slice(0, 7) ?? taipeiDate(now).slice(0, 7);
}

export async function monthExpenses(q: Queryable, month: string): Promise<BudgetExpense[]> {
  const loans = await loanCategoryNames(q, month);
  const expenses = await q.all<BudgetExpense>(`SELECT c.name AS category, t.amount FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.flow = 'expense' AND substr(t.date, 1, 7) = ? ORDER BY t.id`, [month]);
  return expenses.filter((e) => !loans.has(e.category));
}

function sourceName(command: BudgetCommand): string | null {
  if (command.action === 'add' || command.action === 'edit') return (command.name ?? '').trim() || null;
  if (command.action === 'map') return (command.sourceCategory ?? '').trim() || null;
  return null;
}

async function assertNamesAvailable(q: Queryable, command: BudgetCommand, state: BudgetState, fallback: string): Promise<void> {
  const name = sourceName(command);
  if (!name) return;
  const loans = await loanCategoryNames(q, '9998-12');
  if ([...loans].some((loan) => loan.toUpperCase() === name.toUpperCase())) {
    throw new BudgetRuleError('argument', '貸款分類使用獨立提撥，請到貸款／分期設定修改，不能另設一般預算歸屬。');
  }
  const clash = await q.get<{ id: number; name: string; flow: string }>('SELECT id, name, flow FROM categories WHERE name = ? COLLATE NOCASE', [name]);
  if (!clash) return;
  if (clash.flow !== 'expense') throw new LedgerError('category_name_conflict', '這個名稱已用於收入分類，請使用其他支出名稱。');
  const oldName = state.categories.find((c) => c.id === command.from)?.name;
  if (command.action === 'edit' && name !== oldName) {
    const status = budgetStatus(state, fallback);
    const mapping = status.currentRevision?.mapping;
    const ownFormerName = mapping && Object.hasOwn(mapping, clash.name) && mapping[clash.name] === command.from
      && await categoryAvailability(q, clash.id, status.openMonth) === 'inactive';
    if (!ownFormerName) throw new BudgetRuleError('argument', '這個名稱已用於其他交易分類，請使用不重複的名稱。');
  }
}

async function syncCategories(q: Queryable, command: BudgetCommand, state: BudgetState, fallback: string): Promise<void> {
  const name = sourceName(command);
  const open = budgetStatus(state, fallback).openMonth;
  if (command.action === 'edit') {
    const oldName = state.categories.find((c) => c.id === command.from)!.name;
    if (oldName !== name) {
      const mapping = budgetStatus(state, fallback).currentRevision?.mapping;
      if (mapping && Object.hasOwn(mapping, oldName) && mapping[oldName] === command.from) {
        await renameExpenseCategory(q, oldName, name!, open);
      } else await ensureExpenseCategory(q, name!, open);
    }
  } else if (name) {
    await ensureExpenseCategory(q, name, open);
  } else if (command.action === 'retire') {
    const revision = budgetStatus(state, fallback).currentRevision;
    for (const source of Object.keys(revision?.mapping ?? {})) {
      if (revision!.mapping[source] !== command.from) continue;
      const row = await q.get<{ id: number }>("SELECT id FROM categories WHERE name = ? AND flow = 'expense'", [source]);
      if (row) await setCategoryInactive(q, row.id, open);
    }
  }
}

export async function executeBudgetCommand(q: Queryable, input: BudgetCommand, now: Date, preview = false, access: BudgetCommandAccess = {}) {
  if ((input.action === 'close' || input.action === 'rollback') && access.hasEntitlement !== undefined) {
    assertMonthlyCloseAccess(access.hasEntitlement);
  }
  if (!preview && input.action === 'close' && access.hasEntitlement !== undefined) {
    throw new BudgetRuleError('operation', '請透過月結精靈保存總資產核對後完成月結。');
  }
  // 新增分類預設照實支，既有引擎與舊文件的 reserve 預設不變。
  const command = input.action === 'add' ? { ...input, kind: input.kind ?? 'actual' } : input;
  const { exists, state } = await readStoredDocument(q);
  const operationId = typeof command.operationId === 'string' ? command.operationId.toLowerCase() : '';
  const replay = state.receipts.some((r) => r.id === operationId);
  const fallback = await budgetFallbackMonth(q, now);
  if (!replay) await assertNamesAvailable(q, command, state, fallback);
  const expenses = command.action === 'close' && !replay ? await monthExpenses(q, command.month) : undefined;
  const loans = command.action === 'close' && !replay ? await prepareLoanClose(q, state, command.month) : undefined;
  const after = applyBudgetCommand(state, command, { actor: BUDGET_ACTOR, time: now.toISOString(), openingMonth: fallback, expenses, loans: loans?.totals });
  if (command.action === 'close' && !replay) await assertCardReconciliation(q, command.month);
  if (!preview && after !== state) {
    await writeState(q, exists, state.version, after);
    await syncCategories(q, command, state, fallback);
    if (loans) await saveLoanClose(q, operationId, command.month, loans.rows);
    await initializeLegacyTuition(q, after);
  }
  return {
    state: after,
    result: { version: after.version, replayed: after === state },
    preview: {
      before: budgetStatus(state, fallback), after: budgetStatus(after, fallback),
      changes: after === state ? [] : after.adjustments.find((a) => a.id === operationId)?.changes ?? [],
    } satisfies BudgetCommandPreview,
  };
}
