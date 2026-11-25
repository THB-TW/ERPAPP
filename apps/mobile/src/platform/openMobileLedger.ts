// 手機端的接線：把 expo-sqlite 驅動接上帳本清單與帳本服務。這是唯一同時認識兩者的地方。
// 資料庫檔（library.db 與每本帳的檔）都放在 expo-sqlite 的預設目錄（iOS 的 Documents/SQLite），
// 會被 iCloud 裝置備份，理由見 src/db/expoDriver.ts。匯入暫存檔使用同一個資料夾。
import { File } from 'expo-file-system';
import { deleteExpoDatabaseAt, expoDatabaseDirectory, openExpoDatabaseAt } from '../db/expoDriver.ts';
import { openLedgerLibrary, type LedgerLibrary } from '../ledger/library.ts';
import { pathToFileUri } from '../ui/backupText.ts';

export function openMobileLibrary(): Promise<LedgerLibrary> {
  return openLedgerLibrary({
    files: {
      directory: expoDatabaseDirectory(),
      open: openExpoDatabaseAt,
      remove: deleteExpoDatabaseAt,
      readBytes: (path) => new File(pathToFileUri(path)).bytes(),
      async writeBytes(path, bytes) {
        const file = new File(pathToFileUri(path));
        if (file.exists) file.delete();
        file.create();
        file.write(bytes);
      },
    },
  });
}
