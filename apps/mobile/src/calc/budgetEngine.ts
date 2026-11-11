// 預算與月結引擎：「狀態＋指令 → 新狀態」的純函式。
// 逐行移植自舊系統 Services/Budgeting/BudgetEngine.cs；規則、驗證順序與繁體中文訊息以它為準，不改義。
// 與 C# 的刻意差異（見 apps/mobile 的票 03 回報）：
// - 不讀時鐘：時間（ISO 字串）與「尚無任何月結時的開放月份」都由 context 的 time 決定。
// - 金額溢位：C# 用 32 位元整數加 checked；這裡所有金額是安全整數，超出就丟 kind 'overflow' 的錯，不悄悄失準。
// - 指令指紋：C# 對指令做 SHA-256；這裡用穩定的正規化字串（只用來判斷「同一操作識別碼是否同一內容」）。
import { shiftMonth, isValidMonth } from './dates.ts';
import type {
  BudgetAdjustment,
  BudgetAmountChange,
  BudgetCommand,
  BudgetExpense,
  BudgetRevision,
  BudgetState,
  MonthClose,
  MonthPosition,
} from './budgetTypes.ts';

/** 單機 App 沒有多使用者，actor 固定這個值；欄位保留是為了舊財務文件原樣匯入。 */
export const BUDGET_ACTOR = 'app';

/**
 * 引擎拒絕指令時丟出。kind 對應 C# 的例外型別：
 * 'argument'＝ArgumentException（輸入本身不合法），'operation'＝InvalidOperationException（狀態不允許），
 * 'overflow'＝C# checked 溢位（OverflowException）。message 是可直接顯示的繁體中文。
 */
export class BudgetRuleError extends Error {
  readonly kind: 'argument' | 'operation' | 'overflow';
  constructor(kind: 'argument' | 'operation' | 'overflow', message: string) {
    super(message);
    this.name = 'BudgetRuleError';
    this.kind = kind;
  }
}
const argumentError = (message: string) => new BudgetRuleError('argument', message);
const operationError = (message: string) => new BudgetRuleError('operation', message);

export interface BudgetContext {
  actor: string;
  /** ISO 8601 時間字串，由呼叫端傳入。 */
  time: string;
  /** 只有 close 使用：該月每一筆支出（交易分類名稱與正整數金額）。 */
  expenses?: readonly BudgetExpense[];
}

// ---- 安全整數運算（對應 C# checked）----

function safe(n: number): number {
  if (!Number.isSafeInteger(n)) throw new BudgetRuleError('overflow', '金額超出可安全計算的範圍，已拒絕。');
  return n === 0 ? 0 : n; // 把 -0 正規化成 0
}
const add = (a: number, b: number) => safe(a + b);
const sub = (a: number, b: number) => safe(a - b);
const neg = (a: number) => safe(0 - a);

// ---- 字典（交易分類名稱是使用者輸入，可能叫 "__proto__" 或 "constructor"，所以一律用自有屬性存取）----

