// 財務文件（舊系統 BudgetState 的 JSON）與引擎狀態之間的對應。
//
// 對應規則：舊文件是 C# System.Text.Json 預設輸出，屬性名稱為 PascalCase（Version、Months、RawSpare…），
// 引擎狀態（budgetTypes.ts）用 camelCase。轉換只改「已知結構」的屬性名稱（第一個字母大小寫）：
// - 字典的鍵（balances / changes / expenses / mapping 的鍵）是資料，原樣保留，不轉換。
// - 時間（DateTimeOffset）以字串原樣保留，不經 Date 轉換，所以寫回後逐字相同。
// - Checks（總資產核對紀錄）整筆原樣保存，不解讀、不轉換（含內部的 PascalCase 屬性）。
// - 缺少的屬性依 System.Text.Json 的預設值補上（字串空、數字 0、陣列空）；型別不對則拒絕。
// - 未知的屬性（舊文件沒有）會被丟棄；舊系統不會輸出，所以不構成損失。
// 讀進一份舊格式文件再寫出，內容等價（JSON 深層相等，屬性順序不計）；測試見 budgetDocument.test.ts。
import type {
  BudgetAdjustment,
  BudgetAmountChange,
  BudgetCategoryDefinition,
  BudgetLimit,
  BudgetReceipt,
  BudgetRevision,
  BudgetState,
  MonthClose,
} from './budgetTypes.ts';

export class BudgetDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetDocumentError';
  }
}

type Json = Record<string, unknown>;
const EMPTY_TIME = '0001-01-01T00:00:00+00:00';

function fail(path: string, expected: string): never {
  throw new BudgetDocumentError(`財務文件格式錯誤：${path} 應為${expected}。`);
}
function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, '物件');
  return value as Json;
}
function str(o: Json, key: string, path: string, fallback = ''): string {
  const v = o[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'string') fail(`${path}.${key}`, '字串');
  return v;
}
function optStr(o: Json, key: string, path: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail(`${path}.${key}`, '字串或 null');
  return v;
}
function int(o: Json, key: string, path: string): number {
  const v = o[key];
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) fail(`${path}.${key}`, '整數');
  return v === 0 ? 0 : v;
}
function bool(o: Json, key: string, path: string): boolean {
  const v = o[key];
  if (v === undefined) return false;
  if (typeof v !== 'boolean') fail(`${path}.${key}`, '布林值');
  return v;
}
function arr(o: Json, key: string, path: string): unknown[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`${path}.${key}`, '陣列');
  return v;
}
function dict<T>(o: Json, key: string, path: string, read: (v: unknown, p: string) => T): Record<string, T> {
  const v = o[key];
  const out: Record<string, T> = {};
  if (v === undefined || v === null) return out;
  const source = obj(v, `${path}.${key}`);
  for (const k of Object.keys(source)) {
    Object.defineProperty(out, k, { value: read(source[k], `${path}.${key}[${k}]`), enumerable: true, writable: true, configurable: true });
  }
  return out;
}
const readInt = (v: unknown, p: string): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) fail(p, '整數');
  return v === 0 ? 0 : (v as number);
};
const readString = (v: unknown, p: string): string => {
  if (typeof v !== 'string') fail(p, '字串');
  return v as string;
};

function readRevision(v: unknown, path: string): BudgetRevision {
  const o = obj(v, path);
  return {
    id: str(o, 'Id', path),
    month: str(o, 'Month', path),
    limits: arr(o, 'Limits', path).map((x, i): BudgetLimit => {
      const l = obj(x, `${path}.Limits[${i}]`);
      return { categoryId: str(l, 'CategoryId', `${path}.Limits[${i}]`), amount: int(l, 'Amount', `${path}.Limits[${i}]`) };
    }),
    mapping: dict(o, 'Mapping', path, readString),
    tuition: int(o, 'Tuition', path),
    reason: str(o, 'Reason', path),
    actor: str(o, 'Actor', path),
    time: str(o, 'Time', path, EMPTY_TIME),
  };
}

function readMonth(v: unknown, path: string): MonthClose {
  const o = obj(v, path);
  return {
    id: str(o, 'Id', path),
    month: str(o, 'Month', path),
    income: int(o, 'Income', path),
    surplus: int(o, 'Surplus', path),
    rawSpare: int(o, 'RawSpare', path),
    tuition: int(o, 'Tuition', path),
    balances: dict(o, 'Balances', path, readInt),
    changes: dict(o, 'Changes', path, readInt),
    expenses: dict(o, 'Expenses', path, readInt),
    revision: o.Revision === undefined || o.Revision === null ? null : readRevision(o.Revision, `${path}.Revision`),
    migrated: bool(o, 'Migrated', path),
    legacyTotalDifference: int(o, 'LegacyTotalDifference', path),
    legacyBalanceAnchor: int(o, 'LegacyBalanceAnchor', path),
    time: str(o, 'Time', path, EMPTY_TIME),
    actor: str(o, 'Actor', path),
  };
}

