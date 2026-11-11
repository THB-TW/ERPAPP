// 測試用：依 tools/export-finance-baseline.ps1 的匯出格式，產生一份小型虛構匯出（名稱、金額全是虛構）。
// 含員工密碼、信用卡明細、投資等「不該搬」的資料表，用來確認它們不會進到輸出。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../../../tools/lib/verify-export.mjs';
import { emptyBudgetState, serializeBudgetDocument } from '../../src/calc/budgetDocument.ts';
import type { BudgetState, MonthClose } from '../../src/calc/budgetTypes.ts';
import type { BaselineIdentity } from './baseline.ts';

export const FICTIONAL_PASSWORD = 'FICTIONAL_PASSWORD_8421';

type Row = Record<string, string | number | boolean | null>;
interface TableSpec { name: string; columns: [string, string, boolean?][]; rows: Row[] }

export interface FictionalExport {
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
    tables: 8,
    totalRows: data.transactions.length + data.categories.length + data.accounts.length + data.members.length + 1 + 1 + 1 + 1,
    transactions: data.transactions.length,
    workspaceMonths: data.state.months.length,
    historicalAssetMismatches: 0,
  };
}
