// 門檻比對（純函式）：App 帳本服務查出來的數字 vs 來源。任何一項差異都算失敗；容許誤差 0 元。
// 每個欄位最多兩道比對：
//   (a) 獨立的舊資料表（Property／budget／BudgetCap）——舊網站另外寫出的投影，不是從財務文件來的；
//   (b) 來源財務文件的原始 JSON 值（含 expected.ts 的獨立算法）——抓匯入與轉換的損傷。
// 舊資料表沒有該月資料時只做 (b)，並在報告裡列出沒有獨立來源的月份；絕不補造缺的月份。
import type { BudgetMonthView, DayTransaction } from '../../src/ledger/index.ts';
import type { RawTransaction } from '../legacy-convert/legacyData.ts';
import { flowOf, parseDate } from '../legacy-convert/plan.ts';
import { expectedPositions } from './expected.ts';
import { CAP_COLUMN_IDS, LEGACY_RESERVE_IDS, type IndependentSources, type RawDocument } from './sources.ts';

export type SourceKind = 'Property 資料表' | 'budget 資料表' | 'BudgetCap 資料表' | '來源財務文件' | '來源交易表';

export interface Difference {
  /** 月份（YYYY-MM）或「交易」。 */
  scope: string;
  /** 完整欄位名稱（可能含分類名稱，只進完整報告）。 */
  field: string;
  /** 不含任何名稱的欄位類別（可進摘要）。 */
  kind: string;
  expected: string | number;
  actual: string | number;
  source: SourceKind;
}

class Checker {
  readonly differences: Difference[] = [];
  readonly checks: Record<SourceKind, number> = {
    'Property 資料表': 0, 'budget 資料表': 0, 'BudgetCap 資料表': 0, '來源財務文件': 0, '來源交易表': 0,
  };
  eq(scope: string, kind: string, field: string, source: SourceKind, expected: string | number, actual: string | number): void {
    this.checks[source] += 1;
    if (expected !== actual) this.differences.push({ scope, kind, field, source, expected, actual });
  }
}

export interface LegacyDifferenceMonth {
  month: string;
  /** App 帳本查出的歷史總資產差異。 */
  ledger: number;
  /** 由 dbo.Property 算出（總資產－可用餘額－學費儲備－總儲備金）；該月沒有 Property 列為 null。 */
  property: number | null;
  /** 來源財務文件的 LegacyTotalDifference。 */
  document: number | null;
}

export interface BudgetComparison {
  differences: Difference[];
  checks: Record<SourceKind, number>;
  months: string[];
  /** 任一來源或 App 有非 0 歷史差異的月份。 */
  legacyDifferenceMonths: LegacyDifferenceMonth[];
  coverage: {
    propertyMonths: number;
    budgetRowMonths: number;
    capRowMonths: number;
    /** 沒有獨立舊表來源、只能與來源財務文件比對的月份。 */
    withoutBudgetRow: string[];
    withoutCapRow: string[];
    withoutPropertyRow: string[];
    cumulativeRowChecked: boolean;
    documentRevisions: number;
  };
}

