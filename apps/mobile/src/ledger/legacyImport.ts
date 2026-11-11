// 舊帳整批帶入（票 04）。只給轉換程式經由帳本服務使用；畫面不會呼叫。
// 整個過程在呼叫端給的同一個資料庫交易內，任何一處丟錯就整批還原。
import type { Queryable } from '../db/driver.ts';
import { isValidDate } from '../calc/dates.ts';
import { assertAccountKnown, assertCategoryFlow, assertTransactionShape } from './transactionRules.ts';
import { parseImportedDocument, replaceDocument } from './financeDocument.ts';
import { ACCOUNT_KINDS, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, type AccountKind, type Flow } from './defaults.ts';
import { LedgerError } from './errors.ts';
import { importLegacyCardStatements, type LegacyCardStatement } from './legacyCardStatements.ts';

export interface LegacyImportData {
  /** 開帳日：某月 1 號。所有帶入的帳戶共用（舊帳在搬遷截止月的下個月 1 號開帳）。 */
  openingDate: string;
  accounts: { name: string; kind: AccountKind; openingBalance: number }[];
  categories: { name: string; flow: Flow }[];
  members: string[];
  /** 依此順序寫入（交易編號隨之遞增）；合法重複列各自保留。 */
  transactions: {
    date: string;
    category: string;
    account: string;
    flow: Flow;
    amount: number;
    member: string | null;
  }[];
  /** 舊信用卡明細，原樣保留每列（含合法重複列）；必須明確指定所屬信用卡帳戶。 */
  cardStatements?: LegacyCardStatement[];
  /** 舊系統格式的財務文件（JSON 字串），經與 importFinanceDocument 相同的驗證後原樣帶入。 */
  document: string;
}

export interface LegacyImportResult {
  version: number;
  accounts: number;
  categories: number;
  members: number;
  transactions: number;
  incomeTotal: number;
  expenseTotal: number;
  cardStatements: number;
  cardStatementTotal: number;
  months: number;
  monthsWithLegacyDifference: number;
}

function bad(message: string): never {
  throw new LedgerError('invalid_legacy_import', `舊帳無法帶入：${message}`);
}

function uniqueIds(names: string[], what: string): Map<string, number> {
  const ids = new Map<string, number>();
  for (const name of names) {
    if (typeof name !== 'string' || name === '') bad(`${what}名稱不可為空。`);
    if (ids.has(name)) bad(`${what}名稱重複：${name}`);
    ids.set(name, ids.size + 1);
  }
  return ids;
}

async function assertEmptyLedger(tx: Queryable): Promise<void> {
  const notEmpty = () => {
    throw new LedgerError('ledger_not_empty', '舊帳只能帶入全新的帳本：目前已有交易、財務文件或自訂的分類、帳戶、成員。');
  };
  const counts = await tx.get<{ t: number; d: number; m: number; s: number; transfers: number; cards: number }>(
    `SELECT (SELECT COUNT(*) FROM transactions) AS t, (SELECT COUNT(*) FROM finance_document) AS d,
            (SELECT COUNT(*) FROM members) AS m, (SELECT COUNT(*) FROM settings) AS s,
            (SELECT COUNT(*) FROM transfers) AS transfers, (SELECT COUNT(*) FROM card_statements) AS cards`,
  );
  if (!counts || counts.t > 0 || counts.d > 0 || counts.m > 0 || counts.s > 0 || counts.transfers > 0 || counts.cards > 0) notEmpty();
  const accounts = await tx.all<{ name: string; kind: string; opening_balance: number; active: number }>(
    'SELECT name, kind, opening_balance, active FROM accounts ORDER BY sort_order',
  );
  const categories = await tx.all<{ name: string; flow: string }>('SELECT name, flow FROM categories ORDER BY sort_order');
  const sameAccounts = accounts.length === DEFAULT_ACCOUNTS.length &&
    accounts.every((a, i) => a.name === DEFAULT_ACCOUNTS[i].name && a.kind === DEFAULT_ACCOUNTS[i].kind && a.opening_balance === 0 && a.active === 1);
  const sameCategories = categories.length === DEFAULT_CATEGORIES.length &&
    categories.every((c, i) => c.name === DEFAULT_CATEGORIES[i].name && c.flow === DEFAULT_CATEGORIES[i].flow);
  if (!sameAccounts || !sameCategories) notEmpty();
}

