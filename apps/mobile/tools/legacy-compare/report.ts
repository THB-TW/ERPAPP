// 報告與摘要的文字。完整報告含金額與名稱，只能寫到私人位置；摘要只有計數與結論，不含任何金額、分類名稱、帳戶名稱。
import type { BudgetComparison, Difference, TransactionComparison } from './compare.ts';
import { NOT_RECOMPUTABLE_TEXT, type NotRecomputableCode, type RecomputeMonth } from './recompute.ts';

export interface ReportContext {
  /** 執行日期（台北，YYYY-MM-DD）。 */
  date: string;
  tool: { commit: string | null; dirty: boolean | null };
  manifestSha256: string;
  sourceDatabase: string;
  sourceCommit: string;
  ledgerSha256: string;
  budget: BudgetComparison;
  transactions: TransactionComparison;
  /** 重算結果；重算本身出錯時是 { error }。 */
  recompute: { months: RecomputeMonth[] } | { error: string };
}

const yen = (n: number | string) => (typeof n === 'number' ? n.toLocaleString('en-US') : n);
const count = (n: number) => n.toLocaleString('en-US');

export function thresholdDifferences(ctx: ReportContext): Difference[] {
  return [...ctx.budget.differences, ...ctx.transactions.differences];
}

function legacyDifferenceVerdict(b: BudgetComparison) {
  const rows = b.legacyDifferenceMonths;
  const ledger = rows.filter((r) => r.ledger !== 0).length;
  const property = rows.filter((r) => (r.property ?? 0) !== 0).length;
  const document = rows.filter((r) => (r.document ?? 0) !== 0).length;
  const sameAmount = rows.every((r) => r.ledger === (r.property ?? r.document) && r.ledger === r.document);
  return { ledger, property, document, sameAmount };
}

function recomputeCounts(r: { months: RecomputeMonth[] }) {
  const byStatus = { match: 0, differs: 0, not_recomputable: 0 };
  const byCode: Partial<Record<NotRecomputableCode, number>> = {};
  for (const m of r.months) {
    byStatus[m.status] += 1;
    if (m.code) byCode[m.code] = (byCode[m.code] ?? 0) + 1;
  }
  return { total: r.months.length, ...byStatus, byCode };
}

const toolLine = (t: ReportContext['tool']) =>
  `legacy-compare，commit ${t.commit ?? '無法確認'}${t.dirty === null ? '' : t.dirty ? '（工作目錄有未提交的修改）' : '（工作目錄沒有未提交的修改）'}`;

