import { effectiveRevision, openMonth } from './budgetEngine.ts';
import type { BudgetState } from './budgetTypes.ts';

/**
 * 舊文件的相容讀取：只補開放月份的零上限，不改已結快照或歷史定義。
 * 查詢不寫檔；下一次帳務指令與其他變更在同一交易保存補齊後的狀態。
 */
export function withFixedOther(state: BudgetState, fallbackMonth: string): BudgetState {
  if (!state.revisions.length && !state.months.length) return state;
  const month = openMonth(state, fallbackMonth);
  const current = effectiveRevision(state, month);
  const revision = current ?? { id: `other-default-${month}`, month, limits: [], mapping: {}, tuition: 0, reason: '固定其他分類：開放月份補齊', actor: 'app', time: '' };
  const activeOther = state.categories.find(c => c.name === '其他' && revision.limits.some(l => l.categoryId === c.id));
  if (activeOther?.kind === 'reserve') return state;
  let categories = state.categories;
  let other = categories.find(c => c.name === '其他' && c.kind === 'reserve');
  if (!other) {
    let id = 'app-other-reserve';
    while (categories.some(c => c.id === id)) id += '-next';
    other = { id, name: '其他', kind: 'reserve' };
    categories = [...categories, other];
  }
  const limits = revision.limits.filter(l => l.categoryId !== activeOther?.id);
  limits.push({ categoryId: other.id, amount: revision.limits.find(l => l.categoryId === activeOther?.id)?.amount ?? 0 });
  const mapping = { ...revision.mapping };
  if (activeOther) for (const key of Object.keys(mapping)) if (mapping[key] === activeOther.id) mapping[key] = other.id;
  if (!Object.hasOwn(mapping, '其他')) mapping['其他'] = other.id;
  if (current?.month === month) {
    const revisions = state.revisions.map(r => r === current ? { ...r, limits, mapping } : r);
    return { ...state, categories, revisions };
  }
  let id = `other-default-${month}-${state.version}`;
  while (state.revisions.some(r => r.id === id)) id += '-next';
  const added = { ...revision, id, month, limits, mapping, reason: '固定其他分類：開放月份補齊' };
  return { ...state, categories, revisions: [...state.revisions, added] };
}
