import { BIG5_INDEX_START, big5Characters } from './big5Table.ts';

export type CsvEncoding = 'auto' | 'utf-8' | 'big5';

const ENCODING_MESSAGE = 'CSV 的文字編碼不正確，請使用 UTF-8 或 Big5。';

/** 解碼器與字碼表隨 App 打包，不依賴 iPhone 的 TextDecoder 或 Node API。 */
export function decodeCsv(input: string | Uint8Array, encoding: CsvEncoding = 'auto'): string {
  if (typeof input === 'string') return withoutBom(input);
  let text: string;
  if (encoding === 'big5') {
    text = decodeBig5(input);
  } else if (encoding === 'utf-8') {
    text = decodeUtf8(input);
  } else {
    try {
      text = decodeUtf8(input);
    } catch {
      text = decodeBig5(input);
    }
  }
  return withoutBom(text);
}

/** 與 TextEncoder 一樣，孤立的 UTF-16 代理碼改成替代字元後輸出 UTF-8。 */
export function encodeCsv(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    let point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
    if (point <= 0x7f) {
      bytes.push(point);
    } else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function withoutBom(text: string): string {
  return text.startsWith('\ufeff') ? text.slice(1) : text;
}

function invalidEncoding(): never {
  throw new Error(ENCODING_MESSAGE);
}

function decodeUtf8(bytes: Uint8Array): string {
  const characters: string[] = [];
  for (let i = 0; i < bytes.length;) {
    const leading = bytes[i++];
    if (leading <= 0x7f) {
      characters.push(String.fromCharCode(leading));
      continue;
    }
    let trailingCount: number;
    let point: number;
    let minimum: number;
    if (leading >= 0xc2 && leading <= 0xdf) {
      trailingCount = 1; point = leading & 0x1f; minimum = 0x80;
    } else if (leading >= 0xe0 && leading <= 0xef) {
      trailingCount = 2; point = leading & 0x0f; minimum = 0x800;
    } else if (leading >= 0xf0 && leading <= 0xf4) {
      trailingCount = 3; point = leading & 0x07; minimum = 0x10000;
    } else {
      return invalidEncoding();
    }
    if (i + trailingCount > bytes.length) return invalidEncoding();
    for (let j = 0; j < trailingCount; j++) {
      const trailing = bytes[i++];
      if (trailing < 0x80 || trailing > 0xbf) return invalidEncoding();
      point = (point << 6) | (trailing & 0x3f);
    }
    // 拒絕過長編碼、代理碼與超過 Unicode 上限的值，不能用亂碼取代帳務欄位。
    if (point < minimum || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
      return invalidEncoding();
    }
    characters.push(String.fromCodePoint(point));
  }
  return characters.join('');
}

function decodeBig5(bytes: Uint8Array): string {
  const characters: string[] = [];
  for (let i = 0; i < bytes.length;) {
    const leading = bytes[i++];
    if (leading <= 0x7f) {
      characters.push(String.fromCharCode(leading));
      continue;
    }
    if (leading < 0x81 || leading > 0xfe || i >= bytes.length) return invalidEncoding();
    const trailing = bytes[i++];
    if (!((trailing >= 0x40 && trailing <= 0x7e) || (trailing >= 0xa1 && trailing <= 0xfe))) {
      return invalidEncoding();
    }
    const pointer = (leading - 0x81) * 157 + trailing - (trailing < 0x7f ? 0x40 : 0x62);
    // WHATWG Big5 的四個雙碼點特例不在單碼點索引內。
    if (pointer === 1133) { characters.push('\u00ca\u0304'); continue; }
    if (pointer === 1135) { characters.push('\u00ca\u030c'); continue; }
    if (pointer === 1164) { characters.push('\u00ea\u0304'); continue; }
    if (pointer === 1166) { characters.push('\u00ea\u030c'); continue; }
    const character = big5Characters[pointer - BIG5_INDEX_START];
    if (character === undefined || character === '\u0000') return invalidEncoding();
    characters.push(character);
  }
  return characters.join('');
}
