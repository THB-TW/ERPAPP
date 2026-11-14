// 比對工具的來源讀取。兩類來源：
// 1. 舊系統的「獨立投影表」：dbo.Property（逐月資產）、dbo.budget（逐月預算投影，另有 1911-01-01 一列是目前累計儲備）、
//    dbo.BudgetCap（上限快照）。它們是舊網站每次月結／調整時另外寫出的，不是從財務文件讀來的。
//    欄位對應依據舊程式：BudgetSeeder.Import（表 → 財務文件）與 BudgetWorkspace.Synchronize／InsertLegacyMonth（文件 → 表）。
// 2. 財務文件的原始 JSON（PascalCase），這裡獨立讀一遍，不經 App 的 budgetDocument.ts，才能抓到匯入／轉換的損傷。
// 這裡只讀出原始值，不判斷對錯；缺漏、重複、型別不對一律丟 LegacyExportError，由呼叫端停下，不悄悄補值。
import type { ExportTable, ExportValue, VerifiedExport } from '../../../../tools/lib/verify-export.mjs';
import { LegacyExportError, findTable, resolver } from '../legacy-convert/legacyData.ts';

/** 舊系統十個儲備類別的 id，順序同 BudgetSeeder.Reserves；dbo.budget 與 dbo.BudgetCap 的欄位名就是這些 id。 */
export const LEGACY_RESERVE_IDS = ['food', 'car', 'fun', 'study', 'cloth', 'articles', 'furniture', 'hair', 'health', 'other'] as const;
/** dbo.BudgetCap 的十二個上限欄位（十個儲備＋兩個固定支出）。 */
export const CAP_COLUMN_IDS = [...LEGACY_RESERVE_IDS, 'phone', 'gogoro'] as const;

export interface PropertyRow { income: number; spare: number; tuition: number; reserve: number; total: number }
export interface IndependentSources {
  /** dbo.Property，月份 → 列（Own＝當月收入、Sparemoney＝可用餘額、Tuitionfee＝學費儲備、Budget＝總儲備金、Totalproperty＝帳面總資產）。 */
  property: Map<string, PropertyRow>;
  /** dbo.budget 的逐月列：月份 → 當月盈餘（gete）。沒有列的月份不在其中。 */
  budgetSurplus: Map<string, number>;
  /** dbo.budget 的 1911-01-01 列：目前累計儲備（十個舊類別）；沒有此列為 null。 */
  cumulative: Map<string, number> | null;
  /** 1911-01-01 列的 total 欄（舊網站同步時寫入最近月份的總儲備金）；沒有累計列或該欄為空為 null。 */
  cumulativeTotal: number | null;
  /** dbo.BudgetCap：月份 → { 十二個上限欄位, tuition }。 */
  caps: Map<string, { limits: Map<string, number>; tuition: number }>;
}

function monthOfDate(value: ExportValue, what: string): { month: string; day: string } {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2})-(\d{2})/.exec(value) : null;
  if (!match) throw new LegacyExportError(`${what}的日期欄位不是日期。`);
  return { month: match[1], day: match[2] };
}

function intOf(value: ExportValue, what: string, nullAs?: number): number {
  if (value === null && nullAs !== undefined) return nullAs;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new LegacyExportError(`${what}的值不是整數（或不該是空值）。`);
}

function table(verified: VerifiedExport, name: string, what: string): ExportTable {
  return findTable(verified, [name], what);
}

export function readIndependentSources(verified: VerifiedExport): IndependentSources {
  // dbo.Property
  const propertyTable = table(verified, 'Property', '資產（dbo.Property）');
  const pc = resolver(propertyTable);
  const property = new Map<string, PropertyRow>();
  for (const row of propertyTable.rows) {
    const { month } = monthOfDate(row[pc('date')], 'dbo.Property');
    if (property.has(month)) throw new LegacyExportError(`dbo.Property 的 ${month} 有重複的列。`);
    const need = (col: string) => intOf(row[pc(col)], `dbo.Property ${month} 的 ${col}`);
    // BudgetSeeder：Income＝Own ?? 0；其餘四欄為 null 就停止移轉。
    property.set(month, { income: intOf(row[pc('own')], `dbo.Property ${month} 的 own`, 0), spare: need('sparemoney'), tuition: need('tuitionfee'), reserve: need('budget'), total: need('totalproperty') });
  }

  // dbo.budget
  const budgetTable = table(verified, 'budget', '預算投影（dbo.budget）');
  const bc = resolver(budgetTable);
  const budgetSurplus = new Map<string, number>();
  let cumulative: Map<string, number> | null = null;
  let cumulativeTotal: number | null = null;
  for (const row of budgetTable.rows) {
    const { month, day } = monthOfDate(row[bc('date')], 'dbo.budget');
    const dateText = `${month}-${day}`;
    if (dateText === '1911-01-01') {
      if (cumulative) throw new LegacyExportError('dbo.budget 的 1911-01-01（累計儲備）列有重複。');
      cumulative = new Map(LEGACY_RESERVE_IDS.map((id) => [id, intOf(row[bc(id)], `dbo.budget 累計列的 ${id}`, 0)]));
      cumulativeTotal = row[bc('total')] === null ? null : intOf(row[bc('total')], 'dbo.budget 累計列的 total');
      continue;
    }
    if (budgetSurplus.has(month)) throw new LegacyExportError(`dbo.budget 的 ${month} 有重複的列。`);
    budgetSurplus.set(month, intOf(row[bc('gete')], `dbo.budget ${month} 的 gete`, 0)); // BudgetSeeder：Surplus＝budget?.Gete ?? 0
  }

  // dbo.BudgetCap
  const capTable = table(verified, 'BudgetCap', '預算上限（dbo.BudgetCap）');
  const cc = resolver(capTable);
  const caps = new Map<string, { limits: Map<string, number>; tuition: number }>();
  for (const row of capTable.rows) {
    const { month } = monthOfDate(row[cc('month')], 'dbo.BudgetCap');
    if (caps.has(month)) throw new LegacyExportError(`dbo.BudgetCap 的 ${month} 有重複的列。`);
    caps.set(month, {
      limits: new Map(CAP_COLUMN_IDS.map((id) => [id, intOf(row[cc(id)], `dbo.BudgetCap ${month} 的 ${id}`)])),
      tuition: intOf(row[cc('tuition')], `dbo.BudgetCap ${month} 的 tuition`),
    });
  }
  return { property, budgetSurplus, cumulative, cumulativeTotal, caps };
}

