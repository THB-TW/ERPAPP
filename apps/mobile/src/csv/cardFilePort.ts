import { getDocumentAsync } from 'expo-document-picker';

export interface CardStatementFile { name: string; bytes: Uint8Array }

/** 原生平台接上已宣告的讀檔能力後，將選檔器提供的 URI 原樣交給這個邊界。 */
export interface CardStatementBytesReader {
  readBytes(uri: string): Promise<Uint8Array>;
}

export interface CardStatementFilePort {
  /** 使用者取消選檔時回傳 null。 */
  pickCsv(): Promise<CardStatementFile | null>;
}

export class CardStatementFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CardStatementFileError';
  }
}

/** 不使用未宣告的 expo-file-system，也不依賴 fetch(file://) 的平台差異。 */
export function createCardStatementFilePort(reader?: CardStatementBytesReader): CardStatementFilePort {
  return {
    async pickCsv() {
      try {
        // 沒有原生讀檔器時不建立包含私人帳單的快取副本；Web 可直接讀 picker 的 File。
        const result = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: false, multiple: false });
        if (result.canceled || result.assets.length === 0) return null;
        const asset = result.assets[0];
        const bytes = asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : reader ? await reader.readBytes(asset.uri) : null;
        if (bytes === null) {
          throw new CardStatementFileError('這個版本暫時無法讀取選取的檔案，請先在下方貼上 CSV 內容匯入。');
        }
        return { name: asset.name, bytes };
      } catch (error: unknown) {
        if (error instanceof CardStatementFileError) throw error;
        throw new CardStatementFileError('無法讀取選取的 CSV，請確認檔案可用後再試，或貼上 CSV 內容匯入。');
      }
    },
  };
}

// 目前套件清單未宣告原生位元組讀檔 API；接上 reader 前，iPhone 使用貼上內容備援。
export const cardStatementFilePort = createCardStatementFilePort();