/** 摘要：沒有任何金額、分類名稱、帳戶名稱。 */
export function buildSummary(ctx: ReportContext): string[] {
  const diffs = thresholdDifferences(ctx);
  const b = ctx.budget;
  const v = legacyDifferenceVerdict(b);
  const t = ctx.transactions;
  const lines = [
    '舊帳比對摘要（不含金額、分類與帳戶名稱）',
    `執行日期：${ctx.date}`,
    `工具：${toolLine(ctx.tool)}`,
    `來源：匯出清冊 SHA-256 ${ctx.manifestSha256}；資料庫 ${ctx.sourceDatabase}；舊系統程式 commit ${ctx.sourceCommit}`,
    `帳本檔：SHA-256 ${ctx.ledgerSha256}（比對前後相同，原檔未被改動）`,
    `結論：${diffs.length === 0 ? '門檻項目全部通過，0 差異' : `門檻項目未通過，共 ${count(diffs.length)} 項差異`}`,
    '',
    `一、逐月比對：${count(b.months.length)} 個月；比對 ${count(b.checks['Property 資料表'] + b.checks['budget 資料表'] + b.checks['BudgetCap 資料表'] + b.checks['來源財務文件'])} 個項目`
      + `（獨立舊表 ${count(b.checks['Property 資料表'] + b.checks['budget 資料表'] + b.checks['BudgetCap 資料表'])}、來源財務文件 ${count(b.checks['來源財務文件'])}）；差異 ${count(b.differences.length)} 項`,
    `  獨立舊表涵蓋：Property ${count(b.coverage.propertyMonths)} 個月；budget 逐月列 ${count(b.coverage.budgetRowMonths)} 個月；budget 累計列${b.coverage.cumulativeRowChecked ? '已比對' : '未比對'}；BudgetCap ${count(b.coverage.capRowMonths)} 個月`,
    `  只能與來源財務文件比對的月份數：當月盈餘 ${count(b.coverage.withoutBudgetRow.length)} 個、上限快照 ${count(b.coverage.withoutCapRow.length)} 個、資產欄位 ${count(b.coverage.withoutPropertyRow.length)} 個`,
    `  歷史總資產差異：Property 推得 ${count(v.property)} 個月、來源財務文件 ${count(v.document)} 個月、App ${count(v.ledger)} 個月有差異；每月同額：${v.sameAmount ? '是' : '否'}`,
    `二、交易：來源 ${count(t.sourceCount)} 筆、App ${count(t.appCount)} 筆（涵蓋 ${count(t.months)} 個月）；筆數與金額加總（總計、收入、支出、分月、分類、帳戶、逐筆）${t.differences.length === 0 ? '相同' : `有 ${count(t.differences.length)} 項差異`}`,
  ];
  if ('error' in ctx.recompute) {
    lines.push('三、重算報告（僅供參考，不影響結論）：重算過程發生錯誤，沒有結果（詳見完整報告）');
  } else {
    const r = recomputeCounts(ctx.recompute);
    const reasons = (Object.keys(NOT_RECOMPUTABLE_TEXT) as NotRecomputableCode[]).filter((k) => r.byCode[k]).map((k) => `${NOT_RECOMPUTABLE_TEXT[k]} ${r.byCode[k]} 個月`);
    lines.push(
      `三、重算報告（僅供參考，不影響結論；差異不代表 App 算錯）：共 ${count(r.total)} 個月，可重算 ${count(r.match + r.differs)} 個月，其中 ${count(r.differs)} 個月有差異；無法重算 ${count(r.not_recomputable)} 個月${reasons.length ? `（${reasons.join('；')}）` : ''}`,
    );
  }
  if (diffs.length > 0) {
    lines.push('', '門檻差異位置（只列月份或範圍與欄位類別，金額與名稱見完整報告）：');
    const places = new Map<string, number>();
    for (const d of diffs) places.set(`${d.scope}：${d.kind}`, (places.get(`${d.scope}：${d.kind}`) ?? 0) + 1);
    const entries = [...places].sort();
    for (const [place, n] of entries.slice(0, 60)) lines.push(`  ${place}（${count(n)} 項）`);
    if (entries.length > 60) lines.push(`  … 另有 ${count(entries.length - 60)} 組未列出`);
  }
  lines.push('', '請把這份摘要的內容回報；之後由我們放進 docs/legacy-acceptance/。');
  return lines;
}

const SOURCE_NOTES: [string, string, string][] = [
  ['當月收入', 'dbo.Property.own', '來源財務文件 Months[].Income'],
  ['當月盈餘', 'dbo.budget.gete（只有該月有 budget 列時）', '來源財務文件 Months[].Surplus'],
  ['可用餘額', 'dbo.Property.sparemoney', '文件原始可用餘額＋更正－補入（獨立算法）'],
  ['學費儲備', 'dbo.Property.tuitionfee', '來源財務文件 Months[].Tuition'],
  ['總儲備金', 'dbo.Property.budget', '文件各分類儲備合計（含補入、挪用）'],
  ['帳面總資產', 'dbo.Property.totalproperty', '可用餘額＋學費儲備＋總儲備金＋歷史差異'],
  ['歷史總資產差異', 'dbo.Property 的 總資產－可用餘額－學費儲備－總儲備金', '來源財務文件 Months[].LegacyTotalDifference'],
  ['各分類儲備', 'dbo.budget 1911-01-01 累計列（只有最近月份；新增類別併入「其他」）', '文件各月 Balances＋補入／挪用（所有月份）'],
  ['上限快照', 'dbo.BudgetCap（只有該月有自己的一列時）', '來源財務文件 Months[].Revision（所有月份）'],
  ['交易', '—（舊系統沒有交易的獨立副本）', '來源匯出 dbo.Transactions（筆數與金額）'],
];