function own<T>(dict: Record<string, T>, key: string | null | undefined): T | undefined {
  return key != null && Object.hasOwn(dict, key) ? dict[key] : undefined;
}
function put<T>(dict: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(dict, key, { value, enumerable: true, writable: true, configurable: true });
}
function remove(dict: Record<string, unknown>, key: string): void {
  delete dict[key];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---- 月份 ----

const MONTH_FORMAT_MESSAGE = '月份格式不正確，請用 YYYY-MM。';

/** 對應 C# MonthDate：只接受 yyyy-MM；年份超出 1900～9998 時由 Apply 另外以「月份超出範圍」拒絕。 */
function checkMonthFormat(month: string): number {
  if (typeof month !== 'string' || !isValidMonth(month)) throw argumentError(MONTH_FORMAT_MESSAGE);
  return Number(month.slice(0, 4));
}

function taipeiMonthOf(time: string): string {
  const ms = Date.parse(time);
  if (Number.isNaN(ms)) throw argumentError('時間格式不正確。');
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

const compareOrdinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---- 查詢 ----

/** 最近一次月結的月份；沒有任何月結時為空字串。 */
export function latestMonth(state: BudgetState): string {
  let best = '';
  for (const m of state.months) if (compareOrdinal(m.month, best) > 0) best = m.month;
  return best;
}

/**
 * 開放月份＝最近一次月結月份的次月。還沒有任何月結時，C# 取今天的月份；
 * 這裡取 fallbackMonth（呼叫端用目前時間換算成台北月份傳入）。開帳月怎麼決定屬於票 18。
 */
export function openMonth(state: BudgetState, fallbackMonth: string): string {
  const last = latestMonth(state);
  return last.length > 0 ? shiftMonth(last, 1) : fallbackMonth;
}

/** 某月採用的上限版本：月份不晚於該月的版本中最晚的一個（同月份取清單中最後一個）；沒有則為 undefined。 */
export function effectiveRevision(state: BudgetState, month: string): BudgetRevision | undefined {
  const candidates = state.revisions.filter((r) => compareOrdinal(r.month, month) <= 0);
  candidates.sort((a, b) => compareOrdinal(a.month, b.month)); // Array.sort 是穩定排序，同 LINQ OrderBy
  return candidates[candidates.length - 1];
}

/** 某月的位置（含其後與之前的調整）。月份必須是已結月份。 */
export function position(state: BudgetState, month: string): MonthPosition {
  const matches = state.months.filter((m) => m.month === month);
  if (matches.length !== 1) throw operationError(`找不到唯一的已結月份 ${month}。`);
  const raw = matches[0];
  const balances: Record<string, number> = {};
  for (const key of Object.keys(raw.balances)) put(balances, key, raw.balances[key]);
  let spare = raw.rawSpare;
  for (const a of state.adjustments) {
    if (compareOrdinal(a.month, month) > 0 || !state.months.some((m) => m.month === a.month)) continue;
    if (a.kind === 'correct') {
      spare = add(spare, a.amount);
    } else if (a.kind === 'fund') {
      spare = sub(spare, a.amount);
      put(balances, a.to!, add(own(balances, a.to) ?? 0, a.amount));
    } else {
      put(balances, a.from!, sub(own(balances, a.from) ?? 0, a.amount));
      put(balances, a.to!, add(own(balances, a.to) ?? 0, a.amount));
    }
  }
  let reserve = 0;
  for (const key of Object.keys(balances)) reserve = add(reserve, balances[key]);
  const total = add(add(add(spare, raw.tuition), reserve), raw.legacyTotalDifference);
  return {
    month, income: raw.income, spare, tuition: raw.tuition, balances, reserve,
    legacyTotalDifference: raw.legacyTotalDifference, total,
  };
}

// ---- 指令指紋 ----

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** 指令內容的穩定正規化字串；同一個操作識別碼只有在指紋相同時才視為重送。 */
export function commandFingerprint(c: BudgetCommand): string {
  return JSON.stringify([
    c.action, c.operationId.toLowerCase(), c.version, c.month, c.reason,
    c.from ?? null, c.to ?? null, c.amount ?? 0, c.name ?? null, c.kind ?? 'reserve',
    (c.limits ?? []).map((l) => [l.categoryId, l.amount]), c.tuition ?? 0, c.sourceCategory ?? null, c.reverses ?? null,
  ]);
}

function checkNumbers(c: BudgetCommand): void {
  const numbers = [c.version, c.amount ?? 0, c.tuition ?? 0, ...(c.limits ?? []).map((l) => l.amount)];
  if (!numbers.every((n) => Number.isSafeInteger(n))) throw argumentError('指令中的金額與版本必須是整數。');
}

// ---- 套用指令 ----

export function applyBudgetCommand(state: BudgetState, input: BudgetCommand, context: BudgetContext): BudgetState {
  const { actor, time } = context;
  if (typeof input.operationId !== 'string' || input.operationId.trim() === '' || input.operationId.toLowerCase() === EMPTY_GUID) {
    throw argumentError('缺少操作識別碼，請重新載入頁面。');
  }
  if (!GUID_PATTERN.test(input.operationId)) throw argumentError('操作識別碼格式不正確。');
  const command: BudgetCommand = { ...input, operationId: input.operationId.toLowerCase() };
  checkNumbers(command);
  const opId = command.operationId;
  const fingerprint = commandFingerprint(command);
  const receipt = state.receipts.find((r) => r.id === opId);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) throw operationError('操作識別碼已用於其他內容，請重新載入。');
    return state;
  }
  if (state.version !== command.version) throw operationError('資料已被其他操作更新，請重新載入後再試。');
  const reason = (command.reason ?? '').trim();
  if (reason.length === 0 || reason.length > 300) throw argumentError('請填寫 1～300 字的原因。');
  const year = checkMonthFormat(command.month);
  if (year < 1900 || year > 9998) throw argumentError('月份超出範圍。');

  const fallbackMonth = taipeiMonthOf(time);
  const next = clone(state);
  const amount = command.amount ?? 0;
  const open = () => openMonth(next, fallbackMonth);

  switch (command.action) {
    case 'map': {
      const draft = newRevision(next, command, reason, actor, time, fallbackMonth);
      const sourceCategory = (command.sourceCategory ?? '').trim();
      if (sourceCategory.length < 1 || sourceCategory.length > 50 || !draft.limits.some((l) => l.categoryId === command.to)) {
        throw argumentError('請選擇有效的交易分類與使用中的預算類別。');
      }
      put(draft.mapping, sourceCategory, command.to!);
      next.revisions.push(draft);
      break;
    }
    case 'retire': {
      const draft = newRevision(next, command, reason, actor, time, fallbackMonth);
      if (!draft.limits.some((l) => l.categoryId === command.from)) throw argumentError('類別已停用或不存在。');
      const remaining = own(position(next, latestMonth(next)).balances, command.from) ?? 0;
      if (remaining < 0) throw operationError('請先補足負儲備，再移除類別。');
      if (remaining > 0) {
        transfer(next, { operationId: opId, month: latestMonth(next), from: command.from, to: command.to, amount: remaining, reason }, actor, time, fallbackMonth);
      }
      draft.limits = draft.limits.filter((l) => l.categoryId !== command.from);
      for (const key of Object.keys(draft.mapping)) if (draft.mapping[key] === command.from) remove(draft.mapping, key);
      next.revisions.push(draft);
      break;
    }
    case 'reverse': {
      if (command.month !== latestMonth(next)) throw operationError('請從最近已結月份沖銷調整。');
      const original = next.adjustments.find((a) => a.id === command.reverses);
      if (!original) throw operationError('找不到原調整紀錄。');
      if (original.reverses != null || next.adjustments.some((a) => a.reverses === original.id)) {
        throw operationError('原調整已沖銷，或本身為沖銷紀錄。');
      }
      if (!next.months.some((m) => m.month === original.month)) throw operationError('原月份待重結，請先重結再沖銷。');
      if (original.kind === 'transfer') {
        transfer(next, { operationId: opId, month: latestMonth(next), from: original.to, to: original.from, amount: original.amount, reason }, actor, time, fallbackMonth);
        next.adjustments[next.adjustments.length - 1].reverses = original.id;
      } else if (original.kind === 'fund') {
        fundReserve(next, { operationId: opId, month: latestMonth(next), to: original.to, amount: neg(original.amount), reason }, actor, time, fallbackMonth);
        next.adjustments[next.adjustments.length - 1].reverses = original.id;
      } else {
        next.adjustments.push(newAdjustment(opId, original.month, 'correct', neg(original.amount), null, null, reason, actor, time, original.id));
      }
      break;
    }
    case 'caps': {
      const draft = newRevision(next, command, reason, actor, time, fallbackMonth);
      const limits = command.limits ?? [];
      const a = limits.map((l) => l.categoryId).sort();
      const b = draft.limits.map((l) => l.categoryId).sort();
      if (a.length !== b.length || a.some((id, i) => id !== b[i])) {
        throw argumentError('上限欄位與目前使用中的類別不符，請重新載入。');
      }
      for (const limit of limits) {
        cap(limit.amount);
        const definition = singleCategory(next, limit.categoryId);
        if (definition.kind === 'actual' && limit.amount !== 0) throw argumentError('照實支類別不設定上限。');
      }
      cap(command.tuition ?? 0);
      draft.limits = limits.map((l) => ({ categoryId: l.categoryId, amount: l.amount }));
      draft.tuition = command.tuition ?? 0;
      next.revisions.push(draft);
      break;
    }
    case 'add': {
      const draft = newRevision(next, command, reason, actor, time, fallbackMonth);
      const name = (command.name ?? '').trim();
      if (name.length < 1 || name.length > 30 || next.categories.some((c) => c.name.toUpperCase() === name.toUpperCase())) {
        throw argumentError('請填寫不重複的類別名稱（1～30 字，含已停用名稱）。');
      }
      const kind = command.kind ?? 'reserve';
      if (kind !== 'reserve' && kind !== 'fixed' && kind !== 'actual') throw argumentError('類別用途不正確。');
      cap(amount);
      next.categories.push({ id: opId, name, kind });
      draft.limits.push({ categoryId: opId, amount: kind === 'actual' ? 0 : amount });
      put(draft.mapping, name, opId);
      next.revisions.push(draft);
      break;
    }
    case 'transfer':
      transfer(next, { operationId: opId, month: command.month, from: command.from, to: command.to, amount, reason }, actor, time, fallbackMonth);
      break;
    case 'fund':
      if (amount <= 0) throw argumentError('補入金額須為正整數。');
      fundReserve(next, { operationId: opId, month: command.month, to: command.to, amount, reason }, actor, time, fallbackMonth);
      break;
    case 'correct': {
      if (command.month !== open() && !next.months.some((m) => m.month === command.month)) {
        throw operationError('請選擇已結月份或開放月份來更正前期。');
      }
      const target = shiftMonth(command.month, -1);
      if (!next.months.some((m) => m.month === target)) throw operationError('前一個月尚無已結資料。');
      if (next.months.some((m) => compareOrdinal(m.month, target) >= 0 && m.legacyTotalDifference !== 0)) {
        throw operationError('影響範圍含有既有資產加總差異，請先核對；本次尚未更正。');
      }
      if (amount === 0 || Math.abs(amount) > 1_000_000_000) throw argumentError('請填寫非零且範圍內的調整數。');
      next.adjustments.push(newAdjustment(opId, target, 'correct', amount, null, null, reason, actor, time, null));
      break;
    }
    case 'rollback': {
      if (command.month !== latestMonth(next) || next.months.length < 2) {
        throw operationError('只能撤銷最近月份，且須保留期初基準。');
      }
      const rollbackMonth = next.months.find((m) => m.month === command.month)!;
      const prior = next.months
        .filter((m) => m.month !== command.month)
        .reduce((best, m) => (compareOrdinal(m.month, best.month) > 0 ? m : best));
      if (rollbackMonth.migrated && (rollbackMonth.revision == null || rollbackMonth.legacyTotalDifference !== 0 || prior.legacyTotalDifference !== 0)) {
        throw operationError('這個歷史月份缺少上限或留有資產加總差異，請先核對；原始月結已保留，尚未撤銷。');
      }
      next.months = next.months.filter((m) => m.month !== command.month);
      break;
    }
    case 'close':
      close(next, command, reason, actor, time, context.expenses ?? [], fallbackMonth);
      break;
    default:
      throw argumentError('不支援的操作。');
  }

  for (const revision of next.revisions.slice(state.revisions.length)) {
    let sum = revision.tuition;
    for (const l of revision.limits) sum = add(sum, l.amount);
  }
  next.version = add(next.version, 1);

  const adjustment = next.adjustments.find((a) => a.id === opId);
  if (adjustment) {
    const changes: BudgetAmountChange[] = [];
    for (const raw of state.months) {
      const old = position(state, raw.month);
      const updated = position(next, raw.month);
      if (old.spare !== updated.spare) changes.push({ month: raw.month, field: 'spare', categoryId: null, before: old.spare, after: updated.spare });
      if (old.total !== updated.total) changes.push({ month: raw.month, field: 'total', categoryId: null, before: old.total, after: updated.total });
      const ids = [...Object.keys(old.balances)];
      for (const id of Object.keys(updated.balances)) if (!ids.includes(id)) ids.push(id);
      for (const id of ids) {
        const before = own(old.balances, id) ?? 0;
        const after = own(updated.balances, id) ?? 0;
        if (before !== after) changes.push({ month: raw.month, field: 'reserve', categoryId: id, before, after });
      }
    }
    adjustment.changes = changes;
  }
  next.receipts.push({ id: opId, fingerprint, action: command.action, month: command.month, reason, actor, time });
  for (const m of next.months) position(next, m.month); // 順便驗證每個月的合計不溢位
  return next;
}

