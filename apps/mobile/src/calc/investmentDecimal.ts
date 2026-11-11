// C# decimal：96 位元係數、最多 28 位小數；中間算術捨入至偶數，最終金額才遠離零。
export interface Decimal { n: bigint; scale: number }
const MAX = (1n << 96n) - 1n;
const abs = (n: bigint) => n < 0n ? -n : n;
const pow = (s: number) => 10n ** BigInt(s);
function quotient(n: bigint, d: bigint, away = false): bigint {
  const sign = (n < 0n) !== (d < 0n) ? -1n : 1n;
  const a = abs(n); const b = abs(d); const q = a / b; const r = a % b;
  return sign * (q + (r * 2n > b || (r * 2n === b && (away || q % 2n !== 0n)) ? 1n : 0n));
}
function fit(n: bigint, scale: number): Decimal {
  for (let s = Math.min(28, scale); s >= 0; s--) {
    const rounded = quotient(n, pow(scale - s));
    if (abs(rounded) <= MAX) return { n: rounded, scale: s };
  }
  throw new Error('投資計算超出十進位範圍。');
}
export function decimal(value: string | number): Decimal {
  const [whole, fraction = ''] = String(value).split('.');
  return fit(BigInt(`${whole}${fraction}`), fraction.length);
}
export function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return fit(a.n * pow(scale - a.scale) + b.n * pow(scale - b.scale), scale);
}
export function subtract(a: Decimal, b: Decimal): Decimal { return add(a, { ...b, n: -b.n }); }
export function multiply(a: Decimal, b: Decimal): Decimal { return fit(a.n * b.n, a.scale + b.scale); }
export function divide(a: Decimal, b: Decimal): Decimal {
  if (b.n === 0n) throw new Error('投資股數不可為零。');
  for (let scale = 28; scale >= 0; scale--) {
    const n = quotient(a.n * pow(b.scale + scale), b.n * pow(a.scale));
    if (abs(n) <= MAX) return { n, scale };
  }
  throw new Error('投資計算超出十進位範圍。');
}
export function compare(a: Decimal, b: Decimal): number {
  const scale = Math.max(a.scale, b.scale);
  const delta = a.n * pow(scale - a.scale) - b.n * pow(scale - b.scale);
  return delta === 0n ? 0 : delta < 0n ? -1 : 1;
}
export function rounded(a: Decimal): bigint { return quotient(a.n, pow(a.scale), true); }
export function decimalText(a: Decimal): string {
  const text = abs(a.n).toString().padStart(a.scale + 1, '0');
  const result = a.scale ? `${text.slice(0, -a.scale)}.${text.slice(-a.scale)}`.replace(/\.?0+$/, '') : text;
  return `${a.n < 0n ? '-' : ''}${result || '0'}`;
}

/** 舊 SQL decimal(18,4) 的輸入範圍；不接受科學記號，也不以浮點解析。 */
export function inputDecimal(value: unknown, label: string, allowZero = false): string {
  if (typeof value !== 'string' || !/^\d{1,14}(\.\d{1,4})?$/.test(value) || (!allowZero && decimal(value).n === 0n)) {
    throw new Error(`${label}必須是${allowZero ? '非負' : '正'}十進位數，最多 14 位整數及 4 位小數。`);
  }
  return decimalText(decimal(value));
}
export function safeInteger(n: bigint): number {
  const value = Number(n);
  if (!Number.isSafeInteger(value)) throw new Error('投資金額超出可安全計算的整數範圍。');
  return value;
}