const sortedEntries = (m: Map<string, unknown>) => JSON.stringify([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

/** 十個舊類別以外的儲備併入「其他」（BudgetSeeder.LegacyBalances 的規則）。 */
function legacyFold(balances: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>(LEGACY_RESERVE_IDS.map((id) => [id, 0]));
  for (const [id, value] of balances) {
    const target = out.has(id) ? id : 'other';
    out.set(target, out.get(target)! + value);
  }
  return out;
}

export function compareBudgetMonths(
  /** 帳本服務 getBudgetMonth 查出的每個月。 */
  views: Map<string, BudgetMonthView>,
  /** 帳本服務 listBudgetMonths 列出的月份。 */
  ledgerMonths: string[],
  sources: IndependentSources,
  raw: RawDocument,
): BudgetComparison {
  const c = new Checker();
  const expected = expectedPositions(raw);
  const rawByMonth = new Map(raw.months.map((m) => [m.month, m]));
  const name = (id: string) => raw.categories.find((x) => x.id === id)?.name ?? id;

  // ---- 月份清單：來源（Property 與文件）與 App 必須一致 ----
  const sourceMonths = new Set([...sources.property.keys(), ...rawByMonth.keys()]);
  const appMonths = new Set(ledgerMonths);
  const months = [...sourceMonths].sort();
  for (const m of [...new Set([...sourceMonths, ...appMonths])].sort()) {
    const inProperty = sources.property.has(m);
    const inDocument = rawByMonth.has(m);
    const inApp = appMonths.has(m);
    if (!(inProperty && inDocument && inApp)) {
      c.differences.push({
        scope: m, kind: '月份清單', field: '月份清單', source: '來源財務文件',
        expected: `Property：${inProperty ? '有' : '無'}、文件：${inDocument ? '有' : '無'}`, actual: `App：${inApp ? '有' : '無'}`,
      });
    }
  }
  c.checks['來源財務文件'] += 1;

  const legacyDifferenceMonths: LegacyDifferenceMonth[] = [];
  const withoutBudgetRow: string[] = [];
  const withoutCapRow: string[] = [];
  const withoutPropertyRow: string[] = [];

  for (const m of months) {
    const v = views.get(m);
    const doc = rawByMonth.get(m);
    const exp = expected.get(m);
    if (!v || !doc || !exp) continue; // 月份清單已回報差異
    const prop = sources.property.get(m);

    // --- 獨立舊表：Property ---
    if (prop) {
      const P: SourceKind = 'Property 資料表';
      c.eq(m, '當月收入', '當月收入', P, prop.income, v.income);
      c.eq(m, '可用餘額', '可用餘額', P, prop.spare, v.spare);
      c.eq(m, '學費儲備', '學費儲備', P, prop.tuition, v.tuition);
      c.eq(m, '總儲備金', '總儲備金', P, prop.reserve, v.reserve);
      c.eq(m, '帳面總資產', '帳面總資產（含歷史差異）', P, prop.total, v.total);
      c.eq(m, '歷史總資產差異', '歷史總資產差異', P, prop.total - prop.spare - prop.tuition - prop.reserve, v.legacyTotalDifference);
    } else {
      withoutPropertyRow.push(m);
    }
    // --- 獨立舊表：budget（逐月列）---
    const gete = sources.budgetSurplus.get(m);
    if (gete !== undefined) c.eq(m, '當月盈餘', '當月盈餘', 'budget 資料表', gete, v.surplus);
    else withoutBudgetRow.push(m);

    // --- 來源財務文件（原始值＋獨立算法）---
    const D: SourceKind = '來源財務文件';
    c.eq(m, '當月收入', '當月收入', D, exp.income, v.income);
    c.eq(m, '當月盈餘', '當月盈餘', D, exp.surplus, v.surplus);
    c.eq(m, '可用餘額', '可用餘額', D, exp.spare, v.spare);
    c.eq(m, '學費儲備', '學費儲備', D, exp.tuition, v.tuition);
    c.eq(m, '總儲備金', '總儲備金', D, exp.reserve, v.reserve);
    c.eq(m, '帳面總資產', '帳面總資產（含歷史差異）', D, exp.total, v.total);
    c.eq(m, '歷史總資產差異', '歷史總資產差異', D, exp.legacyTotalDifference, v.legacyTotalDifference);
    c.eq(m, '歷史月份標記', '歷史月份標記（migrated）', D, String(doc.migrated), String(v.migrated));
    const actualBalances = new Map(v.reserves.map((r) => [r.categoryId, r.balance]));
    for (const id of [...new Set([...exp.balances.keys(), ...actualBalances.keys()])].sort()) {
      c.eq(m, '各分類儲備', `各分類儲備：${name(id)}`, D, exp.balances.get(id) ?? 0, actualBalances.get(id) ?? 0);
    }

    // --- 上限快照 ---
    const snap = v.capSnapshot;
    if (doc.revision === null) {
      c.eq(m, '上限快照', '上限快照有無', D, '無', snap ? '有' : '無');
    } else {
      c.eq(m, '上限快照', '上限快照有無', D, '有', snap ? '有' : '無');
      if (snap) {
        c.eq(m, '上限快照', '上限快照：版本編號', D, doc.revision.id, snap.id);
        c.eq(m, '上限快照', '上限快照：版本月份', D, doc.revision.month, snap.month);
        c.eq(m, '上限快照', '上限快照：學費儲備提撥', D, doc.revision.tuition, snap.tuition);
        const actualLimits = new Map(snap.limits.map((l) => [l.categoryId, l.amount]));
        c.eq(m, '上限快照', '上限快照：各分類上限', D, sortedEntries(doc.revision.limits), sortedEntries(actualLimits));
        c.eq(m, '上限快照', '上限快照：分類歸屬', D, sortedEntries(doc.revision.mapping), sortedEntries(new Map(Object.entries(snap.mapping))));
      }
    }
    const cap = sources.caps.get(m);
    if (cap) {
      const B: SourceKind = 'BudgetCap 資料表';
      c.eq(m, '上限快照', '上限快照有無（BudgetCap 有自己的一列）', B, '有', snap ? '有' : '無');
      if (snap) {
        const actualLimits = new Map(snap.limits.map((l) => [l.categoryId, l.amount]));
        c.eq(m, '上限快照', '上限快照：學費儲備提撥', B, cap.tuition, snap.tuition);
        for (const id of CAP_COLUMN_IDS) c.eq(m, '上限快照', `上限快照：上限 ${name(id)}`, B, cap.limits.get(id) ?? 0, actualLimits.get(id) ?? 0);
        // 舊系統的上限表沒有其他欄位；其他類別（例如照實支）在帶入時一律是 0。
        for (const [id, amount] of actualLimits) {
          if (!cap.limits.has(id)) c.eq(m, '上限快照', `上限快照：上限 ${name(id)}（BudgetCap 無此欄）`, B, 0, amount);
        }
      }
    } else {
      withoutCapRow.push(m);
    }

    legacyDifferenceMonths.push({
      month: m, ledger: v.legacyTotalDifference,
      property: prop ? prop.total - prop.spare - prop.tuition - prop.reserve : null, document: doc.legacyTotalDifference,
    });
  }

  // --- 目前累計儲備：dbo.budget 的 1911-01-01 列＝最近月份的各分類儲備（新增的類別併入「其他」）---
  let cumulativeRowChecked = false;
  const latest = months[months.length - 1];
  if (sources.cumulative && latest && views.get(latest)) {
    cumulativeRowChecked = true;
    const folded = legacyFold(new Map(views.get(latest)!.reserves.map((r) => [r.categoryId, r.balance])));
    for (const id of LEGACY_RESERVE_IDS) {
      c.eq(latest, '各分類儲備', `各分類儲備（budget 累計列，最近月份）：${name(id)}`, 'budget 資料表', sources.cumulative.get(id) ?? 0, folded.get(id) ?? 0);
    }
  }

  return {
    differences: c.differences,
    checks: c.checks,
    months,
    legacyDifferenceMonths: legacyDifferenceMonths.filter((x) => x.ledger !== 0 || (x.property ?? 0) !== 0 || (x.document ?? 0) !== 0),
    coverage: {
      propertyMonths: sources.property.size,
      budgetRowMonths: sources.budgetSurplus.size,
      capRowMonths: sources.caps.size,
      withoutBudgetRow, withoutCapRow, withoutPropertyRow, cumulativeRowChecked,
      documentRevisions: new Set(raw.months.flatMap((m) => (m.revision ? [m.revision.id] : []))).size,
    },
  };
}

// ---- 交易 ----

export interface TransactionComparison {
  differences: Difference[];
  sourceCount: number;
  appCount: number;
  /** 來源與 App 兩邊的收入／支出筆數與合計。 */
  totals: { flow: 'income' | 'expense'; sourceCount: number; appCount: number; sourceSum: number; appSum: number }[];
  months: number;
}

interface Tally { count: number; sum: number }

export function compareTransactions(app: DayTransaction[], source: RawTransaction[]): TransactionComparison {
  const c = new Checker();
  const S: SourceKind = '來源交易表';
  const sourceCategories = new Set(source.map((t) => (typeof t.category === 'string' ? t.category : '')));
  const SPLIT_SUFFIX = '（收入）';
  // 轉換時用 --mixed-flow split 會把收入那邊拆成「原名（收入）」；依分類比對時併回原名（來源本來就有同名分類時不動）。
  const mergedName = (categoryName: string, flow: string) =>
    flow === 'income' && categoryName.endsWith(SPLIT_SUFFIX) && !sourceCategories.has(categoryName) ? categoryName.slice(0, -SPLIT_SUFFIX.length) : categoryName;

  interface Row { date: string; category: string; account: string; flow: string; amount: number; member: string | null }
  const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  const src: Row[] = source.map((t) => ({
    date: parseDate(t.date) ?? `（無法辨識：${String(t.date)}）`, category: text(t.category) ?? '', account: text(t.account) ?? '',
    flow: flowOf(t.type) ?? `（無法辨識：${String(t.type)}）`, amount: typeof t.amount === 'number' ? t.amount : Number.NaN, member: text(t.member),
  }));
  const apps: Row[] = app.map((t) => ({
    date: t.date, category: mergedName(t.categoryName, t.flow), account: t.accountName, flow: t.flow, amount: t.amount, member: t.memberName,
  }));

  const tally = (rows: Row[], key: (r: Row) => string) => {
    const map = new Map<string, Tally>();
    for (const r of rows) {
      const t = map.get(key(r)) ?? { count: 0, sum: 0 };
      t.count += 1;
      t.sum += r.amount;
      map.set(key(r), t);
    }
    return map;
  };
  const diffTallies = (kind: string, label: (key: string) => string, a: Map<string, Tally>, b: Map<string, Tally>, scope = '交易') => {
    for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const x = a.get(k) ?? { count: 0, sum: 0 };
      const y = b.get(k) ?? { count: 0, sum: 0 };
      c.eq(scope, kind, `${label(k)} 筆數`, S, x.count, y.count);
      c.eq(scope, kind, `${label(k)} 金額加總`, S, x.sum, y.sum);
    }
  };
  const FLOW = (f: string) => (f === 'income' ? '收入' : f === 'expense' ? '支出' : f);

  c.eq('交易', '交易總計', '交易總筆數', S, src.length, apps.length);
  c.eq('交易', '交易總計', '交易總金額（收入＋支出）', S, src.reduce((s, r) => s + r.amount, 0), apps.reduce((s, r) => s + r.amount, 0));
  diffTallies('交易總計', (k) => `${FLOW(k)}合計`, tally(src, (r) => r.flow), tally(apps, (r) => r.flow));
  diffTallies('交易（分月）', (k) => `分月 ${k.replace('|', ' ')}`, tally(src, (r) => `${r.date.slice(0, 7)}|${FLOW(r.flow)}`), tally(apps, (r) => `${r.date.slice(0, 7)}|${FLOW(r.flow)}`));
  diffTallies('交易（分類）', (k) => `分類 ${k.replace('|', ' ')}`, tally(src, (r) => `${r.category}|${FLOW(r.flow)}`), tally(apps, (r) => `${r.category}|${FLOW(r.flow)}`));
  diffTallies('交易（帳戶）', (k) => `帳戶 ${k.replace('|', ' ')}`, tally(src, (r) => `${r.account}|${FLOW(r.flow)}`), tally(apps, (r) => `${r.account}|${FLOW(r.flow)}`));

  // 逐筆（日期、分類、帳戶、收支別、金額、成員）多重集合：兩邊相減
  const rowKey = (r: Row) => JSON.stringify([r.date, r.category, r.account, r.flow, r.amount, r.member]);
  const left = new Map<string, number>();
  for (const r of src) left.set(rowKey(r), (left.get(rowKey(r)) ?? 0) + 1);
  for (const r of apps) left.set(rowKey(r), (left.get(rowKey(r)) ?? 0) - 1);
  c.checks[S] += 1;
  for (const [k, n] of [...left].sort()) {
    if (n === 0) continue;
    const [date, category, account, flow, amount, member] = JSON.parse(k) as [string, string, string, string, number, string | null];
    c.differences.push({
      scope: '交易', kind: '交易逐筆內容', source: S,
      field: `逐筆 ${date} ${category} ${account} ${FLOW(flow)} ${amount}${member ? ' ' + member : ''}`,
      expected: n > 0 ? `來源比 App 多 ${n} 筆` : '來源沒有', actual: n > 0 ? 'App 沒有' : `App 比來源多 ${-n} 筆`,
    });
  }

  const totals = (['income', 'expense'] as const).map((flow) => {
    const a = src.filter((r) => r.flow === flow);
    const b = apps.filter((r) => r.flow === flow);
    return { flow, sourceCount: a.length, appCount: b.length, sourceSum: a.reduce((s, r) => s + r.amount, 0), appSum: b.reduce((s, r) => s + r.amount, 0) };
  });
  return { differences: c.differences, sourceCount: src.length, appCount: apps.length, totals, months: new Set(src.map((r) => r.date.slice(0, 7))).size };
}