// ---- 財務文件原始 JSON ----

export interface RawRevision { id: string; month: string; tuition: number; limits: Map<string, number>; mapping: Map<string, string> }
export interface RawMonth {
  month: string;
  income: number;
  surplus: number;
  rawSpare: number;
  tuition: number;
  balances: Map<string, number>;
  legacyTotalDifference: number;
  migrated: boolean;
  revision: RawRevision | null;
}
export interface RawAdjustment { month: string; kind: string; amount: number; from: string | null; to: string | null }
export interface RawDocument {
  months: RawMonth[];
  adjustments: RawAdjustment[];
  categories: { id: string; name: string }[];
}

type Json = Record<string, unknown>;
const bad = (path: string, expected: string): never => {
  throw new LegacyExportError(`財務文件格式錯誤：${path} 應為${expected}。`);
};
const asObject = (v: unknown, path: string): Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : bad(path, '物件');
const asArray = (v: unknown, path: string): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : bad(path, '陣列'));
const asString = (v: unknown, path: string): string => (typeof v === 'string' ? v : bad(path, '字串'));
const asOptString = (v: unknown, path: string): string | null => (v === undefined || v === null ? null : asString(v, path));
const asInt = (v: unknown, path: string): number => (typeof v === 'number' && Number.isSafeInteger(v) ? v : bad(path, '整數'));
const intMap = (v: unknown, path: string): Map<string, number> =>
  new Map(Object.entries(v === undefined || v === null ? {} : asObject(v, path)).map(([k, x]) => [k, asInt(x, `${path}[${k}]`)]));

function readRevision(v: unknown, path: string): RawRevision {
  const o = asObject(v, path);
  const limits = new Map<string, number>();
  for (const [i, l] of asArray(o.Limits, `${path}.Limits`).entries()) {
    const lo = asObject(l, `${path}.Limits[${i}]`);
    limits.set(asString(lo.CategoryId, `${path}.Limits[${i}].CategoryId`), asInt(lo.Amount, `${path}.Limits[${i}].Amount`));
  }
  const mapping = new Map(Object.entries(o.Mapping === undefined || o.Mapping === null ? {} : asObject(o.Mapping, `${path}.Mapping`))
    .map(([k, x]) => [k, asString(x, `${path}.Mapping[${k}]`)]));
  return { id: asString(o.Id, `${path}.Id`), month: asString(o.Month, `${path}.Month`), tuition: asInt(o.Tuition, `${path}.Tuition`), limits, mapping };
}

export function readRawDocument(text: string): RawDocument {
  let root: Json;
  try {
    root = asObject(JSON.parse(text), '文件');
  } catch (e) {
    if (e instanceof LegacyExportError) throw e;
    throw new LegacyExportError('財務文件不是有效的 JSON。');
  }
  const months = asArray(root.Months, 'Months').map((m, i): RawMonth => {
    const p = `Months[${i}]`;
    const o = asObject(m, p);
    return {
      month: asString(o.Month, `${p}.Month`), income: asInt(o.Income, `${p}.Income`), surplus: asInt(o.Surplus, `${p}.Surplus`),
      rawSpare: asInt(o.RawSpare, `${p}.RawSpare`), tuition: asInt(o.Tuition, `${p}.Tuition`), balances: intMap(o.Balances, `${p}.Balances`),
      legacyTotalDifference: asInt(o.LegacyTotalDifference, `${p}.LegacyTotalDifference`),
      migrated: o.Migrated === true,
      revision: o.Revision === undefined || o.Revision === null ? null : readRevision(o.Revision, `${p}.Revision`),
    };
  });
  const adjustments = asArray(root.Adjustments, 'Adjustments').map((a, i): RawAdjustment => {
    const p = `Adjustments[${i}]`;
    const o = asObject(a, p);
    return { month: asString(o.Month, `${p}.Month`), kind: asString(o.Kind, `${p}.Kind`), amount: asInt(o.Amount, `${p}.Amount`), from: asOptString(o.From, `${p}.From`), to: asOptString(o.To, `${p}.To`) };
  });
  const categories = asArray(root.Categories, 'Categories').map((c, i) => {
    const o = asObject(c, `Categories[${i}]`);
    return { id: asString(o.Id, `Categories[${i}].Id`), name: asString(o.Name, `Categories[${i}].Name`) };
  });
  return { months, adjustments, categories };
}
