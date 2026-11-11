// 記帳 CSV 指令：預設值、交易驗證與拒收在這裡協調，index.ts 只負責序列化與交易接線。
import type { Queryable } from '../db/driver.ts';
import { isValidDate } from '../calc/dates.ts';
import { decodeCsv, encodeCsv, type CsvEncoding } from '../csv/encoding.ts';
import { CsvFormatError, readCsv, writeCsv } from '../csv/records.ts';
import { runQuantityImport } from '../csv/quantityImport.ts';
import type { Flow } from './defaults.ts';
import { LedgerError, type LedgerErrorCode } from './errors.ts';
import { assertDateOpen } from './monthLock.ts';
import { assertCategoryFlow, assertTransactionShape } from './transactionRules.ts';
import { insertTransaction, transactionsBetween, type NewTransaction } from './transactions.ts';

export { CsvFormatError } from '../csv/records.ts';
export type { CsvEncoding } from '../csv/encoding.ts';
export interface CsvImportOptions { encoding?: CsvEncoding }
export interface CsvRowRejection { row: number; code: LedgerErrorCode | 'invalid_row'; message: string }
export interface CsvImportResult {
  totalRows: number;
  addedRows: number;
  skippedRows: number;
  rejectedRows: number;
  /** 有套用任何預設值的資料列數，包含最後被拒收或略過的列。 */
  defaultedRows: number;
  unknownCategories: string[];
  rejections: CsvRowRejection[];
  defaults: { row: number; fields: string[] }[];
}

