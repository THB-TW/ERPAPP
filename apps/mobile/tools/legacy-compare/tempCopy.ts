// 帳本檔的暫時副本（內含完整帳本，所以一定要刪掉）：正常結束與出錯由 run.ts 的 finally 刪；
// Ctrl-C（SIGINT）與被終止（SIGTERM）由這裡的處理器刪；被強制殺掉（SIGKILL、斷電）留下的，下次執行一開始會偵測並刪除。
import { lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';

export const TEMP_PREFIX = 'legacy-compare-tmp-';

/** 刪掉私人資料夾下上次被中斷留下的暫時副本資料夾，回傳被刪的名稱。 */
export function removeStaleTemps(privateRoot: string): string[] {
  const root = realpathSync(privateRoot);
  const removed: string[] = [];
  for (const name of readdirSync(root)) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const full = path.join(root, name);
    if (!lstatSync(full).isDirectory()) continue; // 符號連結或一般檔案不動
    rmSync(full, { recursive: true, force: true });
    removed.push(name);
  }
  return removed.sort();
}

/** 收到 SIGINT／SIGTERM 時先刪掉暫時副本資料夾再結束（結束代碼 128＋信號編號）。回傳解除處理器的函式。 */
export function guardTempDir(dir: string): () => void {
  const installed = ([['SIGINT', 130], ['SIGTERM', 143]] as const).map(([signal, code]) => {
    const handler = () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* 盡力而為 */ }
      process.exit(code);
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  return () => { for (const [signal, handler] of installed) process.off(signal, handler); };
}
