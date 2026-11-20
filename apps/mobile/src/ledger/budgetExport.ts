// 付費的「預算資料匯出」：把預算上限、各月月結、儲備餘額與貸款整理成一份可讀的 CSV。
// 只讀不寫。完整搬家（含全部預算資料）一律靠免費的備份檔，這份報表不是遷移管道。
import type { Queryable } from '../db/driver.ts';
import { encodeCsv } from '../csv/encoding.ts';
import { writeCsv } from '../csv/records.ts';
import { budgetFallbackMonth } from './budgetCommands.ts';
import { readStoredDocument } from './financeDocument.ts';
import { budgetMonth, budgetMonths, budgetStatus } from './budgetViews.ts';
import { loanViews } from './loans.ts';
import { LedgerError } from './errors.ts';

export interface BudgetExportRequest { hasEntitlement: boolean }

const HEADER = ['區段', '月份', '項目', '類型', '金額', '備註'];
const KIND: Record<string, string> = { reserve: '儲備', fixed: '固定支出', actual: '照實支' };
const kindLabel = (kind: string) => KIND[kind] ?? kind;

export async function exportBudgetCsv(q: Queryable, input: BudgetExportRequest, now: Date): Promise<Uint8Array> {
  if (input.hasEntitlement !== true) {
    throw new LedgerError('entitlement_required', '預算資料匯出是付費功能。備份檔（含全部預算資料）與交易 CSV 永遠免費。');
  }
  const { state } = await readStoredDocument(q);
  const fallback = await budgetFallbackMonth(q, now);
  const status = budgetStatus(state, fallback);
  const rows: string[][] = [HEADER];

  const names = new Map(state.categories.map((c) => [c.id, c]));
  for (const limit of status.currentRevision?.limits ?? []) {
    const definition = names.get(limit.categoryId);
    const kind = definition?.kind ?? '';
    rows.push(['預算上限', status.openMonth, definition?.name ?? limit.categoryId, kindLabel(kind),
      kind === 'actual' ? '' : String(limit.amount), '']);
  }

  for (const m of budgetMonths(state)) {
    const note = m.migrated ? '舊帳帶入' : '';
    for (const [label, value] of [['收入', m.income], ['當月盈餘', m.surplus], ['可用餘額', m.spare],
      ['學費儲備', m.tuition], ['總儲備金', m.reserve], ['帳面總資產', m.total]] as const) {
      rows.push(['月結', m.month, label, '', String(value), note]);
    }
  }

  const latest = status.latestMonth;
  const view = latest === null ? null : budgetMonth(state, latest, fallback);
  for (const r of view?.reserves ?? []) {
    rows.push(['儲備餘額', view!.month, r.name, kindLabel(r.kind), String(r.balance), r.active ? '' : '已停用']);
  }

  for (const loan of await loanViews(q, status.openMonth, state)) {
    const end = loan.expectedEndMonth ? `預計 ${loan.expectedEndMonth} 繳清` : '';
    rows.push(['貸款', status.openMonth, loan.name, '每月繳款', String(loan.monthlyPayment), end]);
    rows.push(['貸款', status.openMonth, loan.name, '總額', loan.totalAmount === null ? '' : String(loan.totalAmount), '']);
    rows.push(['貸款', status.openMonth, loan.name, '剩餘本金', loan.remainingPrincipal === null ? '' : String(loan.remainingPrincipal), '']);
    rows.push(['貸款', status.openMonth, loan.name, '已累積儲備', String(loan.reserve), '']);
  }

  return encodeCsv('﻿' + writeCsv(rows));
}
