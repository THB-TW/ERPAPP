// 備份檔進出手機的原生能力：系統分享面板（存到「檔案」、iCloud Drive、AirDrop）與選檔器。
// 畫面只認得這裡的函式；帳本服務只認得檔案路徑。
import { getDocumentAsync } from 'expo-document-picker';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { deleteExpoDatabaseAt, expoDatabaseDirectory } from '../db/expoDriver.ts';
import { backupFileName, fileUriToPath, pathToFileUri } from '../ui/backupText.ts';

/** 新備份檔的暫放路徑（與帳本同一個資料夾；分享完就刪）。 */
export function newBackupPath(now: Date): string {
  return `${expoDatabaseDirectory().replace(/\/+$/, '')}/${backupFileName(now)}`;
}

/** 開分享面板送出備份檔；使用者關掉面板後才結束。這台裝置不能分享時回傳 false。 */
export async function shareBackupFile(path: string): Promise<boolean> {
  if (!(await isAvailableAsync())) return false;
  await shareAsync(pathToFileUri(path), { dialogTitle: '匯出備份檔' });
  return true;
}

/** 讓使用者選一個備份檔；回傳複製進 App 暫存區後的路徑（原檔不會被動到），取消則為 null。 */
export async function pickBackupFile(): Promise<string | null> {
  const result = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || result.assets.length === 0) return null;
  return fileUriToPath(result.assets[0].uri);
}

/** 刪掉用完的暫存檔（分享完的匯出檔、匯入完的複本）。 */
export function discardBackupFile(path: string): Promise<void> {
  return deleteExpoDatabaseAt(path);
}
