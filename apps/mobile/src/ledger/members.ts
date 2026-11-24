// 成員（2026-11-24）：每筆交易一定有成員，預設「自己」。成員可在記帳畫面新增、改名、加圖示、停用；
// 用過的成員不能刪（只能停用），舊交易照樣顯示原名字。「自己」可改名與圖示，但不能停用或刪除。
import type { Queryable } from '../db/driver.ts';
import { LedgerError } from './errors.ts';
import { validIcon } from './icons.ts';

export interface Member { id: number; name: string; icon: string | null; active: boolean; isSelf: boolean }

interface MemberRow { id: number; name: string; icon: string | null; active: number; isSelf: number }

const COLUMNS = 'id, name, icon, active, is_self AS isSelf';
const toMember = (r: MemberRow): Member => ({ id: r.id, name: r.name, icon: r.icon, active: r.active === 1, isSelf: r.isSelf === 1 });

export const DEFAULT_MEMBER_NAME = '自己';

/** 取得「自己」的成員編號；帳本還沒有時才建立（排在最前面）。 */
export async function ensureSelfMember(q: Queryable): Promise<number> {
  const flagged = await q.get<{ id: number }>('SELECT id FROM members WHERE is_self = 1');
  if (flagged) return flagged.id;
  const named = await q.get<{ id: number }>('SELECT id FROM members WHERE name = ? COLLATE NOCASE', [DEFAULT_MEMBER_NAME]);
  if (named) {
    await q.run('UPDATE members SET is_self = 1, active = 1 WHERE id = ?', [named.id]);
    return named.id;
  }
  const first = await q.get<{ low: number | null }>('SELECT MIN(sort_order) AS low FROM members');
  return (await q.run('INSERT INTO members (name, sort_order, is_self) VALUES (?, ?, 1)', [DEFAULT_MEMBER_NAME, (first?.low ?? 1) - 1])).lastInsertRowId;
}

export async function listMembers(q: Queryable, includeInactive = false): Promise<Member[]> {
  await ensureSelfMember(q);
  const rows = await q.all<MemberRow>(`SELECT ${COLUMNS} FROM members ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, id`);
  return rows.map(toMember);
}

function validName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 30) throw new LedgerError('invalid_member_name', '成員名稱請填 1～30 字。');
  return name;
}

async function assertNameFree(q: Queryable, name: string, exceptId?: number): Promise<void> {
  const clash = await q.get<{ id: number }>('SELECT id FROM members WHERE name = ? COLLATE NOCASE', [name]);
  if (clash && clash.id !== exceptId) throw new LedgerError('member_name_conflict', '已有相同名稱的成員。');
}

export async function addMember(q: Queryable, input: { name: string; icon?: string | null }): Promise<Member> {
  await ensureSelfMember(q);
  const name = validName(input.name);
  const icon = validIcon(input.icon);
  await assertNameFree(q, name);
  const last = await q.get<{ top: number | null }>('SELECT MAX(sort_order) AS top FROM members');
  const id = (await q.run('INSERT INTO members (name, sort_order, icon) VALUES (?, ?, ?)', [name, (last?.top ?? -1) + 1, icon])).lastInsertRowId;
  return toMember((await q.get<MemberRow>(`SELECT ${COLUMNS} FROM members WHERE id = ?`, [id]))!);
}

async function existing(q: Queryable, id: number): Promise<Member> {
  const row = await q.get<MemberRow>(`SELECT ${COLUMNS} FROM members WHERE id = ?`, [id]);
  if (!row) throw new LedgerError('unknown_member', '找不到這位成員。');
  return toMember(row);
}

/** 改名與圖示；icon 傳 null 清掉圖示、不傳則不動。 */
export async function updateMember(q: Queryable, id: number, changes: { name?: string; icon?: string | null }): Promise<Member> {
  const current = await existing(q, id);
  const name = changes.name === undefined ? current.name : validName(changes.name);
  const icon = changes.icon === undefined ? current.icon : validIcon(changes.icon);
  await assertNameFree(q, name, id);
  await q.run('UPDATE members SET name = ?, icon = ? WHERE id = ?', [name, icon, id]);
  return existing(q, id);
}

export async function setMemberActive(q: Queryable, id: number, active: boolean): Promise<Member> {
  const current = await existing(q, id);
  if (current.isSelf && !active) throw new LedgerError('cannot_deactivate_self', '「自己」不能停用，可以改名。');
  await q.run('UPDATE members SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  return existing(q, id);
}

/** 沒有任何交易用過才能刪；用過的請改用停用。 */
export async function deleteMember(q: Queryable, id: number): Promise<void> {
  const current = await existing(q, id);
  if (current.isSelf) throw new LedgerError('cannot_deactivate_self', '「自己」不能刪除，可以改名。');
  const used = await q.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE member_id = ?', [id]);
  if ((used?.n ?? 0) > 0) throw new LedgerError('member_in_use', '這位成員已有交易紀錄，不能刪除，請改用停用。');
  await q.run('DELETE FROM members WHERE id = ?', [id]);
}
