// 調整流程只包裝既有引擎；預覽不落盤，確認由 openLedger 放在同一筆 SQLite 交易內。
import type { Queryable } from '../db/driver.ts';
import { isValidMonth, shiftMonth } from '../calc/dates.ts';
import { BudgetRuleError, commandFingerprint } from '../calc/budgetEngine.ts';
import { serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetCommand, BudgetState } from '../calc/budgetTypes.ts';
import { budgetFallbackMonth, executeBudgetCommand, type BudgetCommandPreview } from './budgetCommands.ts';
import { budgetAdjustments, budgetMonth, budgetStatus, type BudgetAdjustmentView, type BudgetMonthView } from './budgetViews.ts';
import { readStoredDocument } from './financeDocument.ts';

export type AdjustmentAction = 'transfer' | 'fund' | 'correct' | 'reverse' | 'retire' | 'rollback';
export interface AdjustmentRequest { command: BudgetCommand; hasEntitlement: boolean }
export interface ConfirmAdjustmentRequest extends AdjustmentRequest { previewToken: string }
export interface AdjustmentPreview extends BudgetCommandPreview {
  /** 每個受影響已結月份；撤銷的月份 after 為 null。 */
  months: { month: string; before: BudgetMonthView; after: BudgetMonthView | null }[];
  latestBefore: BudgetMonthView | null;
  latestAfter: BudgetMonthView | null;
  /** 確認後將處於待重結的調整，包含原本就待重結的紀錄。 */
  pending: BudgetAdjustmentView[];
  previewToken: string;
}

function assertRequest(input: AdjustmentRequest): void {
  if (input.hasEntitlement !== true) throw new BudgetRuleError('operation', '需要有效的付費權益才能進行調整；既有紀錄仍可查閱。');
  if (!['transfer', 'fund', 'correct', 'reverse', 'retire', 'rollback'].includes(input.command.action)) {
    throw new BudgetRuleError('argument', '請選擇有效的調整動作。');
  }
}

/** ADR 0004：缺快照的搬遷月份與歷史差異不得因更正或更正的沖銷而被改寫。 */
async function assertCorrectionHistory(q: Queryable, state: BudgetState, command: BudgetCommand): Promise<void> {
  let target: string | undefined;
  if (command.action === 'correct' && isValidMonth(command.month)) target = shiftMonth(command.month, -1);
  if (command.action === 'reverse') {
    const original = state.adjustments.find((a) => a.id === command.reverses);
    if (original?.kind === 'correct') target = original.month;
  }
  if (!target) return;
  const opening = (await q.get<{ value: string }>("SELECT value FROM settings WHERE key = 'opening_date'"))?.value.slice(0, 7);
  const first = state.months.map((m) => m.month).sort()[0];
  // 新戶開帳前一月是期初基準，刻意沒有月結快照；不能把搬遷截止月誤認為期初。
  const baseline = opening && first === shiftMonth(opening, -1) ? first : null;
  const blocked = state.months.find((m) => m.month >= target! && (m.legacyTotalDifference !== 0 ||
    (m.migrated && m.revision === null && m.month !== baseline)));
  if (blocked) throw new BudgetRuleError('operation', `${blocked.month} 搬遷月份缺少上限快照或留有歷史資產加總差異，請先核對；本次尚未更正或沖銷。`);
}

function token(state: BudgetState, command: BudgetCommand): string {
  // 同版本的備份取代也會使預覽失效；只比較版本號不足以保護使用者看過的金額。
  return JSON.stringify([commandFingerprint(command), serializeBudgetDocument(state)]);
}

export async function previewAdjustment(q: Queryable, input: AdjustmentRequest, now: Date): Promise<AdjustmentPreview> {
  assertRequest(input);
  const { state } = await readStoredDocument(q);
  const { state: after, preview } = await executeBudgetCommand(q, input.command, now, true, input);
  await assertCorrectionHistory(q, state, input.command);
  const fallback = await budgetFallbackMonth(q, now);
  const latestBefore = budgetStatus(state, fallback).latestMonth;
  const latestAfter = budgetStatus(after, fallback).latestMonth;
  const months = state.months.map((m) => ({ month: m.month,
    before: budgetMonth(state, m.month, fallback)!, after: budgetMonth(after, m.month, fallback) }))
    .filter((row) => row.after === null || preview.changes.some((change) => change.month === row.month))
    .sort((a, b) => a.month.localeCompare(b.month));
  return { ...preview, months,
    latestBefore: latestBefore ? budgetMonth(state, latestBefore, fallback) : null,
    latestAfter: latestAfter ? budgetMonth(after, latestAfter, fallback) : null,
    pending: budgetAdjustments(after).filter((a) => a.pending), previewToken: token(state, input.command) };
}

export async function confirmAdjustment(q: Queryable, input: ConfirmAdjustmentRequest, now: Date) {
  assertRequest(input);
  const { state } = await readStoredDocument(q);
  const operationId = typeof input.command.operationId === 'string' ? input.command.operationId.toLowerCase() : '';
  if (state.receipts.some((r) => r.id === operationId)) {
    // 引擎仍核對指紋；成功後再重送不重新套用，也不受之後的撤銷／重結干擾。
    return (await executeBudgetCommand(q, input.command, now, false, input)).result;
  }
  const preview = await previewAdjustment(q, input, now);
  if (typeof input.previewToken !== 'string' || input.previewToken !== preview.previewToken) {
    throw new BudgetRuleError('operation', '資料或調整內容已變動，請重新預覽後再確認。');
  }
  return (await executeBudgetCommand(q, input.command, now, false, input)).result;
}
