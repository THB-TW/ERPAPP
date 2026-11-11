// 轉換計畫（純函式）：把讀出的舊帳原始值整理成帳本服務的帶入資料，或列出必須由人裁決的問題。
// 原則：不丟棄、不修改——不合規定就停下並回報，不自行改收支別、金額正負或名稱。
import { isValidDate } from '../../src/calc/dates.ts';
import type { Flow } from '../../src/ledger/defaults.ts';
import type { LegacyData, RawNamed, RawTransaction } from './legacyData.ts';

export type MixedFlowMode = 'stop' | 'split';

export interface PlanTransaction {
  date: string;
  category: string;
  account: string;
  flow: Flow;
  amount: number;
  member: string | null;
}

export interface Plan {
  transactions: PlanTransaction[];
  categories: { name: string; flow: Flow }[];
  accounts: string[];
  members: string[];
}

export interface PlanResult {
  /** 有任何問題時為 undefined。 */
  plan?: Plan;
  /** 必須停下的問題（每項一段文字）。 */
  problems: string[];
  /** 不阻擋、但要讓人看到的事。 */
  notices: string[];
}

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.0+)?)?$/;
const SAMPLE_LIMIT = 10;

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  return match && isValidDate(match[1]) ? match[1] : null;
}

export function flowOf(type: unknown): Flow | null {
  return type === '支' ? 'expense' : type === '收' ? 'income' : null;
}

const FLOW_LABEL: Record<Flow, string> = { expense: '支出', income: '收入' };

function label(t: RawTransaction): string {
  return t.id !== null ? String(t.id) : `第${t.row}列`;
}