export async function importLegacy(tx: Queryable, data: LegacyImportData): Promise<LegacyImportResult> {
  await assertEmptyLedger(tx);
  const state = parseImportedDocument(data.document); // 與 importFinanceDocument 同一套驗證

  if (!isValidDate(data.openingDate) || !data.openingDate.endsWith('-01')) bad('開帳日必須是某月 1 號（YYYY-MM-01）。');
  const accountIds = uniqueIds(data.accounts.map((a) => a.name), '帳戶');
  const categoryIds = uniqueIds(data.categories.map((c) => c.name), '分類');
  const memberIds = uniqueIds(data.members, '成員');
  for (const a of data.accounts) {
    if (!(ACCOUNT_KINDS as readonly string[]).includes(a.kind)) bad(`帳戶「${a.name}」的種類不認得：${String(a.kind)}`);
    if (!Number.isSafeInteger(a.openingBalance)) bad(`帳戶「${a.name}」的開帳餘額必須是整數（新台幣元）。`);
  }
  const flowOf = new Map<string, string>();
  for (const c of data.categories) {
    if (c.flow !== 'expense' && c.flow !== 'income') bad(`分類「${c.name}」的收支別不認得。`);
    flowOf.set(c.name, c.flow);
  }

  // 出廠預設的分類與帳戶沒有任何東西參照（上面已確認沒有交易），直接取代。
  await tx.run('DELETE FROM categories');
  await tx.run('DELETE FROM accounts');
  for (const [i, a] of data.accounts.entries()) {
    await tx.run('INSERT INTO accounts (id, name, kind, sort_order, opening_balance) VALUES (?, ?, ?, ?, ?)', [
      accountIds.get(a.name)!, a.name, a.kind, i, a.openingBalance,
    ]);
  }
  for (const [i, c] of data.categories.entries()) {
    await tx.run('INSERT INTO categories (id, name, flow, sort_order) VALUES (?, ?, ?, ?)', [categoryIds.get(c.name)!, c.name, c.flow, i]);
  }
  await tx.run("INSERT INTO settings (key, value) VALUES ('opening_date', ?)", [data.openingDate]);
  for (const [i, name] of data.members.entries()) {
    await tx.run('INSERT INTO members (id, name, sort_order) VALUES (?, ?, ?)', [memberIds.get(name)!, name, i]);
  }

  for (const [i, t] of data.transactions.entries()) {
    const where = `第 ${i + 1} 筆交易`;
    // 與 addTransaction 共用同一套規則（錯誤碼與訊息一致，前面加上是第幾筆）；不套用已結月份鎖定。
    const categoryId = categoryIds.get(t.category);
    const accountId = accountIds.get(t.account);
    try {
      assertTransactionShape(t);
      assertCategoryFlow(categoryId === undefined ? null : { flow: flowOf.get(t.category) as Flow }, t.flow);
      assertAccountKnown(accountId === undefined ? null : true);
    } catch (e) {
      if (e instanceof LedgerError) throw new LedgerError(e.code, `${where}：${e.message}`);
      throw e;
    }
    let memberId: number | null = null;
    if (t.member !== null) {
      const found = memberIds.get(t.member);
      if (found === undefined) throw new LedgerError('unknown_member', `${where}：找不到成員「${t.member}」。`);
      memberId = found;
    }
    await tx.run(
      'INSERT INTO transactions (date, category_id, account_id, flow, amount, note, member_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [t.date, categoryId!, accountId!, t.flow, t.amount, '', memberId],
    );
  }

  await importLegacyCardStatements(tx, data.cardStatements ?? []);
  await replaceDocument(tx, state);

  const sums = await tx.get<{ n: number; income: number; expense: number }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN flow = 'income' THEN amount END), 0) AS income,
            COALESCE(SUM(CASE WHEN flow = 'expense' THEN amount END), 0) AS expense
       FROM transactions`,
  );
  const cards = await tx.get<{ n: number; total: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM card_statements');
  return {
    version: state.version,
    accounts: data.accounts.length,
    categories: data.categories.length,
    members: data.members.length,
    transactions: sums!.n,
    incomeTotal: sums!.income,
    expenseTotal: sums!.expense,
    cardStatements: cards!.n,
    cardStatementTotal: cards!.total,
    months: state.months.length,
    monthsWithLegacyDifference: state.months.filter((m) => m.legacyTotalDifference !== 0).length,
  };
}
