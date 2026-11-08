import type { Bootstrap, Budget, CategoryBudget, Draft, Entry, HistoryMonth, SaveResult, SqlDatabase } from '../shared/types.js';

interface Definition { Id: string; Name: string; Kind: 'reserve' | 'fixed' | 'actual'; }
interface Revision { Month: string; Limits: { CategoryId: string; Amount: number }[]; Mapping: Record<string, string>; }
interface Closed { Month: string; RawSpare: number; Tuition: number; Balances: Record<string, number>; LegacyTotalDifference: number; Revision?: Revision; }
interface State { Categories: Definition[]; Revisions: Revision[]; Months: Closed[];
  Adjustments: { Month: string; Kind: string; Amount: number; From: string | null; To: string | null }[]; }
export class LedgerError extends Error { constructor(message: string, public status = 400) { super(message); } }

export function taipeiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
function validMonth(month: string) { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '1900-01' || month > '9998-12') throw new LedgerError('月份格式不正確。'); }
function nextMonth(month: string) { const [y, m] = month.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; }
function dateValid(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }

export class Ledger {
  constructor(private db: SqlDatabase, private owner: string) {}
  private async state(): Promise<State> {
    const row = await this.db.prepare('SELECT Document FROM app_workspaces WHERE owner_id=?').bind(this.owner).first<{ Document: string }>();
    if (!row) throw new LedgerError('找不到已驗證的財務基準。', 503);
    return JSON.parse(row.Document) as State;
  }
  private lastMonth(state: State) { return state.Months.map(month => month.Month).sort().at(-1) ?? ''; }
  private position(state: State, raw: Closed): HistoryMonth & { balances: Record<string, number> } {
    const balances = { ...raw.Balances }; let spare = raw.RawSpare;
    const closed = new Set(state.Months.map(month => month.Month));
    for (const adjustment of state.Adjustments.filter(item => item.Month <= raw.Month && closed.has(item.Month))) {
      if (adjustment.Kind === 'correct') spare += adjustment.Amount;
      else if (adjustment.Kind === 'fund') { spare -= adjustment.Amount; balances[adjustment.To!] = (balances[adjustment.To!] ?? 0) + adjustment.Amount; }
      else if (adjustment.Kind === 'transfer') {
        balances[adjustment.From!] = (balances[adjustment.From!] ?? 0) - adjustment.Amount;
        balances[adjustment.To!] = (balances[adjustment.To!] ?? 0) + adjustment.Amount;
      } else throw new LedgerError('有尚未支援的歷史調整，已停止試算。', 503);
    }
    const reserve = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return { month: raw.Month, spare, tuition: raw.Tuition, reserve, total: spare + raw.Tuition + reserve + raw.LegacyTotalDifference,
      difference: raw.LegacyTotalDifference, balances };
  }
  async budget(month: string): Promise<Budget> {
    validMonth(month);
    const state = await this.state();
    const frozen = state.Months.find(item => item.Month === month);
    const revision = frozen?.Revision ?? state.Revisions.filter(item => item.Month <= month).sort((a, b) => a.Month.localeCompare(b.Month)).at(-1);
    const grouped = (await this.db.prepare(`SELECT category,type,SUM(amount) AS amount,COUNT(*) AS count FROM app_transactions
      WHERE owner_id=? AND date>=? AND date<? AND deleted_at IS NULL GROUP BY category,type`).bind(this.owner, month + '-01', nextMonth(month) + '-01')
      .all<{ category: string; type: string; amount: number; count: number }>()).results;
    const prior = state.Months.filter(item => item.Month < month).sort((a, b) => a.Month.localeCompare(b.Month)).at(-1);
    const balances = prior ? this.position(state, prior).balances : {};
    const spentById = new Map<string, number>(); const unmapped = [];
    for (const group of grouped.filter(item => item.type === '支')) {
      const mapped = revision?.Mapping[group.category];
      if (!mapped || !revision?.Limits.some(limit => limit.CategoryId === mapped)) unmapped.push({ name: group.category, amount: group.amount });
      else spentById.set(mapped, (spentById.get(mapped) ?? 0) + group.amount);
    }
    const categories: CategoryBudget[] = (revision?.Limits ?? []).map(limit => {
      const definition = state.Categories.find(item => item.Id === limit.CategoryId);
      if (!definition) throw new LedgerError('預算類別資料不完整。', 503);
      const spent = spentById.get(definition.Id) ?? 0;
      return { id: definition.Id, name: definition.Name, kind: definition.Kind, cap: limit.Amount, spent,
        remaining: definition.Kind === 'actual' ? null : limit.Amount - spent,
        confirmedReserve: definition.Kind === 'reserve' ? balances[definition.Id] ?? 0 : null };
    });
    return { month, closed: !!frozen, categories, spent: grouped.filter(item => item.type === '支').reduce((sum, item) => sum + item.amount, 0),
      income: grouped.filter(item => item.type === '收').reduce((sum, item) => sum + item.amount, 0),
      transactionCount: grouped.reduce((sum, item) => sum + item.count, 0), unmapped, closedThrough: this.lastMonth(state), carried: revision?.Month !== month };
  }
  async bootstrap(month = taipeiToday().slice(0, 7)): Promise<Bootstrap> {
    const budget = await this.budget(month);
    const accounts = (await this.db.prepare('SELECT name FROM app_accounts WHERE owner_id=? ORDER BY sort_order,name').bind(this.owner).all<{ name: string }>()).results.map(row => row.name);
    const members = (await this.db.prepare('SELECT name FROM app_members WHERE owner_id=? ORDER BY sort_order,name').bind(this.owner).all<{ name: string }>()).results.map(row => row.name);
    const recent = await this.db.prepare('SELECT * FROM app_transactions WHERE owner_id=? AND deleted_at IS NULL AND type=? ORDER BY date DESC,created_at DESC,id DESC LIMIT 1').bind(this.owner, '支').first<Entry>();
    const incomeCategories = (await this.db.prepare("SELECT DISTINCT category FROM app_transactions WHERE owner_id=? AND type='收' ORDER BY category").bind(this.owner).all<{ category: string }>()).results.map(row => row.category);
    return { owner: this.owner, mode: 'local-preview', today: taipeiToday(), accounts, members, incomeCategories, budget,
      defaults: { account: recent?.account ?? accounts[0], member: recent?.member ?? members[0], category: recent?.category ?? budget.categories[0]?.name ?? '' } };
  }
  async entries(month: string, search = '', page = 0) {
    validMonth(month);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000 || search.length > 100) throw new LedgerError('查詢條件不正確。');
    const like = '%' + search.replace(/[!%_]/g, char => '!' + char) + '%';
    const rows = (await this.db.prepare(`SELECT id,date,category,amount,account,member,type,note,source FROM app_transactions
      WHERE owner_id=? AND date>=? AND date<? AND deleted_at IS NULL AND (category LIKE ? ESCAPE '!' OR note LIKE ? ESCAPE '!' OR account LIKE ? ESCAPE '!')
      ORDER BY date DESC,created_at DESC,id DESC LIMIT 51 OFFSET ?`).bind(this.owner, month + '-01', nextMonth(month) + '-01', like, like, like, page * 50).all<Entry>()).results;
    return { entries: rows.slice(0, 50), more: rows.length > 50, page };
  }
  async save(input: Draft): Promise<SaveResult> {
    if (!input || typeof input !== 'object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId ?? '')) throw new LedgerError('操作識別碼不正確，請重新儲存。');
    if (typeof input.date !== 'string' || !dateValid(input.date) || input.date < '1900-01-01' || input.date > '9998-12-31') throw new LedgerError('請選擇有效日期。');
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000) throw new LedgerError('金額須為 1 至 1,000,000,000 的整數。');
    if (input.type !== '支' && input.type !== '收') throw new LedgerError('請選擇支出或收入。');
    for (const [key, max] of [['category', 50], ['account', 50], ['member', 50], ['note', 300]] as const) {
      if (typeof input[key] !== 'string' || input[key].length > max || (key !== 'note' && !input[key].trim())) throw new LedgerError('分類、帳戶、成員或備註不正確。');
    }
    const clean = { date: input.date, category: input.category.trim(), amount: input.amount, account: input.account.trim(), member: input.member.trim(), type: input.type, note: input.note.trim() };
    const fingerprint = JSON.stringify(clean);
    const existing = await this.db.prepare('SELECT id,date,category,amount,account,member,type,note,source,fingerprint FROM app_transactions WHERE owner_id=? AND id=?').bind(this.owner, input.operationId).first<Entry & { fingerprint: string }>();
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new LedgerError('同一筆待送記帳的內容已改變，請檢查後再送。', 409);
      return { entry: existing, replay: true, budget: await this.budget(input.date.slice(0, 7)) };
    }
    const configuration = await this.bootstrap(input.date.slice(0, 7));
    if (configuration.budget.closedThrough && input.date < nextMonth(configuration.budget.closedThrough) + '-01') throw new LedgerError('這個月份已月結，請先在原平台撤銷對應月結。', 409);
    const categories = input.type === '支' ? configuration.budget.categories.map(item => item.name) : configuration.incomeCategories;
    if (!categories.includes(clean.category) || !configuration.accounts.includes(clean.account) || !configuration.members.includes(clean.member)) throw new LedgerError('請選擇帳本中有效的分類、帳戶與成員。');
    const result = await this.db.prepare(`INSERT INTO app_transactions (owner_id,id,date,category,amount,account,member,type,note,source,fingerprint,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,id) DO NOTHING`).bind(this.owner, input.operationId, clean.date, clean.category, clean.amount,
      clean.account, clean.member, clean.type, clean.note, 'preview', fingerprint, new Date().toISOString()).run();
    const stored = await this.db.prepare('SELECT id,date,category,amount,account,member,type,note,source,fingerprint FROM app_transactions WHERE owner_id=? AND id=?').bind(this.owner, input.operationId).first<Entry & { fingerprint: string }>();
    if (!stored || stored.fingerprint !== fingerprint) throw new LedgerError('此操作識別碼已用於不同內容。', 409);
    return { entry: stored, replay: result.meta.changes === 0, budget: await this.budget(input.date.slice(0, 7)) };
  }
  async history(): Promise<{ months: HistoryMonth[]; closedThrough: string }> {
    const state = await this.state();
    return { months: state.Months.map(raw => this.position(state, raw)).sort((a, b) => b.month.localeCompare(a.month)), closedThrough: this.lastMonth(state) };
  }
}
