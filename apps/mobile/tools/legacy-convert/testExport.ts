// 測試用：依 tools/export-finance-baseline.ps1 的匯出格式，產生一份小型虛構匯出（名稱、金額全是虛構）。
// 含員工密碼、信用卡明細、投資等「不該搬」的資料表，用來確認它們不會進到輸出。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../../../tools/lib/verify-export.mjs';
import { emptyBudgetState, serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import { position } from '../../src/calc/budgetEngine.ts';
import type { BudgetAdjustment, BudgetRevision, BudgetState, MonthClose } from '../../src/calc/budgetTypes.ts';
import type { BaselineIdentity } from './baseline.ts';

export const FICTIONAL_PASSWORD = 'FICTIONAL_PASSWORD_8421';

type Row = Record<string, string | number | boolean | null>;
interface TableSpec { name: string; columns: [string, string, boolean?][]; rows: Row[] }

/** 舊系統的三張「獨立投影表」（dbo.Property、dbo.budget、dbo.BudgetCap）的列；比對工具用它們當獨立來源。 */
export interface ProjectionRows {
  property: Row[];
  budget: Row[];
  budgetCap: Row[];
}

export interface FictionalExport {
  /** 有給才會多寫出 Property／budget／BudgetCap 三張資料表。 */
  projections?: ProjectionRows;
  transactions: Row[];
  categories: Row[];
  accounts: Row[];
  members: Row[];
  state: BudgetState;
  /** 直接指定財務文件原文（覆寫 state），用來測試壞文件。 */
  documentText?: string;
  workspaceVersion?: string;
}

function closed(p: Partial<MonthClose>): MonthClose {
  return {
    id: '', month: '', income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
    migrated: true, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '2026-11-01T00:00:00+08:00', actor: 'legacy', ...p,
  };
}

export function fictionalState(): BudgetState {
  return {
    ...emptyBudgetState(),
    version: 4,
    categories: [{ id: 'r-food', name: '飲食儲備', kind: 'reserve' }],
    months: [
      closed({ id: 'm9', month: '2026-09', income: 40000, rawSpare: 5000, tuition: 100, balances: { 'r-food': 700 } }),
      closed({ id: 'm10', month: '2026-10', income: 1, rawSpare: 6000, tuition: 100, balances: { 'r-food': 800 }, legacyTotalDifference: 12 }),
    ],
    checks: [{
      Id: 'check-1', Month: '2026-10', Time: '2026-11-06T10:00:00+08:00', Actor: 'legacy', Reason: '例行核對', Version: 3,
      Input: { OperationId: 'x', Reason: '', AsOfDate: '2026-11-06T00:00:00', Year: 2026, Month: 10, Cash: 1000, Ipass: 50, Bank: 20000,
        UnbilledCredit: 300, NetDeployed: 0, Adjust: 0, AutoRollback: true },
      Result: { Version: 4, RecordId: 'check-1', AsOfDate: '2026-11-06T00:00:00', ActualRaw: 21350, RollbackTotal: 60, ActualAdjusted: 21410,
        HasBook: true, BookTotalproperty: 21410, Diff: 0, Rollbacks: [{ Account: '現金', NextMonthExpense: 60, NextMonthIncome: 0, Net: 60 }] },
    }],
  };
}

export function fictionalExport(): FictionalExport {
  const tx = (Id: number, date: string, Category: string, Amount: number, Member: string | null, Account: string, TransactionType: string | null): Row =>
    ({ Id, date, Category, Amount, Member, Account, TransactionType });
  return {
    transactions: [
      tx(1, '2026-09-01T00:00:00', '薪資', 40000, '小明', '銀行', '收'),
      tx(2, '2026-09-02T00:00:00', '飲食', 150, '小明', '現金', '支'),
      tx(3, '2026-09-02T00:00:00', '飲食', 150, '小明', '現金', '支'), // 合法重複列
      tx(4, '2026-10-15T00:00:00', '表外分類', 80, null, '現金', '支'),
      tx(5, '2026-11-03T00:00:00', '飲食', 60, '小明', '現金', '支'),
    ],
    categories: [
      { CategoryId: 1, CategoryName: '飲食', Type: '支' },
      { CategoryId: 2, CategoryName: '薪資', Type: '收' },
      { CategoryId: 3, CategoryName: '沒用到的分類', Type: '支' },
    ],
    accounts: [
      { AccountId: 1, AccountName: '現金', Balance: '0.00' },
      { AccountId: 2, AccountName: '銀行', Balance: '0.00' },
      { AccountId: 3, AccountName: '信用卡', Balance: '0.00' },
    ],
    members: [{ MemberId: 1, MemberName: '小明' }],
    state: fictionalState(),
  };
}

/** 寫出匯出目錄（含 manifest 與每檔 SHA-256），回傳目錄路徑。 */
export function writeFictionalExport(privateRoot: string, data: FictionalExport = fictionalExport()): string {
  mkdirSync(privateRoot, { recursive: true });
  const dir = mkdtempSync(path.join(privateRoot, 'export-'));
  const document = data.documentText ?? serializeBudgetDocument(data.state);
  const tables: TableSpec[] = [
    { name: 'Transactions', rows: data.transactions, columns: [['Id', 'int'], ['date', 'datetime'], ['Category', 'nvarchar'], ['Amount', 'int'],
      ['Member', 'nvarchar', true], ['Account', 'nvarchar'], ['TransactionType', 'nvarchar', true]] },
    { name: 'Categories', rows: data.categories, columns: [['CategoryId', 'int'], ['CategoryName', 'nvarchar'], ['Type', 'nvarchar']] },
    { name: 'Accounts', rows: data.accounts, columns: [['AccountId', 'int'], ['AccountName', 'nvarchar'], ['Balance', 'money']] },
    { name: 'Members', rows: data.members, columns: [['MemberId', 'int'], ['MemberName', 'nvarchar']] },
    { name: 'FinanceWorkspace', rows: [{ Id: 1, Version: data.workspaceVersion ?? String(data.state.version), Document: document }],
      columns: [['Id', 'int'], ['Version', 'bigint'], ['Document', 'nvarchar']] },
    ...(data.projections ? projectionTables(data.projections) : []),
    { name: 'Employee', rows: [{ EmployeeId: 1, Account: 'fictional-user', Password: FICTIONAL_PASSWORD }],
      columns: [['EmployeeId', 'int'], ['Account', 'nvarchar'], ['Password', 'nvarchar']] },
    { name: 'creditcard', rows: [{ Date: '2026-09-03', Item: '虛構店家', Amount: 999 }], columns: [['Date', 'date'], ['Item', 'nvarchar'], ['Amount', 'int']] },
    { name: 'InvestmentHolding', rows: [{ Id: 1, Symbol: 'FICT' }], columns: [['Id', 'int'], ['Symbol', 'nvarchar']] },
  ];
  const files: { file: string; bytes: number; sha256: string }[] = [];
  const save = (name: string, content: unknown) => {
    const bytes = Buffer.from(JSON.stringify(content));
    writeFileSync(path.join(dir, name), bytes);
    files.push({ file: name, bytes: bytes.length, sha256: sha256(bytes) });
    return sha256(bytes);
  };
  save('schema.json', tables.flatMap((t) => t.columns.map(([name, type, nullable], i) =>
    ({ schema: 'dbo', table: t.name, ordinal: i + 1, name, type, nullable: nullable === true }))));
  const manifestTables = tables.map((t) => {
    const file = `dbo.${t.name}.json`;
    return { table: `dbo.${t.name}`, file, rows: t.rows.length, sha256: save(file, t.rows) };
  });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    formatVersion: 1, sourceCommit: 'fictional-commit', sourceDatabase: 'ERPDB_CloudflareBaseline_FICTIONAL', readOnlySource: true,
    notForUpload: true, tables: manifestTables, files, validation: { workspaceMonths: data.state.months.length, historicalAssetMismatches: 0 },
  }));
  return dir;
}

