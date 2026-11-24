// 記帳畫面的就地新增／修改分類（2026-11-24）：收入分類直接寫入；支出分類走既有的預算指令，
// 讓新分類同時進預算（預設「照實支」、上限 0、從開放月份起生效）。圖示另存在 categories.icon。
import type { Queryable } from '../db/driver.ts';
import type { Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { executeBudgetCommand, budgetFallbackMonth } from './budgetCommands.ts';
import { budgetStatus } from './budgetViews.ts';
import { readStoredDocument } from './financeDocument.ts';
import { validIcon } from './icons.ts';

export interface EntryCategory { id: number; name: string; flow: Flow; icon: string | null }

function newOperationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const v = Math.floor(Math.random() * 16);
    return (c === 'x' ? v : (v & 3) | 8).toString(16);
  });
}

const REASON = '記帳時新增或修改分類';

function validName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 30) throw new LedgerError('category_name_conflict', '分類名稱請填 1～30 字。');
  return name;
}

async function load(q: Queryable, id: number): Promise<EntryCategory> {
  const row = await q.get<EntryCategory>('SELECT id, name, flow, icon FROM categories WHERE id = ?', [id]);
  if (!row) throw new LedgerError('unknown_category', '找不到這個分類。');
  return row;
}

export async function addEntryCategory(q: Queryable, now: Date, input: { flow: Flow; name: string; icon?: string | null }): Promise<EntryCategory> {
  if (input.flow !== 'expense' && input.flow !== 'income') throw new LedgerError('invalid_flow', '收支別只能是支出或收入。');
  const name = validName(input.name);
  const icon = validIcon(input.icon);
  if (input.flow === 'income') {
    if (await q.get('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE', [name])) {
      throw new LedgerError('category_name_conflict', '已有相同的分類名稱，請使用現有分類或改名。');
    }
    const last = await q.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM categories');
    const id = (await q.run("INSERT INTO categories (name, flow, sort_order, icon) VALUES (?, 'income', ?, ?)", [name, (last?.top ?? -1) + 1, icon])).lastInsertRowId;
    return load(q, id);
  }
  if (await q.get('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE', [name])) {
    throw new LedgerError('category_name_conflict', '已有相同的分類名稱，請使用現有分類或改名。');
  }
  const fallback = await budgetFallbackMonth(q, now);
  const status = budgetStatus((await readStoredDocument(q)).state, fallback);
  await executeBudgetCommand(q, {
    action: 'add', operationId: newOperationId(), version: status.version, month: status.openMonth,
    reason: REASON, name, kind: 'actual', amount: 0,
  }, now);
  const row = await q.get<{ id: number }>("SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND flow = 'expense'", [name]);
  if (!row) throw new LedgerError('unknown_category', '新增分類失敗，請再試一次。');
  if (icon !== null) await q.run('UPDATE categories SET icon = ? WHERE id = ?', [icon, row.id]);
  return load(q, row.id);
}

/** 改名與圖示；icon 傳 null 清掉、不傳則不動。支出分類改名走預算的「編輯」指令，保留原本的預算組與上限。 */
export async function updateEntryCategory(q: Queryable, now: Date, id: number, changes: { name?: string; icon?: string | null }): Promise<EntryCategory> {
  const current = await load(q, id);
  const icon = changes.icon === undefined ? current.icon : validIcon(changes.icon);
  const name = changes.name === undefined ? current.name : validName(changes.name);
  if (name !== current.name) {
    const clash = await q.get<{ id: number }>('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [name]);
    if (clash && clash.id !== id) throw new LedgerError('category_name_conflict', '已有相同的分類名稱，請使用現有分類或改名。');
    const fallback = await budgetFallbackMonth(q, now);
    const state = (await readStoredDocument(q)).state;
    const status = budgetStatus(state, fallback);
    const budgetId = current.flow === 'expense' ? status.currentRevision?.mapping[current.name] : undefined;
    const budgetCategory = budgetId ? status.categories.find((c) => c.id === budgetId) : undefined;
    if (budgetCategory) {
      const cap = status.currentRevision!.limits.find((l) => l.categoryId === budgetCategory.id)?.amount ?? 0;
      await executeBudgetCommand(q, {
        action: 'edit', operationId: newOperationId(), version: status.version, month: status.openMonth,
        reason: REASON, from: budgetCategory.id, name, kind: budgetCategory.kind, amount: cap,
      }, now);
      // 預算改名會建立新名稱的分類並搬動開放月以後的交易（沿用舊分類的圖示）。
      const renamed = await q.get<{ id: number }>('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [name]);
      if (renamed) {
        await q.run('UPDATE categories SET icon = ? WHERE id = ?', [icon, renamed.id]);
        return load(q, renamed.id);
      }
    } else {
      await q.run('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
    }
  }
  await q.run('UPDATE categories SET icon = ? WHERE id = ?', [icon, id]);
  return load(q, id);
}