type Field = '日期' | '類別' | '金額' | '帳戶' | '收支別' | '備註' | '成員';
const HEADER: Field[] = ['日期', '類別', '金額', '帳戶', '收支別', '備註', '成員'];
const ALIASES: Record<string, Field> = { 日期: '日期', 類別: '類別', 分類: '類別', 金額: '金額', 帳戶: '帳戶', 收支別: '收支別', 收支: '收支別', 收支區分: '收支別', 備註: '備註', 成員: '成員' };
const LEGACY_HEADER = ['日期', '類別', '大類別', '金額', '幣別', '成員', '帳戶', '標籤', '備註', '收支區分', '上次更新', 'UUID'];
const textValid = (value: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const dedupKey = (date: string, categoryId: number, amount: number) => JSON.stringify([date, categoryId, amount]);

function csvDate(value: string): string | null {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  const separated = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  const parts = compact ?? separated;
  const date = parts ? `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}` : '';
  return isValidDate(date) ? date : null;
}

export async function importTransactionsCsv(tx: Queryable, input: string | Uint8Array, today: string, options: CsvImportOptions = {}): Promise<CsvImportResult> {
  let text: string;
  try { text = decodeCsv(input, options.encoding); }
  catch (error) { throw new CsvFormatError(error instanceof Error ? error.message : 'CSV 編碼無法辨識，整份檔未匯入。'); }
  const records = readCsv(text);
  const header = records.shift()?.cells.map((cell) => cell.trim());
  if (!header) throw new CsvFormatError('CSV 是空白檔案，請提供包含類別與金額的標題列。');
  const indices = new Map<Field, number>();
  header.forEach((name, index) => {
    const field = Object.hasOwn(ALIASES, name) ? ALIASES[name] : undefined;
    if (!field) return;
    if (indices.has(field)) throw new CsvFormatError(`CSV 標題「${field}」重複，整份檔未匯入。`);
    indices.set(field, index);
  });
  if (!indices.has('類別') || !indices.has('金額')) throw new CsvFormatError('CSV 標題必須包含「類別（或分類）」及「金額」，整份檔未匯入。');
  const legacy12 = header.length === 12 && LEGACY_HEADER.every((name, index) => header[index] === name || (index === 9 && ['收支', '收支別'].includes(header[index])));
  const [categories, accounts, members] = await Promise.all([
    tx.all<{ id: number; name: string; flow: Flow }>('SELECT id, name, flow FROM categories'),
    tx.all<{ id: number; name: string; kind: string; active: number }>('SELECT id, name, kind, active FROM accounts ORDER BY sort_order, id'),
    tx.all<{ id: number; name: string }>('SELECT id, name FROM members'),
  ]);
  // SQLite 名稱允許大小寫或前後空白不同的兩筆；優先原字串精確比對，避免改變交易歸屬。
  const categoryMap = new Map(categories.map((item) => [item.name, item]));
  const accountMap = new Map(accounts.map((item) => [item.name, item]));
  const memberMap = new Map(members.map((item) => [item.name, item]));
  let cash = accounts.find((item) => item.active === 1 && item.kind === 'cash' && item.name === '現金')
    ?? accounts.find((item) => item.active === 1 && item.kind === 'cash');
  const result: CsvImportResult = { totalRows: records.length, addedRows: 0, skippedRows: 0, rejectedRows: 0, defaultedRows: 0, unknownCategories: [], rejections: [], defaults: [] };
  const valid: NewTransaction[] = [];
  for (const record of records) {
    let cells = record.cells;
    // 舊 12 欄容許未加引號的備註逗號，收支與末兩欄仍從右側錨定。
    if (legacy12 && cells.length > 12) cells = [...cells.slice(0, 8), cells.slice(8, -3).join(','), ...cells.slice(-3)];
    if (cells.length > header.length) {
      result.rejections.push({ row: record.row, code: 'invalid_row', message: '欄位數超過標題列；含逗號的欄位請用雙引號包住。' });
      continue;
    }
    const raw = (field: Field) => { const i = indices.get(field); return i === undefined ? undefined : cells[i]; };
    const trim = (field: Field) => raw(field)?.trim() ?? '';
    const named = <T>(items: ReadonlyMap<string, T>, field: Field) => items.get(raw(field) ?? '') ?? items.get(trim(field));
    const fields: string[] = [];
    const useDefault = (field: Field) => { fields.push(field); };
    const parsedDate = csvDate(trim('日期'));
    if (!parsedDate) useDefault('日期');
    const matchedAccount = named(accountMap, '帳戶');
    const account = matchedAccount?.active === 1 ? matchedAccount : undefined;
    if (!account) useDefault('帳戶');
    const flowText = trim('收支別');
    const flow = ['收', '收入', 'income'].includes(flowText) ? 'income' : ['支', '支出', 'expense'].includes(flowText) ? 'expense' : null;
    if (!flow) useDefault('收支別');
    const note = raw('備註');
    if (note === undefined || !textValid(note)) useDefault('備註');
    const memberName = trim('成員');
    const member = named(memberMap, '成員');
    if (raw('成員') === undefined || (memberName !== '' && !member)) useDefault('成員');
    if (fields.length > 0) result.defaults.push({ row: record.row, fields });
    const categoryName = trim('類別');
    const category = named(categoryMap, '類別');
    const amountText = trim('金額').replace(/[, ]/g, '');
    const amount = /^[+-]?\d+$/.test(amountText) ? Number(amountText) : NaN;
    const transaction: NewTransaction = { date: parsedDate ?? today, categoryId: category?.id ?? 0, accountId: (account ?? cash)?.id ?? 0, flow: flow ?? 'expense', amount,
      note: note !== undefined && textValid(note) ? note : '', memberId: member?.id ?? null };
    try {
      if (!category) {
        const name = categoryName || '（空白）';
        if (!result.unknownCategories.includes(name)) result.unknownCategories.push(name);
        throw new LedgerError('unknown_category', `分類「${name}」不存在，請先新增分類再匯入。`);
      }
      assertTransactionShape(transaction);
      assertCategoryFlow(category, transaction.flow);
      // 已結列先拒收（包含同鍵舊列），確保拒收原因與月結保護一致。
      await assertDateOpen(tx, transaction.date);
      valid.push(transaction);
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      result.rejections.push({ row: record.row, code: error.code, message: error.message });
    }
  }
  const counts = await runQuantityImport({
    rows: valid.sort((a, b) => a.date.localeCompare(b.date)),
    key: (row) => dedupKey(row.date, row.categoryId, row.amount),
  }, {
    async existingCounts() {
      const rows = await tx.all<{ date: string; categoryId: number; amount: number; count: number }>(
        'SELECT date, category_id AS categoryId, amount, COUNT(*) AS count FROM transactions GROUP BY date, category_id, amount');
      return new Map(rows.map((row) => [dedupKey(row.date, row.categoryId, row.amount), row.count]));
    },
    async write(row) {
      // 帳戶欄是選填：若沒有使用中的現金帳戶，在確定要新增時才補建零開帳餘額的現金帳戶。
      // 不能為整份拒收或重複略過的檔案新增帳戶，也不覆寫現有同名的其他種類帳戶。
      if (row.accountId === 0) {
        if (!cash) {
          let name = '現金';
          for (let suffix = 2; accountMap.has(name); suffix++) name = `現金（${suffix}）`;
          const last = await tx.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM accounts');
          const added = await tx.run("INSERT INTO accounts (name, kind, sort_order, opening_balance) VALUES (?, 'cash', ?, 0)", [name, (last?.top ?? -1) + 1]);
          cash = { id: added.lastInsertRowId, name, kind: 'cash', active: 1 };
        }
        await insertTransaction(tx, { ...row, accountId: cash.id });
      } else {
        await insertTransaction(tx, row);
      }
    },
  });
  return { ...result, ...counts, rejectedRows: result.rejections.length, defaultedRows: result.defaults.length };
}

/** 全部交易都包含，含已結及開帳日前資料；匯出只讀，不改月結文件。 */
export async function exportTransactionsCsv(q: Queryable): Promise<Uint8Array> {
  const rows = await transactionsBetween(q, '0001-01-01', '9999-12-31');
  return encodeCsv('\uFEFF' + writeCsv([HEADER, ...rows.map((row) => [row.date, row.categoryName, String(row.amount), row.accountName,
    row.flow === 'income' ? '收入' : '支出', row.note, row.memberName ?? ''])]));
}