function newAdjustment(
  id: string, month: string, kind: string, amount: number, from: string | null, to: string | null,
  reason: string, actor: string, time: string, reverses: string | null,
): BudgetAdjustment {
  return { id, month, kind, amount, from, to, reason, actor, time, reverses, changes: [] };
}

function singleCategory(state: BudgetState, id: string) {
  const found = state.categories.filter((c) => c.id === id);
  if (found.length !== 1) throw operationError('找不到預算類別。');
  return found[0];
}

interface InnerCommand {
  operationId: string;
  month: string;
  from?: string | null;
  to?: string | null;
  amount: number;
  reason: string;
}

function transfer(state: BudgetState, c: InnerCommand, actor: string, time: string, fallbackMonth: string): void {
  if (c.month !== latestMonth(state)) throw operationError('只能挪用最近已結月份的累計儲備。');
  if (c.amount <= 0 || c.from === c.to) throw argumentError('請選擇不同的儲備類別與正整數金額。');
  const active = effectiveRevision(state, openMonth(state, fallbackMonth))?.limits ?? [];
  for (const id of [c.from, c.to]) {
    if (!state.categories.some((x) => x.id === id && x.kind === 'reserve') || !active.some((l) => l.categoryId === id)) {
      throw operationError('只能在使用中的儲備類別之間挪用。');
    }
  }
  if ((own(position(state, c.month).balances, c.from) ?? 0) < c.amount) throw operationError('轉出類別的可用儲備不足。');
  state.adjustments.push(newAdjustment(c.operationId, c.month, 'transfer', c.amount, c.from ?? null, c.to ?? null, c.reason, actor, time, null));
}