/** 名稱只差大小寫或前後空白的群組。 */
function lookAlikes(names: Iterable<string>): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export function buildPlan(data: LegacyData, options: { mixedFlow: MixedFlowMode }): PlanResult {
  const problems: string[] = [];
  const notices: string[] = [];

  // ---- 逐列檢查 ----
  const reasons: [string, (t: RawTransaction) => boolean][] = [
    ['日期缺漏或格式不認得', (t) => parseDate(t.date) === null],
    ['分類為空', (t) => text(t.category) === null],
    ['帳戶為空', (t) => text(t.account) === null],
    ['金額不是大於 0 的整數', (t) => !(typeof t.amount === 'number' && Number.isSafeInteger(t.amount) && t.amount > 0)],
    ['收支別不是「收」或「支」', (t) => flowOf(t.type) === null],
  ];
  for (const [reason, failed] of reasons) {
    const rows = data.transactions.filter(failed);
    if (rows.length === 0) continue;
    const ids = rows.slice(0, SAMPLE_LIMIT).map(label).join('、');
    problems.push(`${reason}：${rows.length} 筆（舊系統編號 ${ids}${rows.length > SAMPLE_LIMIT ? ' 等' : ''}）。這些列不會被丟棄或修改，請先在舊帳確認處理方式。`);
  }
  const rowsValid = problems.length === 0;

  // ---- 名稱表（分類表／帳戶表／成員表 ＋ 交易用到的名稱）----
  const blank = (rows: RawNamed[], what: string) => {
    const empty = rows.filter((r) => text(r.name) === null).length;
    if (empty > 0) problems.push(`${what}表有 ${empty} 列名稱為空。`);
  };
  blank(data.categories, '分類');
  blank(data.accounts, '帳戶');
  blank(data.members, '成員');

  const tableNames = (rows: RawNamed[]) => rows.map((r) => text(r.name)).filter((n): n is string => n !== null);
  const ordered = (table: string[], used: (string | null)[]) => [...new Set([...table, ...used.filter((n): n is string => n !== null)])];
  // 穩定順序：依舊系統交易編號；編號相同或缺漏時依匯出檔列序。
  const sorted = rowsValid
    ? [...data.transactions].sort((a, b) => (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER) || a.row - b.row)
    : [];
  const memberOf = (t: RawTransaction) => text(t.member);

  const accountNames = ordered(tableNames(data.accounts), sorted.map((t) => text(t.account)));
  const memberNames = ordered(tableNames(data.members), sorted.map(memberOf));
  const categoryUsed = sorted.map((t) => text(t.category));
  const categoryNames = ordered(tableNames(data.categories), categoryUsed);

  for (const [what, names] of [['分類', categoryNames], ['帳戶', accountNames], ['成員', memberNames]] as const) {
    for (const group of lookAlikes(names)) {
      problems.push(`${what}名稱只差大小寫或前後空白，不會自行合併：${group.map((n) => `「${n}」`).join('、')}。`);
    }
  }

  const duplicates = (what: string, rows: RawNamed[]) => {
    const rowsByName = new Map<string, number>();
    for (const n of tableNames(rows)) rowsByName.set(n, (rowsByName.get(n) ?? 0) + 1);
    for (const [name, count] of rowsByName) {
      if (count > 1) notices.push(`${what}表有 ${count} 列都叫「${name}」，已視為同一個${what}，沒有分開。`);
    }
  };
  duplicates('分類', data.categories);
  duplicates('帳戶', data.accounts);
  duplicates('成員', data.members);

  const reportExtras = (what: string, table: string[], all: string[]) => {
    const extra = all.filter((n) => !table.includes(n));
    if (extra.length > 0) notices.push(`交易用到、${what}表沒有的${what} ${extra.length} 個，已一併建立：${extra.map((n) => `「${n}」`).join('、')}。`);
  };
  if (rowsValid) {
    reportExtras('分類', tableNames(data.categories), categoryNames);
    reportExtras('帳戶', tableNames(data.accounts), accountNames);
    reportExtras('成員', tableNames(data.members), memberNames);
  }

  // ---- 分類收支別：以交易實際用法為準 ----
  const usage = new Map<string, { expense: number; income: number }>();
  for (const t of sorted) {
    const name = text(t.category)!;
    const u = usage.get(name) ?? { expense: 0, income: 0 };
    u[flowOf(t.type)!] += 1;
    usage.set(name, u);
  }
  const taken = new Set(categoryNames);
  const splitName = new Map<string, { flow: Flow; name: string }>(); // 原名 → 少數那一邊的新名稱
  const flowByName = new Map<string, Flow>();
  const categoriesOut: { name: string; flow: Flow }[] = [];
  const tableType = new Map(data.categories.map((c) => [text(c.name), c.type] as const));

  for (const name of categoryNames) {
    const u = usage.get(name);
    if (!u) {
      const flow = flowOf(tableType.get(name));
      if (flow === null) {
        problems.push(`分類「${name}」沒有任何交易使用，分類表的收支別（${String(tableType.get(name))}）又不是「收」或「支」。`);
        continue;
      }
      flowByName.set(name, flow);
      categoriesOut.push({ name, flow });
      continue;
    }
    if (u.income > 0 && u.expense > 0) {
      const summary = `分類「${name}」同時用在收入與支出：收入 ${u.income} 筆、支出 ${u.expense} 筆。`;
      if (options.mixedFlow === 'stop') {
        problems.push(`${summary}請決定處理方式；加上 --mixed-flow split 會把收入那一邊拆成「${name}（收入）」另一個分類（支出名稱保留）。`);
        continue;
      }
      // 只拆收入那一邊：支出名稱永遠保留（財務文件的預算歸屬以支出分類名稱為鍵）。
      const minority: Flow = 'income';
      const majority: Flow = 'expense';
      const newName = `${name}（收入）`;
      if (taken.has(newName)) {
        problems.push(`${summary}拆分後的名稱「${newName}」已被使用，無法自動拆分。`);
        continue;
      }
      taken.add(newName);
      splitName.set(name, { flow: minority, name: newName });
      flowByName.set(name, majority);
      flowByName.set(newName, minority);
      categoriesOut.push({ name, flow: majority }, { name: newName, flow: minority });
      notices.push(`${summary}已拆成「${name}」（${FLOW_LABEL[majority]} ${u[majority]} 筆）與「${newName}」（${FLOW_LABEL[minority]} ${u[minority]} 筆）。`);
      continue;
    }
    const flow: Flow = u.income > 0 ? 'income' : 'expense';
    const tableFlow = flowOf(tableType.get(name));
    if (tableFlow !== null && tableFlow !== flow) {
      notices.push(`分類「${name}」在分類表是${FLOW_LABEL[tableFlow]}，但交易實際都記為${FLOW_LABEL[flow]}，以交易為準。`);
    }
    flowByName.set(name, flow);
    categoriesOut.push({ name, flow });
  }

  if (problems.length > 0) return { problems, notices };

  const withoutMember = sorted.filter((t) => memberOf(t) === null).length;
  if (withoutMember > 0) notices.push(`${withoutMember} 筆交易沒有成員，帶入後成員為空。`);

  const transactions = sorted.map((t): PlanTransaction => {
    const name = text(t.category)!;
    const flow = flowOf(t.type)!;
    const split = splitName.get(name);
    return {
      date: parseDate(t.date)!,
      category: split && split.flow === flow ? split.name : name,
      account: text(t.account)!,
      flow,
      amount: t.amount as number,
      member: memberOf(t),
    };
  });
  return { plan: { transactions, categories: categoriesOut, accounts: accountNames, members: memberNames }, problems, notices };
}
