// 帳本服務的預算測試：真的記憶體（或暫存檔）SQLite，只經由帳本服務下指令、查結果。
// 資料全部虛構。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetCommand, BudgetState, MonthClose } from '../calc/budgetTypes.ts';
import { BudgetRuleError, LedgerError, openLedger, type Ledger } from './index.ts';

const NOW = new Date('2026-11-07T04:00:00Z'); // 台北 2026-11-07 12:00

function closedMonth(p: Partial<MonthClose>): MonthClose {
  return {
    id: '', month: '', income: 0, surplus: 0, rawSpare: 0, tuition: 0, balances: {}, changes: {}, expenses: {}, revision: null,
    migrated: false, legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: '', ...p,
  };
}

// 虛構舊帳：2026-09 是期初基準（已結），開放月份是 2026-10。
function legacyState(): BudgetState {
  return {
    ...emptyBudgetState(),
    version: 4,
    categories: [
      { id: 'r-learn', name: '學習', kind: 'reserve' },
      { id: 'a-food', name: '飲食', kind: 'actual' },
      { id: 'f-other', name: '其他', kind: 'fixed' },
    ],
    revisions: [{
      id: 'caps-oct', month: '2026-10', tuition: 0,
      limits: [{ categoryId: 'r-learn', amount: 3000 }, { categoryId: 'a-food', amount: 0 }, { categoryId: 'f-other', amount: 0 }],
      mapping: { 學習: 'r-learn', 飲食: 'a-food', 其他: 'f-other', 交通: 'f-other' },
      reason: '虛構上限', actor: 'legacy', time: '2026-09-30T00:00:00+08:00',
    }],
    months: [closedMonth({ id: 'sep', month: '2026-09', rawSpare: 10000, tuition: 5000, balances: { 'r-learn': 1000 }, migrated: true })],
  };
}

async function newLedger(state: BudgetState | null = legacyState()): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  if (state) await ledger.importFinanceDocument(serializeBudgetDocument(state));
  return ledger;
}

const cmd = (p: Partial<BudgetCommand> & { action: string; month: string }): BudgetCommand =>
  ({ operationId: randomUUID(), version: 4, reason: '虛構原因', ...p });

async function ids(ledger: Ledger) {
  const categories = await ledger.listCategories();
  const accounts = await ledger.listAccounts();
  return {
    cat: (name: string) => categories.find((c) => c.name === name)!.id,
    bank: accounts.find((a) => a.name === '銀行')!.id,
  };
}
async function spend(ledger: Ledger, date: string, category: string, amount: number, flow: 'expense' | 'income' = 'expense') {
  const { cat, bank } = await ids(ledger);
  return ledger.addTransaction({ date, categoryId: cat(category), accountId: bank, flow, amount });
}

async function rejects(kind: string, promise: Promise<unknown>, message?: RegExp | string) {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof BudgetRuleError || e instanceof LedgerError, String(e));
    assert.equal((e as BudgetRuleError).kind ?? (e as LedgerError).code, kind);
    if (message) assert.match((e as Error).message, message instanceof RegExp ? message : new RegExp(message));
    return true;
  });
}

test('匯入舊財務文件後，可查某月位置、上限快照與月結列表', async () => {
  const ledger = await newLedger();
  const status = await ledger.getBudgetStatus();
  assert.equal(status.version, 4);
  assert.equal(status.latestMonth, '2026-09');
  assert.equal(status.openMonth, '2026-10');
  assert.equal(status.currentRevision!.id, 'caps-oct');
  assert.deepEqual(status.categories.map((c) => [c.name, c.active]), [['學習', true], ['飲食', true], ['其他', true]]);

  const sep = await ledger.getBudgetMonth('2026-09');
  assert.equal(sep.spare, 10000);
  assert.equal(sep.tuition, 5000);
  assert.equal(sep.reserve, 1000);
  assert.equal(sep.total, 16000);
  assert.deepEqual(sep.reserves.map((r) => [r.name, r.balance]), [['學習', 1000]]);
  assert.equal(sep.capSnapshot, null);

  const months = await ledger.listBudgetMonths();
  assert.deepEqual(months.map((m) => [m.month, m.total]), [['2026-09', 16000]]);
  await rejects('month_not_closed', ledger.getBudgetMonth('2026-10'));
  await rejects('invalid_month', ledger.getBudgetMonth('2026-1'));
});

