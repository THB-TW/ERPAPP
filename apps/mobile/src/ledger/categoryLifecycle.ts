// 停用記於既有 settings，無須變更資料庫結構；歷史分類列與交易永遠保留。
import type { Queryable } from '../db/driver.ts';
import type { Category } from './index.ts';

const categoryStartKey = (id: number) => `category_start:${id}`;
const categoryStatusKey = (id: number, month: string) => `category_status:${id}:${month}`;

export async function categoryAvailability(q: Queryable, id: number, month: string): Promise<'active' | 'inactive' | 'not_started'> {
  const start = await q.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [categoryStartKey(id)]);
  if (start && start.value > month) return 'not_started';
  const status = await q.get<{ value: string }>(
    'SELECT value FROM settings WHERE key GLOB ? AND substr(key, -7) <= ? ORDER BY key DESC LIMIT 1', [`category_status:${id}:*`, month]);
  return status?.value === '0' ? 'inactive' : 'active';
}

export async function listActiveCategories(q: Queryable, month: string): Promise<Category[]> {
  return q.all<Category>(`SELECT c.id, c.name, c.flow FROM categories c
    WHERE COALESCE((SELECT value FROM settings s WHERE s.key GLOB 'category_status:' || c.id || ':*'
      AND substr(s.key, -7) <= ? ORDER BY s.key DESC LIMIT 1), '1') = '1'
      AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.key = 'category_start:' || c.id AND s.value > ?)
    ORDER BY c.sort_order`, [month, month]);
}

export async function setCategoryInactive(q: Queryable, id: number, month: string): Promise<void> {
  // 舊名稱可能仍是映射別名；已停用就不再加事件，也不抹掉先前月份的狀態。
  if (await categoryAvailability(q, id, month) === 'inactive') return;
  await q.run("INSERT INTO settings (key, value) VALUES (?, '0') ON CONFLICT(key) DO UPDATE SET value = '0'", [categoryStatusKey(id, month)]);
}

export async function ensureExpenseCategory(q: Queryable, name: string, month: string): Promise<number> {
  const existing = await q.get<{ id: number }>('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [name]);
  if (existing) {
    // 撤銷月結後，可明確把後來建立的分類提早啟用；之前的停用事件仍保留。
    await q.run('UPDATE settings SET value = MIN(value, ?) WHERE key = ?', [month, categoryStartKey(existing.id)]);
    if (await categoryAvailability(q, existing.id, month) !== 'active') {
      await q.run("INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", [categoryStatusKey(existing.id, month)]);
    }
    return existing.id;
  }
  const last = await q.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM categories');
  const id = (await q.run("INSERT INTO categories (name, flow, sort_order) VALUES (?, 'expense', ?)", [name, (last?.top ?? -1) + 1])).lastInsertRowId;
  await q.run('INSERT INTO settings (key, value) VALUES (?, ?)', [categoryStartKey(id), month]);
  await q.run("INSERT INTO settings (key, value) VALUES (?, '1')", [categoryStatusKey(id, month)]);
  return id;
}

/** 改名只搬動開放月以後的交易；舊交易仍連到原名稱，撤銷舊月後可以依當時歸屬重結。 */
export async function renameExpenseCategory(q: Queryable, oldName: string, newName: string, openMonth: string): Promise<void> {
  const old = await q.get<{ id: number }>("SELECT id FROM categories WHERE name = ? AND flow = 'expense'", [oldName]);
  const newId = await ensureExpenseCategory(q, newName, openMonth);
  if (!old || old.id === newId) return;
  await q.run('UPDATE transactions SET category_id = ? WHERE category_id = ? AND date >= ?', [newId, old.id, `${openMonth}-01`]);
  await setCategoryInactive(q, old.id, openMonth);
}
