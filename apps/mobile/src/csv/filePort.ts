import { uuid } from 'expo';
import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

/** CSV 的原生檔案邊界；編碼判斷與帳務規則仍由帳本服務處理。 */
export interface CsvFile {
  name: string;
  bytes: Uint8Array;
}

export interface CsvFilePort {
  /** 使用者取消選檔時回傳 null。 */
  pickCsv(): Promise<CsvFile | null>;
  shareCsv(file: CsvFile): Promise<void>;
}

export class CsvFilePortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFilePortError';
  }
}

/** 只允許清理選檔器在 App 快取區產生的副本，原始檔不在清理範圍內。 */
function isCacheCopy(file: File): boolean {
  const cache = decodeURIComponent(Paths.cache.uri).replace(/\/+$/, '');
  return decodeURIComponent(file.uri).startsWith(`${cache}/`);
}

function exportName(name: string): string {
  const safe = name.replace(/[/\\\u0000-\u001f\u007f]/g, '-').trim();
  return safe && safe !== '.' && safe !== '..' ? (/\.csv$/i.test(safe) ? safe : `${safe}.csv`) : '交易.csv';
}

export const csvFilePort: CsvFilePort = {
  async pickCsv() {
    let copy: File | null = null;
    try {
      // 部分來源未標示 CSV MIME 類型，讓使用者選檔後再由帳本服務驗證內容。
      const picked = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || picked.assets.length === 0) return null;
      const asset = picked.assets[0];
      const selected = new File(asset.uri);
      if (!isCacheCopy(selected)) {
        throw new CsvFilePortError('無法取得 CSV 的暫存副本，請重新選檔，或貼上 CSV 內容匯入。');
      }
      copy = selected;
      // 不先轉成字串，保留 Big5 與 UTF-8 的原始位元組給帳本服務解碼。
      return { name: asset.name, bytes: await copy.bytes() };
    } catch (error: unknown) {
      if (error instanceof CsvFilePortError) throw error;
      throw new CsvFilePortError('無法讀取選取的 CSV，請確認檔案可用後再試，或貼上 CSV 內容匯入。');
    } finally {
      try {
        if (copy?.exists) copy.delete();
      } catch {
        throw new CsvFilePortError('無法清除選檔產生的 CSV 暫存副本，這次選檔未完成。');
      }
    }
  },
  async shareCsv(file) {
    let directory: Directory | null = null;
    let created = false;
    try {
      if (!(await isAvailableAsync())) {
        throw new CsvFilePortError('這台裝置目前無法開啟分享面板，請稍後再試。');
      }
      // 每次分享獨占自己的目錄，不覆寫既有 CSV，也不把交易放進帳本資料夾。
      directory = new Directory(Paths.cache, `csv-export-${uuid.v4()}`);
      directory.create();
      created = true;
      const temporary = new File(directory, exportName(file.name));
      temporary.create();
      await temporary.write(file.bytes);
      await shareAsync(temporary.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: '匯出交易 CSV' });
    } catch (error: unknown) {
      if (error instanceof CsvFilePortError) throw error;
      throw new CsvFilePortError('無法匯出或分享 CSV，請確認裝置儲存空間後再試。');
    } finally {
      try {
        // 分享面板關閉（含取消）或寫檔／分享失敗時，都清掉本次建立的唯一目錄。
        if (created && directory?.exists) directory.delete();
      } catch {
        throw new CsvFilePortError('無法清除這次匯出的 CSV 暫存檔，請檢查裝置儲存空間。');
      }
    }
  },
};