test('預算指令的結果在關閉重開資料庫後仍在', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-test-'));
  try {
    const path = join(dir, 'ledger.db');
    const first = await openLedger(openNodeDatabase(path), { now: () => NOW });
    await first.importFinanceDocument(serializeBudgetDocument(legacyState()));
    const op = cmd({ action: 'correct', month: '2026-10', amount: -700 });
    const result = await first.runBudgetCommand(op);
    assert.deepEqual(result, { version: 5, replayed: false });
    await first.close();

    const second = await openLedger(openNodeDatabase(path), { now: () => NOW });
    assert.equal((await second.getBudgetStatus()).version, 5);
    const adjustments = await second.listBudgetAdjustments();
    assert.equal(adjustments.length, 1);
    assert.equal(adjustments[0].amount, -700);
    assert.equal(adjustments[0].month, '2026-09');
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('同一操作識別碼同內容重送不重做；內容不同被拒', async () => {
  const ledger = await newLedger();
  await spend(ledger, '2026-10-05', '飲食', 100);
  const fund = cmd({ action: 'close', month: '2026-10', amount: 20000 });
  const first = await ledger.runBudgetCommand(fund);
  assert.equal(first.replayed, false);
  const again = await ledger.runBudgetCommand(fund);
  assert.deepEqual(again, { version: first.version, replayed: true });
  assert.equal((await ledger.listBudgetMonths()).length, 2);
  await rejects('operation', ledger.runBudgetCommand({ ...fund, amount: 20001 }), /操作識別碼已用於其他內容/);
});

test('版本過期被拒，文件不變', async () => {
  const ledger = await newLedger();
  await rejects('operation', ledger.runBudgetCommand(cmd({ action: 'correct', month: '2026-10', amount: 1, version: 3 })), /資料已被其他操作更新/);
  assert.equal((await ledger.getBudgetStatus()).version, 4);
});

test('同時送出兩個同版本的指令：一個成功、一個因版本過期被拒', async () => {
  const ledger = await newLedger();
  const a = ledger.runBudgetCommand(cmd({ action: 'correct', month: '2026-10', amount: 1 }));
  const b = ledger.runBudgetCommand(cmd({ action: 'correct', month: '2026-10', amount: 2 }));
  const settled = await Promise.allSettled([a, b]);
  assert.deepEqual(settled.map((s) => s.status), ['fulfilled', 'rejected']);
  assert.equal((await ledger.listBudgetAdjustments()).length, 1);
});

test('原因必填 1 到 300 字；被拒的指令不留下任何痕跡', async () => {
  const ledger = await newLedger();
  await rejects('argument', ledger.runBudgetCommand(cmd({ action: 'correct', month: '2026-10', amount: 1, reason: '' })), /1～300/);
  await rejects('argument', ledger.runBudgetCommand(cmd({ action: 'correct', month: '2026-10', amount: 1, reason: 'x'.repeat(301) })), /1～300/);
  assert.equal((await ledger.getBudgetStatus()).version, 4);
});

test('月結從該月交易彙總實支（收入不算、依歸屬分到類別），收入由呼叫端傳入', async () => {
  const ledger = await newLedger();
  await spend(ledger, '2026-10-01', '飲食', 100);
  await spend(ledger, '2026-10-20', '飲食', 200);
  await spend(ledger, '2026-10-21', '學習', 1200);
  await spend(ledger, '2026-10-22', '交通', 50);
  await spend(ledger, '2026-10-25', '薪資', 40000, 'income');
  await spend(ledger, '2026-11-01', '飲食', 888); // 下個月不算
  assert.equal(await ledger.getMonthIncome('2026-10'), 40000);

  await ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 40000 }));
  const oct = await ledger.getBudgetMonth('2026-10');
  // 當月盈餘 ＝ 收入 40000 －（學習上限 3000 ＋ 飲食實支 300 ＋ 其他固定實支 50）
  assert.equal(oct.income, 40000);
  assert.equal(oct.surplus, 36650);
  assert.equal(oct.spare, 46650);
  assert.deepEqual(oct.reserves.map((r) => [r.name, r.balance]), [['學習', 2800]]);
  assert.equal(oct.reserve, 2800);
  assert.equal(oct.total, 46650 + 5000 + 2800);
  assert.equal(oct.capSnapshot!.id, 'caps-oct');
  assert.equal((await ledger.getBudgetStatus()).openMonth, '2026-11');
});

test('月結遇到沒有歸屬的支出分類就拒絕並指出分類，整筆不生效', async () => {
  const ledger = await newLedger();
  await spend(ledger, '2026-10-03', '娛樂', 500);
  assert.deepEqual(await ledger.getUnmappedExpenseCategories(), ['娛樂']);
  await rejects('operation', ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 40000 })), /分類「娛樂」尚未設定有效的預算歸屬/);
  assert.equal((await ledger.getBudgetStatus()).version, 4);
  assert.equal((await ledger.listBudgetMonths()).length, 1);

  // 補上歸屬後即可月結
  await ledger.runBudgetCommand(cmd({ action: 'map', month: '2026-10', sourceCategory: '娛樂', to: 'f-other' }));
  assert.deepEqual(await ledger.getUnmappedExpenseCategories(), []);
  await ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 40000, version: 5 }));
  assert.equal((await ledger.getBudgetMonth('2026-10')).surplus, 40000 - 3000 - 500);
});

test('已結月份的交易不能新增；撤銷月結後又可寫入；其他月份不受影響', async () => {
  const ledger = await newLedger();
  await spend(ledger, '2026-10-05', '飲食', 100);
  await ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 20000 }));

  await rejects('month_closed', spend(ledger, '2026-10-06', '飲食', 50), /已結月份/);
  await rejects('month_closed', spend(ledger, '2026-09-15', '飲食', 50), /已結月份/); // 期初基準月也是已結
  await spend(ledger, '2026-11-01', '飲食', 50); // 開放月份可寫
  assert.equal((await ledger.getDayTransactions('2026-10-06')).length, 0);

  await ledger.runBudgetCommand(cmd({ action: 'rollback', month: '2026-10', version: 5 }));
  await spend(ledger, '2026-10-06', '飲食', 50);
  assert.equal((await ledger.getDayTransactions('2026-10-06')).length, 1);
});

