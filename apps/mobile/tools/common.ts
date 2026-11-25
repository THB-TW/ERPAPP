// 轉換程式（legacy-convert）與比對工具（legacy-compare）共用的小工具：命令列骨架、千分位、安全寫檔。
import { chmodSync, existsSync, linkSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** 兩個命令列共用的結束代碼。2＝輸入驗證或位置問題；3＝（只有比對工具）門檻有差異；64＝用法錯誤。 */
export const EXIT = { ok: 0, failed: 1, stopped: 2, differences: 3, usage: 64 } as const;

export interface Io { out(line: string): void; err(line: string): void }
export const consoleIo: Io = { out: (l) => console.log(l), err: (l) => console.error(l) };

/** 這個模組是不是被直接執行（node cli.ts），而不是被測試匯入。 */
export function isMainModule(importMetaUrl: string): boolean {
  return Boolean(process.argv[1]) && fileURLToPath(importMetaUrl) === process.argv[1];
}

/** 千分位（en-US）；字串原樣。 */
export const thousands = (n: number | string): string => (typeof n === 'number' ? n.toLocaleString('en-US') : n);

export class OutputWriteError extends Error {
  /** 失敗之後仍然存在的檔案（先寫出的檔案已盡量收回；收不回的會列在這裡）。 */
  existing: string[];
  constructor(message: string, existing: string[]) {
    super(message);
    this.name = 'OutputWriteError';
    this.existing = existing;
  }
}

function tryUnlink(file: string): void {
  try { unlinkSync(file); } catch { /* 本來就不在 */ }
}

/**
 * 多個私人輸出檔一起寫：每個先寫到 <檔名>.partial，全部寫成功才一個一個改成正式檔名（不覆寫既有檔）。
 * 任何一步失敗，已經改名的與自己建立的暫存檔都收回；不是自己建立的檔案絕不動。失敗丟 OutputWriteError。
 */
export function writeNewFiles(files: { path: string; text: string }[]): void {
  const partials: string[] = [];
  const linked: string[] = [];
  try {
    for (const f of files) {
      const partial = `${f.path}.partial`;
      writeFileSync(partial, f.text, { flag: 'wx', mode: 0o600 }); // 已存在就失敗，不覆寫
      partials.push(partial);
      chmodSync(partial, 0o600);
    }
    for (const [i, f] of files.entries()) {
      linkSync(partials[i], f.path); // 目的檔若剛好出現就失敗，不覆寫
      linked.push(f.path);
    }
  } catch (e) {
    for (const f of linked) tryUnlink(f);
    for (const p of partials) tryUnlink(p);
    const existing = [...linked, ...partials].filter((f) => existsSync(f));
    throw new OutputWriteError(e instanceof Error ? e.message : String(e), existing);
  }
  for (const p of partials) tryUnlink(p);
}
