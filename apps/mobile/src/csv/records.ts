// 與儲存無關的 CSV 紀錄讀寫；先完整解析，再交給帳本服務寫入。
export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

export interface CsvRecord { row: number; cells: string[] }

/** RFC 4180 引號、跳脫及多行欄位；row 為紀錄起始的實體行號。 */
export function readCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  let row = 1;
  let start = 1;
  function endRecord() {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== '')) records.push({ row: start, cells });
    cells = [];
    cell = '';
    closed = false;
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        cell += ch;
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) row++;
      }
    } else if (ch === ',') {
      cells.push(cell); cell = ''; closed = false;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord(); row++; start = row;
    } else if (ch === '"') {
      if (closed || cell !== '') throw new CsvFormatError(`CSV 第 ${row} 行的引號位置不正確，整份檔未匯入。`);
      quoted = true;
    } else if (closed) {
      if (ch !== ' ' && ch !== '\t') throw new CsvFormatError(`CSV 第 ${row} 行的結束引號後有其他文字，整份檔未匯入。`);
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new CsvFormatError(`CSV 第 ${start} 行的引號尚未閉合，整份檔未匯入。`);
  endRecord();
  return records;
}

export function writeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map((value) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(',')).join('\r\n') + '\r\n';
}