function fundReserve(state: BudgetState, c: InnerCommand, actor: string, time: string, fallbackMonth: string): void {
  if (c.month !== latestMonth(state)) throw operationError('只能調整最近已結月份的目前餘額。');
  const active = effectiveRevision(state, openMonth(state, fallbackMonth))?.limits ?? [];
  if (!state.categories.some((x) => x.id === c.to && x.kind === 'reserve') || !active.some((l) => l.categoryId === c.to)) {
    throw operationError('請選擇使用中的儲備類別。');
  }
  const current = position(state, c.month);
  if (c.amount > 0 && current.spare < c.amount) throw operationError('可用餘額不足，無法補入預備金。');
  if (c.amount < 0 && (own(current.balances, c.to) ?? 0) < -c.amount) throw operationError('該類別儲備不足，無法沖銷補入金額。');
  state.adjustments.push(newAdjustment(c.operationId, c.month, 'fund', c.amount, null, c.to ?? null, c.reason, actor, time, null));
}

function cap(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000) throw argumentError('每項上限須為 0～1,000,000 的整數。');
}

function newRevision(state: BudgetState, c: BudgetCommand, reason: string, actor: string, time: string, fallbackMonth: string): BudgetRevision {
  if (c.month !== openMonth(state, fallbackMonth)) throw operationError('只能設定開放月份的類別與上限。');
  const source = effectiveRevision(state, c.month);
  const mapping: Record<string, string> = {};
  if (source) for (const key of Object.keys(source.mapping)) put(mapping, key, source.mapping[key]);
  return {
    id: c.operationId, month: c.month, limits: source ? source.limits.map((l) => ({ ...l })) : [],
    mapping, tuition: source?.tuition ?? 0, reason, actor, time,
  };
}