/** 虛構匯出自己的「基準身分」預期值（正式的身分常數在 baseline.ts，只用於真實匯出）。 */
export function fictionalBaseline(data: FictionalExport = fictionalExport()): BaselineIdentity {
  return {
    sourceDatabase: 'ERPDB_CloudflareBaseline_FICTIONAL',
    tables: 8 + (data.projections ? 3 : 0),
    totalRows: data.transactions.length + data.categories.length + data.accounts.length + data.members.length + 1 + 1 + 1 + 1 +
      (data.projections ? data.projections.property.length + data.projections.budget.length + data.projections.budgetCap.length : 0),
    transactions: data.transactions.length,
    workspaceMonths: data.state.months.length,
    historicalAssetMismatches: 0,
  };
}

// ---- 比對工具用的虛構資料：有收入、上限版本、調整、歷史差異，並附上三張獨立投影表 ----

const LEGACY_RESERVES = ['food', 'car', 'fun', 'study', 'cloth', 'articles', 'furniture', 'hair', 'health', 'other'];

function projectionTables(p: ProjectionRows): TableSpec[] {
  const int = (name: string): [string, string, boolean] => [name, 'int', true];
  return [
    { name: 'Property', rows: p.property, columns: [['date', 'datetime'], int('own'), int('sparemoney'), int('tuitionfee'), int('budget'), int('totalproperty'), ['inputdate', 'datetime']] },
    { name: 'budget', rows: p.budget, columns: [['date', 'datetime'], ...LEGACY_RESERVES.map(int), int('total'), int('expenditure'), int('gete'), ['inputdate', 'datetime']] },
    { name: 'BudgetCap', rows: p.budgetCap, columns: [['month', 'date'], ...[...LEGACY_RESERVES, 'phone', 'gogoro', 'tuition'].map((n): [string, string] => [n, 'int']), ['updatedAt', 'datetime2']] },
  ];
}

