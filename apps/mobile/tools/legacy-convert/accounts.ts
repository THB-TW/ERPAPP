// 帳戶種類與開帳餘額。舊帳戶沒有種類；舊系統也沒有保存各帳戶的歷史餘額，只有核對紀錄留下當時填的實際餘額。
// 做法保守：能確定的才自動帶，其餘一律交給人輸入。
import type { AccountKind } from '../../src/ledger/defaults.ts';
import { daysInMonth } from '../../src/calc/dates.ts';
import type { RawCheck } from './legacyData.ts';

const KIND_BY_NAME: Record<string, AccountKind> = {
  現金: 'cash',
  銀行: 'bank',
  信用卡: 'credit_card',
  一卡通: 'e_wallet',
  電子支付: 'e_wallet',
};

/** 只認完全相同的常見名稱；猜不出為 null。 */
export function guessKind(name: string): AccountKind | null {
  return Object.hasOwn(KIND_BY_NAME, name) ? KIND_BY_NAME[name] : null;
}

/** 舊核對流程的欄位對應：只有現金與銀行會倒回月底後的交易（舊 BudgetWorkspace.Check）。 */
const CHECK_FIELD: Record<string, string> = { 現金: 'Cash', 銀行: 'Bank' };

export interface DerivedOpening {
  balances: Map<string, { amount: number; source: string }>;
  /** 為什麼沒有回推（給人看）。 */
  notes: string[];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

/**
 * 以最近一筆核對紀錄回推搬遷截止月月底的餘額：現金＝核對填的現金＋倒回調整，銀行同理。
 * 只有核對的月份正好是搬遷截止月、且已倒回（或餘額日期就是月底）時才回推；
 * 一卡通與信用卡舊系統不倒回、信用卡的正負號也無從確認，一律不回推。
 */
export function deriveOpeningBalances(checks: RawCheck[], cutoffMonth: string | null, accountNames: string[]): DerivedOpening {
  const out: DerivedOpening = { balances: new Map(), notes: [] };
  const wanted = accountNames.filter((n) => Object.hasOwn(CHECK_FIELD, n));
  if (wanted.length === 0) return out;
  if (checks.length === 0 || cutoffMonth === null) {
    out.notes.push('財務文件裡沒有可用的核對紀錄。');
    return out;
  }
  const time = (c: RawCheck) => (typeof c.Time === 'string' && !Number.isNaN(Date.parse(c.Time)) ? Date.parse(c.Time) : -Infinity);
  // 時間相同取較後面的一筆
  const latest = checks.reduce((best, c) => (time(c) >= time(best) ? c : best));
  const id = typeof latest.Id === 'string' ? latest.Id : '(無編號)';
  if (latest.Month !== cutoffMonth) {
    out.notes.push(`最近一筆核對（${id}）是 ${String(latest.Month)} 的核對，不是搬遷截止月 ${cutoffMonth}，不回推。`);
    return out;
  }
  const input = latest.Input;
  const result = latest.Result;
  if (!isObject(input) || !isObject(result)) {
    out.notes.push(`最近一筆核對（${id}）的格式不認得，不回推。`);
    return out;
  }
  const asOf = typeof input.AsOfDate === 'string' ? input.AsOfDate.slice(0, 10) : '';
  if (input.AutoRollback !== true && asOf !== lastDayOfMonth(cutoffMonth)) {
    out.notes.push(`最近一筆核對（${id}）沒有倒回月底後的交易、餘額日期也不是月底，不回推。`);
    return out;
  }
  const rollbacks = input.AutoRollback === true && Array.isArray(result.Rollbacks) ? result.Rollbacks : [];
  for (const name of wanted) {
    const entered = input[CHECK_FIELD[name]];
    const rollback = rollbacks.find((r) => isObject(r) && r.Account === name);
    const net = rollback === undefined ? 0 : isObject(rollback) ? rollback.Net : NaN;
    if (!isInt(entered) || !isInt(net)) {
      out.notes.push(`核對（${id}）的「${name}」數字不是整數，不回推。`);
      continue;
    }
    out.balances.set(name, { amount: entered + net, source: id });
  }
  return out;
}
