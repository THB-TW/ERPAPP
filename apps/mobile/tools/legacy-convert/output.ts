// 輸出位置的把關：只能寫到私人位置（預設為 repo 內的 .private/）之下、不覆寫既有檔案、且必須被 Git 忽略。
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { defaultPrivateRoot, repositoryRoot } from '../../../../tools/lib/verify-export.mjs';

export class OutputPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutputPathError';
  }
}

function present(p: string): boolean {
  try {
    lstatSync(p); // 連壞掉的符號連結也算「已存在」
    return true;
  } catch {
    return false;
  }
}

/** 檢查輸出檔路徑，回傳解開符號連結後可安全寫入的絕對路徑。 */
export function assertPrivateOutput(outputPath: string, privateRoot: string = defaultPrivateRoot): string {
  if (!existsSync(privateRoot)) {
    throw new OutputPathError(`找不到私人資料夾 ${privateRoot}。請先在這個 repo 建立 .private/ 並把匯出放在裡面。`);
  }
  const resolved = path.resolve(outputPath);
  const parent = path.dirname(resolved);
  if (!existsSync(parent)) throw new OutputPathError(`輸出檔所在的資料夾不存在：${parent}。請先建立它（必須在 .private/ 之下）。`);
  const relative = path.relative(realpathSync(privateRoot), realpathSync(parent));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new OutputPathError(`輸出檔只能放在私人資料夾（${privateRoot}）之下，這個位置不行：${parent}`);
  }
  const final = path.join(realpathSync(parent), path.basename(resolved));
  if (!present(final) && present(`${final}.partial`)) {
    throw new OutputPathError(`上次轉換被中斷，留下暫存檔：${final}.partial。確認不需要後請刪除這個檔案，再重新執行。`);
  }
  if (present(final)) {
    throw new OutputPathError(`輸出檔已存在，工具不會覆寫：${final}。請換一個新檔名，或自行確認後刪除舊檔。`);
  }
  return final;
}

/** 輸出路徑必須被 Git 忽略（git check-ignore）；git 不可用或回報未忽略都視為不安全。 */
export function assertGitIgnored(file: string): void {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', file], { cwd: repositoryRoot, stdio: 'ignore' });
  } catch {
    throw new OutputPathError(`這個位置沒有被 Git 忽略（或無法確認）：${file}。私人資料不可放在會被提交的位置。`);
  }
}