/** 舊系統 BudgetSeeder.LegacyBalances 的規則：不在十個舊類別裡的儲備併入「其他」。 */
function legacyFold(balances: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(LEGACY_RESERVES.map((id) => [id, balances[id] ?? 0]));
  for (const [id, value] of Object.entries(balances)) if (!LEGACY_RESERVES.includes(id)) out.other += value;
  return out;
}

const revision = (month: string, tuition: number, limits: [string, number][]): BudgetRevision => ({
  id: 'legacy-caps-' + month, month, tuition, reason: '帶入既有上限', actor: '歷史移轉', time: month + '-01T00:00:00+08:00',
  limits: limits.map(([categoryId, amount]) => ({ categoryId, amount })),
  mapping: { 飲食: 'food', 其他: 'other', 電話網路: 'phone', 水費: 'water' },
});
const adjustment = (p: Partial<BudgetAdjustment> & Pick<BudgetAdjustment, 'id' | 'month' | 'kind' | 'amount'>): BudgetAdjustment =>
  ({ from: null, to: null, reason: '虛構調整', actor: 'app', time: '2026-11-02T00:00:00+08:00', reverses: null, changes: [], ...p });

/** 四個月、含上限版本（2026-08、2026-10 各有自己的；2026-09 沿用 08 的）、三筆調整、兩個月有歷史差異。 */
export function comparableState(): BudgetState {
  const rA = revision('2026-08', 100, [['food', 5000], ['other', 1000], ['phone', 800], ['water', 0]]);
  const rB = revision('2026-10', 120, [['food', 5500], ['other', 900], ['phone', 800], ['water', 0]]);
  return {
    ...emptyBudgetState(),
    version: 4,
    categories: [
      { id: 'food', name: '飲食', kind: 'reserve' }, { id: 'other', name: '其他', kind: 'reserve' }, { id: 'pet', name: '寵物', kind: 'reserve' },
      { id: 'phone', name: '電話網路', kind: 'fixed' }, { id: 'water', name: '水費', kind: 'actual' },
    ],
    revisions: [rA, rB],
    months: [
      closed({ id: 'm7', month: '2026-07', income: 8000, surplus: 2000, rawSpare: 9000, tuition: 100, balances: { food: 1000, other: 200, pet: 0 } }),
      closed({ id: 'm8', month: '2026-08', income: 9000, surplus: 2500, rawSpare: 11500, tuition: 200, balances: { food: 1300, other: 450, pet: 0 }, changes: { food: 300, other: 250 }, revision: rA }),
      closed({ id: 'm9', month: '2026-09', income: 9500, surplus: 2600, rawSpare: 14100, tuition: 300, balances: { food: 1500, other: 700, pet: 0 }, changes: { food: 200, other: 250 }, revision: rA, legacyTotalDifference: 12 }),
      closed({ id: 'm10', month: '2026-10', income: 10000, surplus: 3200, rawSpare: 17300, tuition: 420, balances: { food: 1900, other: 900, pet: 0 }, changes: { food: 400, other: 200 }, revision: rB, legacyTotalDifference: -7 }),
    ],
    adjustments: [
      adjustment({ id: 'adj-1', month: '2026-08', kind: 'correct', amount: -50 }),
      adjustment({ id: 'adj-2', month: '2026-09', kind: 'fund', amount: 300, to: 'pet' }),
      adjustment({ id: 'adj-3', month: '2026-10', kind: 'transfer', amount: 100, from: 'food', to: 'other' }),
    ],
    checks: fictionalState().checks,
  };
}

