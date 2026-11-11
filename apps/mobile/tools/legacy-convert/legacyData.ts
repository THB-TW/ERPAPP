// 從已驗證的匯出讀出「要搬的五樣東西」：交易、分類、帳戶、成員、財務文件（含核對紀錄）。
// 這裡只讀出原始值，不判斷對錯；判斷在 plan.ts。員工、密碼、權限、信用卡明細、投資等其他資料表不讀。
import type { ExportTable, ExportValue, VerifiedExport } from '../../../../tools/lib/verify-export.mjs';

export class LegacyExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyExportError';
  }
}

export interface RawTransaction {
  /** 匯出檔內的列序（從 1 起），用於穩定排序與回報。 */
  row: number;
  /** 舊系統的交易編號；匯出沒有時為 null。 */
  id: number | null;
  date: ExportValue;
  category: ExportValue;
  amount: ExportValue;
  member: ExportValue;
  account: ExportValue;
  type: ExportValue;
}

export interface RawNamed {
  id: number;
  name: ExportValue;
  type?: ExportValue;
  /** 帳戶表的舊餘額（僅帳戶有）；僅供參考。 */
  balance?: ExportValue;
}

/** 財務文件中的總資產核對紀錄（舊格式 PascalCase，原樣）。 */
export type RawCheck = Record<string, unknown>;

export interface LegacyData {
  transactions: RawTransaction[];
  categories: RawNamed[];
  accounts: RawNamed[];
  members: RawNamed[];
  /** 財務文件 JSON 原文。 */
  document: string;
  /** 文件內最後一個搬遷月份（搬遷截止月，YYYY-MM）；沒有月份為 null。 */
  cutoffMonth: string | null;
  months: number;
  checks: RawCheck[];
}

function findTable(verified: VerifiedExport, candidates: string[], what: string): ExportTable {
  const wanted = candidates.map((c) => c.toLowerCase());
  const found = verified.tables.filter((t) => wanted.includes(t.sourceTable.toLowerCase()));
  if (found.length !== 1) throw new LegacyExportError(`匯出缺少${what}資料表（預期名稱：${candidates.map((c) => 'dbo.' + c).join(' 或 ')}）。`);
  return found[0];
}

/** 欄位名稱不分大小寫對應到匯出實際的欄位名（舊系統的日期欄位是小寫 date）。 */
function resolver(table: ExportTable): (name: string) => string {
  const actual = new Map(table.columns.map((c) => [c.name.toLowerCase(), c.name]));
  return (name) => {
    const found = actual.get(name.toLowerCase());
    if (found === undefined) throw new LegacyExportError(`${table.source} 缺少欄位 ${name}。`);
    return found;
  };
}

function integerId(value: ExportValue, what: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  throw new LegacyExportError(`${what}的編號不是整數。`);
}

function named(table: ExportTable, idColumn: string, nameColumn: string, typeColumn?: string, balanceColumn?: string): RawNamed[] {
  const col = resolver(table);
  const id = col(idColumn);
  const name = col(nameColumn);
  const type = typeColumn ? col(typeColumn) : undefined;
  const balance = balanceColumn ? col(balanceColumn) : undefined;
  return table.rows
    .map((row) => ({ id: integerId(row[id], table.source), name: row[name], ...(type ? { type: row[type] } : {}), ...(balance ? { balance: row[balance] } : {}) }))
    .sort((a, b) => a.id - b.id);
}

export function readLegacyExport(verified: VerifiedExport): LegacyData {
  const txTable = findTable(verified, ['Transactions', 'Transaction'], '交易');
  const col = resolver(txTable);
  const [cId, cDate, cCategory, cAmount, cMember, cAccount, cType] =
    ['Id', 'date', 'Category', 'Amount', 'Member', 'Account', 'TransactionType'].map(col);
  const transactions = txTable.rows
    .map((row, i): RawTransaction => ({
      row: i + 1,
      id: row[cId] === null ? null : integerId(row[cId], '交易'),
      date: row[cDate], category: row[cCategory], amount: row[cAmount], member: row[cMember], account: row[cAccount], type: row[cType],
    }));

  const categories = named(findTable(verified, ['Categories', 'Category'], '分類'), 'CategoryId', 'CategoryName', 'Type');
  const accounts = named(findTable(verified, ['Accounts', 'Account'], '帳戶'), 'AccountId', 'AccountName', undefined, 'Balance');
  const members = named(findTable(verified, ['Members', 'Member'], '成員'), 'MemberId', 'MemberName');

  const workspace = findTable(verified, ['FinanceWorkspace'], '財務文件');
  if (workspace.rows.length !== 1) throw new LegacyExportError('財務文件資料表必須剛好一列。');
  const wcol = resolver(workspace);
  const row = workspace.rows[0];
  const document = row[wcol('Document')];
  if (typeof document !== 'string') throw new LegacyExportError('財務文件內容不是字串。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    throw new LegacyExportError('財務文件不是有效的 JSON。');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new LegacyExportError('財務文件的內容不是一個 JSON 物件。');
  const doc = parsed as { Version?: unknown; Months?: unknown; Checks?: unknown };
  if (String(row[wcol('Version')]) !== String(doc.Version)) {
    throw new LegacyExportError('財務文件資料列的版本與文件內的版本不一致。');
  }
  const months = Array.isArray(doc.Months) ? (doc.Months as unknown[]) : [];
  if (months.some((m) => typeof m !== 'object' || m === null)) throw new LegacyExportError('財務文件的月結清單含有不是物件的項目。');
  const monthNames = (months as { Month?: unknown }[]).map((m) => m.Month).filter((m): m is string => typeof m === 'string').sort();
  return {
    transactions, categories, accounts, members, document,
    cutoffMonth: monthNames.length ? monthNames[monthNames.length - 1] : null,
    months: months.length,
    checks: Array.isArray(doc.Checks) ? (doc.Checks as unknown[]).filter((c): c is RawCheck => typeof c === 'object' && c !== null) : [],
  };
}