test('沒有期初基準的新帳本：月結照 C# 拒絕；設定上限後仍因缺期初基準被拒', async () => {
  const ledger = await newLedger(null);
  const status = await ledger.getBudgetStatus();
  assert.equal(status.version, 0);
  assert.equal(status.latestMonth, null);
  assert.equal(status.openMonth, '2026-11'); // 取目前時間所在的台北月份
  await rejects('operation', ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-11', amount: 1, version: 0 })), /請先設定本月預算上限/);
  await ledger.runBudgetCommand(cmd({ action: 'add', month: '2026-11', name: '旅遊', kind: 'reserve', amount: 1000, version: 0 }));
  await rejects('operation', ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-11', amount: 1, version: 1 })), /缺少期初基準/);
  // 沒有期初基準時沒有任何已結月份，所以任何日期都可記帳
  await spend(ledger, '2026-11-02', '飲食', 10);
});

test('新增與歸屬預算類別時，同名交易分類不存在就建立；已用於收入分類則拒絕', async () => {
  const ledger = await newLedger();
  await ledger.runBudgetCommand(cmd({ action: 'add', month: '2026-10', name: '旅遊', kind: 'reserve', amount: 500 }));
  const created = (await ledger.listCategories()).find((c) => c.name === '旅遊');
  assert.equal(created?.flow, 'expense');
  await spend(ledger, '2026-10-02', '旅遊', 80); // 立刻可以記帳

  await rejects('category_name_conflict', ledger.runBudgetCommand(cmd({ action: 'add', month: '2026-10', name: '薪資', kind: 'fixed', amount: 0, version: 5 })), /收入分類/);
  await rejects('category_name_conflict', ledger.runBudgetCommand(cmd({ action: 'map', month: '2026-10', sourceCategory: '其他收入', to: 'f-other', version: 5 })), /收入分類/);
  assert.equal((await ledger.getBudgetStatus()).version, 5);
});

test('調整列表標示沖銷與待重結；撤銷月結後調整保留、重結恰好一次', async () => {
  const ledger = await newLedger();
  await ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 20000 }));
  const afterClose = (await ledger.getBudgetMonth('2026-10')).spare;
  const fund = cmd({ action: 'fund', month: '2026-10', to: 'r-learn', amount: 2000, version: 5 });
  await ledger.runBudgetCommand(fund);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, afterClose - 2000);
  const [adj] = await ledger.listBudgetAdjustments();
  assert.deepEqual([adj.kind, adj.reversed, adj.pending], ['fund', false, false]);
  assert.ok(adj.changes.some((c) => c.field === 'spare' && c.before - c.after === 2000));

  await ledger.runBudgetCommand(cmd({ action: 'rollback', month: '2026-10', version: 6 }));
  assert.equal((await ledger.listBudgetAdjustments())[0].pending, true);
  await ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 20000, version: 7 }));
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, afterClose - 2000);

  await ledger.runBudgetCommand(cmd({ action: 'reverse', month: '2026-10', reverses: fund.operationId, version: 8 }));
  const list = await ledger.listBudgetAdjustments();
  assert.equal(list[0].reversed, true);
  assert.equal((await ledger.getBudgetMonth('2026-10')).spare, afterClose);
});

test('匯入入口：已有文件時須明確指定取代；格式錯誤被拒；匯出再匯入結果相同', async () => {
  const ledger = await newLedger();
  const text = serializeBudgetDocument(legacyState());
  await rejects('document_exists', ledger.importFinanceDocument(text), /取代/);
  await rejects('invalid_document', ledger.importFinanceDocument('{"Version":"x"}', { replace: true }));
  await rejects('invalid_document', ledger.importFinanceDocument('不是 JSON', { replace: true }));
  assert.equal((await ledger.getBudgetStatus()).version, 4);

  await ledger.runBudgetCommand(cmd({ action: 'close', month: '2026-10', amount: 20000 }));
  const exported = await ledger.exportFinanceDocument();
  const other = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  await other.importFinanceDocument(exported);
  assert.deepEqual(await other.getBudgetMonth('2026-10'), await ledger.getBudgetMonth('2026-10'));
  assert.deepEqual(await other.listBudgetMonths(), await ledger.listBudgetMonths());
  await ledger.importFinanceDocument(text, { replace: true });
  assert.equal((await ledger.listBudgetMonths()).length, 1);
});

test('匯入的文件內部不一致（合計溢位）被拒', async () => {
  const ledger = await newLedger(null);
  const bad = legacyState();
  bad.months[0].rawSpare = Number.MAX_SAFE_INTEGER;
  bad.months[0].tuition = 5;
  await rejects('invalid_document', ledger.importFinanceDocument(serializeBudgetDocument(bad)));
});