function readAdjustment(v: unknown, path: string): BudgetAdjustment {
  const o = obj(v, path);
  return {
    id: str(o, 'Id', path),
    month: str(o, 'Month', path),
    kind: str(o, 'Kind', path),
    amount: int(o, 'Amount', path),
    from: optStr(o, 'From', path),
    to: optStr(o, 'To', path),
    reason: str(o, 'Reason', path),
    actor: str(o, 'Actor', path),
    time: str(o, 'Time', path, EMPTY_TIME),
    reverses: optStr(o, 'Reverses', path),
    changes: arr(o, 'Changes', path).map((x, i): BudgetAmountChange => {
      const c = obj(x, `${path}.Changes[${i}]`);
      const p = `${path}.Changes[${i}]`;
      return {
        month: str(c, 'Month', p), field: str(c, 'Field', p), categoryId: optStr(c, 'CategoryId', p),
        before: int(c, 'Before', p), after: int(c, 'After', p),
      };
    }),
  };
}

/** 解析舊系統格式（PascalCase）的財務文件。輸入可以是 JSON 字串或已解析的物件。 */
export function parseBudgetDocument(source: string | unknown): BudgetState {
  let value: unknown = source;
  if (typeof source === 'string') {
    try {
      value = JSON.parse(source);
    } catch {
      throw new BudgetDocumentError('財務文件不是有效的 JSON。');
    }
  }
  const o = obj(value, '文件');
  const path = '文件';
  return {
    version: int(o, 'Version', path),
    categories: arr(o, 'Categories', path).map((x, i): BudgetCategoryDefinition => {
      const c = obj(x, `Categories[${i}]`);
      return { id: str(c, 'Id', `Categories[${i}]`), name: str(c, 'Name', `Categories[${i}]`), kind: str(c, 'Kind', `Categories[${i}]`) };
    }),
    revisions: arr(o, 'Revisions', path).map((x, i) => readRevision(x, `Revisions[${i}]`)),
    months: arr(o, 'Months', path).map((x, i) => readMonth(x, `Months[${i}]`)),
    closeHistory: arr(o, 'CloseHistory', path).map((x, i) => readMonth(x, `CloseHistory[${i}]`)),
    adjustments: arr(o, 'Adjustments', path).map((x, i) => readAdjustment(x, `Adjustments[${i}]`)),
    receipts: arr(o, 'Receipts', path).map((x, i): BudgetReceipt => {
      const r = obj(x, `Receipts[${i}]`);
      const p = `Receipts[${i}]`;
      return {
        id: str(r, 'Id', p), fingerprint: str(r, 'Fingerprint', p), action: str(r, 'Action', p), month: str(r, 'Month', p),
        reason: str(r, 'Reason', p), actor: str(r, 'Actor', p), time: str(r, 'Time', p, EMPTY_TIME),
      };
    }),
    checks: structuredCloneJson(arr(o, 'Checks', path)),
  };
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function writeRevision(r: BudgetRevision): Json {
  return {
    Id: r.id, Month: r.month,
    Limits: r.limits.map((l) => ({ CategoryId: l.categoryId, Amount: l.amount })),
    Mapping: { ...r.mapping }, Tuition: r.tuition, Reason: r.reason, Actor: r.actor, Time: r.time,
  };
}

function writeMonth(m: MonthClose): Json {
  return {
    Id: m.id, Month: m.month, Income: m.income, Surplus: m.surplus, RawSpare: m.rawSpare, Tuition: m.tuition,
    Balances: { ...m.balances }, Changes: { ...m.changes }, Expenses: { ...m.expenses },
    Revision: m.revision ? writeRevision(m.revision) : null,
    Migrated: m.migrated, LegacyTotalDifference: m.legacyTotalDifference, LegacyBalanceAnchor: m.legacyBalanceAnchor,
    Time: m.time, Actor: m.actor,
  };
}

/** 寫成舊系統格式（PascalCase）的 JSON 物件。 */
export function budgetStateToDocument(state: BudgetState): Json {
  return {
    Version: state.version,
    Categories: state.categories.map((c) => ({ Id: c.id, Name: c.name, Kind: c.kind })),
    Revisions: state.revisions.map(writeRevision),
    Months: state.months.map(writeMonth),
    CloseHistory: state.closeHistory.map(writeMonth),
    Adjustments: state.adjustments.map((a) => ({
      Id: a.id, Month: a.month, Kind: a.kind, Amount: a.amount, From: a.from, To: a.to, Reason: a.reason, Actor: a.actor,
      Time: a.time, Reverses: a.reverses,
      Changes: a.changes.map((c) => ({ Month: c.month, Field: c.field, CategoryId: c.categoryId, Before: c.before, After: c.after })),
    })),
    Receipts: state.receipts.map((r) => ({
      Id: r.id, Fingerprint: r.fingerprint, Action: r.action, Month: r.month, Reason: r.reason, Actor: r.actor, Time: r.time,
    })),
    Checks: structuredCloneJson(state.checks),
  };
}

export function serializeBudgetDocument(state: BudgetState): string {
  return JSON.stringify(budgetStateToDocument(state));
}

/** 全新帳本的空狀態（沒有期初基準）。 */
export function emptyBudgetState(): BudgetState {
  return { version: 0, categories: [], revisions: [], months: [], closeHistory: [], adjustments: [], receipts: [], checks: [] };
}
