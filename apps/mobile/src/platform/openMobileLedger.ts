// 手機端的接線：把 expo-sqlite 驅動接上帳本服務。這是唯一同時認識兩者的地方。
// 資料庫檔放在 expo-sqlite 的預設目錄（iOS 的 Documents/SQLite），會被 iCloud 裝置備份，
// 理由見 src/db/expoDriver.ts。匯入備份前的另存檔也放同一個資料夾（同樣會被裝置備份）。
import { deleteExpoDatabaseAt, expoDatabaseDirectory, openExpoDatabase, openExpoDatabaseAt } from '../db/expoDriver.ts';
import { openLedger, type Ledger } from '../ledger/index.ts';

const DATABASE_FILE = 'ledger.db';

export async function openMobileLedger(): Promise<Ledger> {
  return openLedger(await openExpoDatabase(DATABASE_FILE), {
    backupFiles: { directory: expoDatabaseDirectory(), open: openExpoDatabaseAt, remove: deleteExpoDatabaseAt },
  });
}
