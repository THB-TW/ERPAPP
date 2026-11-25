import type { Queryable } from '../db/driver.ts';
import { isValidDate, isValidMonth } from '../calc/dates.ts';
import { decodeCsv, type CsvEncoding } from '../csv/encoding.ts';
import { CsvFormatError, readCsv } from '../csv/records.ts';
import { assertAccountUsable } from './accounts.ts';
import { assertDateOpen } from './monthLock.ts';
import { LedgerError } from './errors.ts';

export interface CardStatement {
  id: number;
  date: string;
  merchant: string;
  amount: number;
  accountId: number;
  account: string;
}
export interface CardStatementRequest { accountId: number; csv: string | Uint8Array; encoding?: CsvEncoding }
export interface CardStatementResult { imported: number; skipped: number; total: number }
export interface CardStatementFilter { month?: string; accountId?: number }

function parseDate(value: string): string | null {
  const parts = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim()) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!parts) return null;
  const date = `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
  return isValidDate(date) ? date : null;
}

function parseRows(input: CardStatementRequest) {
  let text: string;
  try { text = decodeCsv(input.csv, input.encoding); }
  catch { throw new CsvFormatError('CSV 的文字編碼不正確，請使用 UTF-8 或 Big5。'); }
  const records = readCsv(text);
  const rows: { date: string; merchant: string; amount: number }[] = [];
  let start = 0;
  let columns = [0, 1, 2];
  let width = 3;
  let bank = false;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const names = records[i].cells.map((c) => c.trim());
    const found = ['消費日', '摘要', '新臺幣金額'].map((name) => names.indexOf(name));
    if (found.every((n) => n >= 0) && found[0] < found[1] && found[1] < found[2]) {
      columns = found; width = names.length; start = i + 1; bank = true; break;
    }
  }
  if (!bank && records[0]?.cells.map((c) => c.trim()).join('|') === '日期|店家|金額') start = 1;
  if (records.length === 0) throw new CsvFormatError('CSV 沒有帳單內容，整份檔未匯入。');
  // 共用解析器會省略整列空欄位。帳單的「,,,」仍是壞列，不能當空白行略過；
  // 用解析器的實體行號與欄位換行數辨識被省略的列，不改共用解析器或重寫引號規則。
  const occupied = new Set<number>();
  for (const record of records) {
    const lines = 1 + record.cells.reduce((n, cell) => n + (cell.match(/\r\n|\r|\n/g)?.length ?? 0), 0);
    for (let row = record.row; row < record.row + lines; row++) occupied.add(row);
  }
  const bodyRow = bank ? records[start - 1].row + 1 : 1;
  for (const [index, line] of text.split(/\r\n|\r|\n/).entries()) {
    const row = index + 1;
    if (row >= bodyRow && line.trim() !== '' && !occupied.has(row)) {
      throw new CsvFormatError(`CSV 第 ${row} 行只有空欄位，不是有效的帳單列，整份檔未匯入。`);
    }
  }
  for (const record of records.slice(start)) {
    const cells = record.cells.map((c) => c.trim());
    const bad = (reason: string): never => { throw new CsvFormatError(`CSV 第 ${record.row} 行${reason}，整份檔未匯入。`); };
    if (bank ? cells.length < width : cells.length !== width) bad(bank ? '與銀行標題的欄數不符' : '不是「日期,店家,金額」三欄格式');
    const extra = bank ? cells.length - width : 0;
    const amountColumn = columns[2] + extra;
    // 舊銀行格式只容許摘要多出未加引號的逗號；金額若被拆成千分位，不猜測以免負數變正數。
    if (extra > 0 && /^[+-]?\d{1,3}$/.test(cells[amountColumn - 1]) && /^\d{3}$/.test(cells[amountColumn])) {
      bad('的金額千分位未加引號');
    }
    const date = parseDate(cells[columns[0]]);
    if (!date) bad('的日期不正確');
    const merchant = cells.slice(columns[1], columns[1] + 1 + extra).join(',');
    if (!merchant) bad('缺少店家或摘要');
    const rawAmount = cells[amountColumn].replaceAll(',', '').replaceAll(' ', '');
    const amount = /^[+-]?\d+$/.test(rawAmount) ? Number(rawAmount) : NaN;
    if (!Number.isSafeInteger(amount)) bad('的金額必須是新台幣整數');
    if (amount < 0) continue;
    rows.push({ date: date!, merchant, amount });
  }
  return rows;
}

export async function importCardStatement(q: Queryable, input: CardStatementRequest): Promise<CardStatementResult> {
  await assertAccountUsable(q, input.accountId);
  const account = await q.get<{ kind: string }>('SELECT kind FROM accounts WHERE id = ?', [input.accountId]);
  if (account?.kind !== 'credit_card') throw new LedgerError('invalid_account', '匯入帳單前請先選擇信用卡帳戶。');
  const rows = parseRows(input);
  // 先驗證整份內容與月份，任何一列有問題都不留下部分匯入。
  for (const row of rows) await assertDateOpen(q, row.date);
  const counts = await q.all<{ date: string; merchant: string; amount: number; n: number }>(
    'SELECT date, merchant, amount, COUNT(*) AS n FROM card_statements WHERE account_id = ? GROUP BY date, merchant, amount', [input.accountId],
  );
  const key = (r: { date: string; merchant: string; amount: number }) => JSON.stringify([r.date, r.merchant, r.amount]);
  const remaining = new Map(counts.map((r) => [key(r), r.n]));
  let skipped = 0;
  for (const row of rows) {
    const k = key(row);
    const count = remaining.get(k) ?? 0;
    if (count > 0) { remaining.set(k, count - 1); skipped++; continue; }
    await q.run('INSERT INTO card_statements (date, merchant, amount, account_id) VALUES (?, ?, ?, ?)',
      [row.date, row.merchant, row.amount, input.accountId]);
  }
  return { imported: rows.length - skipped, skipped, total: rows.length };
}

export async function listCardStatements(q: Queryable, filter: CardStatementFilter = {}): Promise<CardStatement[]> {
  if (filter.month !== undefined && !isValidMonth(filter.month)) throw new LedgerError('invalid_month', '月份格式不正確，請用 YYYY-MM。');
  if (filter.accountId !== undefined && !await q.get('SELECT 1 FROM accounts WHERE id = ?', [filter.accountId])) {
    throw new LedgerError('unknown_account', '找不到這個帳戶。');
  }
  return q.all<CardStatement>(`SELECT s.id, s.date, s.merchant, s.amount, s.account_id AS accountId, a.name AS account
    FROM card_statements s JOIN accounts a ON a.id = s.account_id
    WHERE (? IS NULL OR substr(s.date, 1, 7) = ?) AND (? IS NULL OR s.account_id = ?) ORDER BY s.date, s.id`,
  [filter.month ?? null, filter.month ?? null, filter.accountId ?? null, filter.accountId ?? null]);
}