/** 依文件狀態做出三張投影表（用 App 的引擎算，跟比對工具自己的算法互為獨立）。2026-07 刻意沒有 budget 列，上限只有 08、10 兩列。 */
export function projectionsFor(state: BudgetState): ProjectionRows {
  const months = [...state.months].sort((a, b) => (a.month < b.month ? -1 : 1));
  const property = months.map((m) => {
    const p = position(state, m.month);
    return { date: m.month + '-01T00:00:00', own: p.income, sparemoney: p.spare, tuitionfee: p.tuition, budget: p.reserve, totalproperty: p.total, inputdate: m.month + '-28T00:00:00' };
  });
  const budget: Row[] = months.filter((m) => m.month !== '2026-07').map((m) => {
    const changes = legacyFold(m.changes);
    return { date: m.month + '-01T00:00:00', ...changes, total: Object.values(m.changes).filter((v) => v > 0).reduce((a, b) => a + b, 0), expenditure: m.surplus - m.income, gete: m.surplus, inputdate: m.month + '-28T00:00:00' };
  });
  const latest = position(state, months[months.length - 1].month);
  budget.push({ date: '1911-01-01T00:00:00', ...legacyFold(latest.balances), total: latest.reserve, expenditure: 0, gete: 0, inputdate: '1911-01-01T00:00:00' });
  const budgetCap: Row[] = state.revisions.map((r) => {
    const limit = (id: string) => r.limits.find((l) => l.categoryId === id)?.amount ?? 0;
    return { month: r.month + '-01', ...Object.fromEntries([...LEGACY_RESERVES, 'phone', 'gogoro'].map((id) => [id, limit(id)])), tuition: r.tuition, updatedAt: r.month + '-01T00:00:00' };
  });
  return { property, budget, budgetCap };
}

/** 比對工具用的虛構匯出：2026-08、2026-10 的月結剛好能由交易重算出來；2026-09 的交易算出來會與存檔不同。 */
export function comparableExport(): FictionalExport {
  const state = comparableState();
  const tx = (Id: number, date: string, Category: string, Amount: number, Account: string, TransactionType: '收' | '支'): Row =>
    ({ Id, date: date + 'T00:00:00', Category, Amount, Member: null, Account, TransactionType });
  return {
    state,
    projections: projectionsFor(state),
    transactions: [
      tx(1, '2026-07-05', '薪資', 8000, '銀行', '收'), tx(2, '2026-07-06', '飲食', 800, '現金', '支'),
      tx(3, '2026-08-05', '薪資', 9000, '銀行', '收'), tx(4, '2026-08-06', '飲食', 4700, '現金', '支'),
      tx(5, '2026-08-07', '其他', 750, '現金', '支'), tx(6, '2026-08-08', '電話網路', 400, '銀行', '支'),
      tx(7, '2026-09-05', '薪資', 9500, '銀行', '收'), tx(8, '2026-09-06', '飲食', 4800, '現金', '支'),
      tx(9, '2026-09-07', '其他', 800, '現金', '支'), tx(10, '2026-09-08', '電話網路', 300, '銀行', '支'),
      tx(11, '2026-10-05', '薪資', 10000, '銀行', '收'), tx(12, '2026-10-06', '飲食', 5100, '現金', '支'),
      tx(13, '2026-10-07', '其他', 700, '現金', '支'), tx(14, '2026-10-08', '電話網路', 280, '銀行', '支'),
      tx(15, '2026-11-03', '飲食', 60, '現金', '支'),
    ],
    categories: [
      { CategoryId: 1, CategoryName: '飲食', Type: '支' }, { CategoryId: 2, CategoryName: '薪資', Type: '收' },
      { CategoryId: 3, CategoryName: '其他', Type: '支' }, { CategoryId: 4, CategoryName: '電話網路', Type: '支' },
    ],
    accounts: fictionalExport().accounts,
    members: fictionalExport().members,
  };
}