function table(header: string[], rows: (string | number)[][]): string[] {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map((x) => String(x).replaceAll('|', '／')).join(' | ')} |`)];
}

const LIST_LIMIT = 500;

function differenceTable(diffs: Difference[]): string[] {
  if (diffs.length === 0) return ['沒有差異。'];
  const shown = diffs.slice(0, LIST_LIMIT);
  return [
    ...table(['月份／範圍', '欄位', '來源值', 'App 值', '比對來源'], shown.map((d) => [d.scope, d.field, yen(d.expected), yen(d.actual), d.source])),
    ...(diffs.length > LIST_LIMIT ? [``, `（另有 ${count(diffs.length - LIST_LIMIT)} 項未列出）`] : []),
  ];
}

/** 完整報告（含金額與名稱，只能放在私人位置）。 */
export function buildReport(ctx: ReportContext): string {
  const diffs = thresholdDifferences(ctx);
  const b = ctx.budget;
  const t = ctx.transactions;
  const out: string[] = [
    '# 舊帳比對完整報告',
    '',
    '**私人資料，含金額與名稱，不可放進 Git、雲端硬碟或任何公開位置。** 要回報請用另外產生的「摘要」。',
    '',
    `- 執行日期：${ctx.date}`,
    `- 工具：${toolLine(ctx.tool)}`,
    `- 來源：匯出清冊 SHA-256 ${ctx.manifestSha256}；資料庫 ${ctx.sourceDatabase}；舊系統程式 commit ${ctx.sourceCommit}`,
    `- 帳本檔 SHA-256：${ctx.ledgerSha256}（比對前後相同；比對只讀它的暫時副本，副本已刪除）`,
    '',
    '## 結論',
    '',
    diffs.length === 0 ? '**門檻項目全部通過，0 差異。**' : `**門檻項目未通過：共 ${count(diffs.length)} 項差異**（逐月 ${count(b.differences.length)} 項、交易 ${count(t.differences.length)} 項），見下方差異清單。`,
    '',
    '「重算報告」只供參考、不影響成功或失敗；**重算有差異不代表 App 算錯**（見第三節）。',
    '',
    '## 一、逐月門檻比對（容許誤差 0 元）',
    '',
    `共 ${count(b.months.length)} 個月（${b.months[0] ?? '-'} 至 ${b.months[b.months.length - 1] ?? '-'}）。每個欄位至多兩道比對：先對舊系統的獨立資料表，再對來源財務文件的原始值。`,
    '',
    '### 每個欄位用的來源',
    '',
    ...table(['欄位', '獨立舊表來源', '來源財務文件來源'], SOURCE_NOTES),
    '',
    `比對項目數：Property ${count(b.checks['Property 資料表'])}、budget ${count(b.checks['budget 資料表'])}、BudgetCap ${count(b.checks['BudgetCap 資料表'])}、來源財務文件 ${count(b.checks['來源財務文件'])}。`,
    '',
    '### 沒有獨立舊表來源的月份（改以來源財務文件的原始值比對；不補造缺的月份）',
    '',
    `- 舊 dbo.Property 有 ${count(b.coverage.propertyMonths)} 列；沒有列的月份：${b.coverage.withoutPropertyRow.join('、') || '無'}`,
    `- 舊 dbo.budget 逐月列 ${count(b.coverage.budgetRowMonths)} 列（當月盈餘的獨立來源）；沒有列的月份：${b.coverage.withoutBudgetRow.join('、') || '無'}`,
    `- 舊 dbo.budget 1911-01-01 累計列（最近月份各分類儲備的獨立來源）：${b.coverage.cumulativeRowChecked ? '已比對' : '沒有此列或沒有月份，未比對'}`,
    `- 舊 dbo.BudgetCap ${count(b.coverage.capRowMonths)} 列（上限快照的獨立來源）；來源財務文件裡的上限版本 ${count(b.coverage.documentRevisions)} 個；沒有自己那一列的月份：${b.coverage.withoutCapRow.join('、') || '無'}`,
    '',
    '### 歷史總資產差異（須同額重現）',
    '',
    ...(b.legacyDifferenceMonths.length === 0
      ? ['沒有任何月份有歷史總資產差異。']
      : [
          `有歷史差異的月份：${b.legacyDifferenceMonths.length} 個。`,
          '',
          ...table(['月份', 'App 查出', 'Property 推得', '來源財務文件'], b.legacyDifferenceMonths.map((r) => [r.month, yen(r.ledger), r.property === null ? '無 Property 列' : yen(r.property), r.document === null ? '—' : yen(r.document)])),
        ]),
    '',
    '### 逐月差異清單',
    '',
    ...differenceTable(b.differences),
    '',
    '## 二、交易比對',
    '',
    ...table(['收支別', '來源筆數', 'App 筆數', '來源加總', 'App 加總'], t.totals.map((x) => [x.flow === 'income' ? '收入' : '支出', count(x.sourceCount), count(x.appCount), yen(x.sourceSum), yen(x.appSum)])),
    '',
    `總計：來源 ${count(t.sourceCount)} 筆、App ${count(t.appCount)} 筆。另外比對了分月、分類（併回「原名（收入）」拆分）、帳戶與逐筆內容。`,
    '',
    ...differenceTable(t.differences),
    '',
    '## 三、重算報告（僅供參考，不影響成功或失敗）',
    '',
    '**重算有差異不代表 App 算錯。** 舊系統本身就明定舊月份不能用現在的交易重算：早期有手動調整，且只有部分月份留有上限紀錄。',
    '',
    '方法：逐月「單步重算」。每個月 M 都以存檔的前一個月當期初，套用 M 當時凍結的上限快照與分類歸屬，用現在帳本裡 M 的支出交易（依歸屬分配）與收入交易合計，呼叫 App 的月結引擎算出 M，再與存檔的 M 比對。不從最早的月份一路累積，是為了看得出差異出在哪個月。',
    '',
    '限制：',
    '- 最早的月份沒有前一個月可當期初；沒有上限快照的月份沒有當時的上限；有支出分類沒有歸屬的月份引擎會拒絕。這些標「無法重算」，不硬湊數字。',
    '- 前一個月有歷史總資產差異時，引擎本來拒絕往下月結；這裡把期初的差異當 0 帶入（只影響帳面總資產，所以重算不比對帳面總資產）。',
    '- 早期的手動調整（挪用、補入儲備、前期更正）不在月結裡，不會被重算出來；比對的是存檔的「原始月結」（不含調整）。',
    '- 用的是「現在的交易」，不是當時月結時的交易；之後補記、修改、刪除的交易都會造成差異。',
    '- 只比對月結會改動的欄位：當月收入、當月盈餘、原始可用餘額、學費儲備、各分類當月儲備變動與累計儲備。',
    '',
  ];
  if ('error' in ctx.recompute) {
    out.push(`重算過程發生錯誤，沒有結果（不影響門檻結論）：${ctx.recompute.error}`);
  } else {
    const r = recomputeCounts(ctx.recompute);
    out.push(
      `共 ${count(r.total)} 個月：一致 ${count(r.match)} 個月、有差異 ${count(r.differs)} 個月、無法重算 ${count(r.not_recomputable)} 個月。`,
      '',
      ...table(['月份', '結果', '說明'], ctx.recompute.months.map((m) => [m.month, m.status === 'match' ? '一致' : m.status === 'differs' ? `有 ${m.differences.length} 項差異` : '無法重算', m.detail ?? ''])),
    );
    const differing = ctx.recompute.months.filter((m) => m.status === 'differs');
    if (differing.length > 0) {
      out.push('', '### 有差異的月份明細', '');
      for (const m of differing) {
        out.push(`**${m.month}**`, '', ...table(['欄位', '存檔', '重算', '差（重算－存檔）'], m.differences.map((d) => [d.field, yen(d.stored), yen(d.recomputed), yen(d.recomputed - d.stored)])), '');
      }
    }
  }
  return out.join('\n') + '\n';
}
