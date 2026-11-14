import type { LegacyImportData } from '../../src/ledger/index.ts';
import type { AccountKind } from '../../src/ledger/defaults.ts';
import type { RawCardStatement } from './legacyData.ts';
import { parseDate, text } from './plan.ts';
import { ConversionStopped } from './source.ts';

/** 舊表缺乏卡識別；只在唯一信用卡或使用者明確選卡後才帶入，不能按日期金額猜歸屬。 */
export async function planCardStatements(
  rows: readonly RawCardStatement[], kinds: ReadonlyMap<string, AccountKind>,
  chosen?: string, ask?: (question: string) => Promise<string>,
): Promise<NonNullable<LegacyImportData['cardStatements']>> {
  if (rows.length === 0) return [];
  const cards = [...kinds].filter(([, kind]) => kind === 'credit_card').map(([name]) => name);
  if (chosen === undefined && cards.length === 1) chosen = cards[0];
  if (chosen === undefined && ask && cards.length > 1) {
    chosen = (await ask(`舊信用卡明細沒有卡識別，這 ${rows.length} 筆全部屬於哪張卡？請填完整帳戶名稱：${cards.map((c) => `「${c}」`).join('、')}。若混有多張卡請停止，不要猜測。`)).trim();
  }
  if (chosen === undefined || !cards.includes(chosen)) {
    throw new ConversionStopped('舊信用卡明細沒有卡識別，無法自行分卡；請用 --card-account 名稱指定全部明細所屬的信用卡帳戶。若舊表混有多張卡，需先另案確認逐列歸屬，不能任意猜測。');
  }
  const account = chosen;
  return rows.map((row) => {
    const date = parseDate(row.date);
    const merchant = text(row.merchant);
    if (!date || !merchant || typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount < 0) {
      throw new ConversionStopped(`舊信用卡明細第 ${row.row} 列的日期、店家或金額不正確；已停止，不丟棄或修補來源列。`);
    }
    return { date, merchant, amount: row.amount, account };
  });
}
