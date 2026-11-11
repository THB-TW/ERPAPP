/** CSV 檔案邊界；票 16 合併後只需替換這個物件的實作。 */
export interface CsvFile {
  name: string;
  bytes: Uint8Array;
}

export interface CsvFilePort {
  /** 使用者取消選檔時回傳 null。 */
  pickCsv(): Promise<CsvFile | null>;
  shareCsv(file: CsvFile): Promise<void>;
}

export class CsvFilePortUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFilePortUnavailableError';
  }
}

export const csvFilePort: CsvFilePort = {
  async pickCsv() {
    throw new CsvFilePortUnavailableError('檔案選取尚未支援，請先貼上 CSV 內容匯入。');
  },
  async shareCsv() {
    throw new CsvFilePortUnavailableError('CSV 檔案分享尚未支援，請稍後再試。');
  },
};