function close(
  next: BudgetState, command: BudgetCommand, reason: string, actor: string, time: string,
  expenses: readonly BudgetExpense[], fallbackMonth: string,
): void {
  const amount = command.amount ?? 0;
  if (amount < 0) throw argumentError('當月收入不能為負數。');
  if (command.month !== openMonth(next, fallbackMonth)) throw operationError('只能依月份順序進行月結。');
  let revision = effectiveRevision(next, command.month);
  if (!revision) throw operationError('請先設定本月預算上限。');
  if (revision.month !== command.month) {
    // 沒有自己版本的月份：把沿用的版本寫成該月自己的快照。
    revision = clone(revision);
    revision.id = command.operationId + '-caps';
    revision.month = command.month;
    revision.reason = '月結沿用上期設定';
    revision.actor = actor;
    revision.time = time;
    next.revisions.push(revision);
  }
  if (next.months.length === 0) throw operationError('缺少期初基準。');
  const previous = next.months.reduce((best, m) => (compareOrdinal(m.month, best.month) > 0 ? m : best));
  if (previous.legacyTotalDifference !== 0) throw operationError('前月留有歷史資產加總差異，請先核對後再月結。');
  const balances: Record<string, number> = {};
  for (const key of Object.keys(previous.balances)) put(balances, key, previous.balances[key]);
  const actual: Record<string, number> = {};
  for (const expense of expenses) {
    if (!Number.isSafeInteger(expense.amount) || expense.amount <= 0) throw operationError('支出含有非正整數金額，請先核對交易。');
    const categoryId = own(revision.mapping, expense.category);
    if (categoryId === undefined || !revision.limits.some((l) => l.categoryId === categoryId)) {
      throw operationError(`分類「${expense.category}」尚未設定有效的預算歸屬。`);
    }
    put(actual, categoryId, add(own(actual, categoryId) ?? 0, expense.amount));
  }
  const changes: Record<string, number> = {};
  let outlay = revision.tuition;
  for (const limit of revision.limits) {
    const definition = singleCategory(next, limit.categoryId);
    const cost = own(actual, definition.id) ?? 0;
    if (definition.kind === 'reserve') {
      put(changes, definition.id, sub(limit.amount, cost));
      put(balances, definition.id, add(own(balances, definition.id) ?? 0, changes[definition.id]));
      outlay = add(outlay, limit.amount);
    } else {
      outlay = add(outlay, cost);
    }
  }
  const surplus = sub(amount, outlay);
  const closed: MonthClose = {
    id: command.operationId, month: command.month, income: amount, surplus,
    rawSpare: add(previous.rawSpare, surplus), tuition: add(previous.tuition, revision.tuition),
    balances, changes, expenses: actual, revision: clone(revision),
    migrated: false, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time, actor,
  };
  next.months.push(closed);
  next.closeHistory.push(clone(closed));
}
