// 票 15：僅用虛構資料，經帳本服務及真 SQLite 驗證 CSV 的外部行為。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { emptyBudgetState, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import { openLedger, type Ledger } from './index.ts';

const NOW = () => new Date('2026-11-10T16:30:00Z'); // 台北已是 11 日
const HEADER12 = '日期,類別,大類別,金額,幣別,成員,帳戶,標籤,備註,收支區分,上次更新,UUID';
async function fresh(t: { after(fn: () => Promise<void>): void }): Promise<Ledger> {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: NOW });
  t.after(() => ledger.close());
  return ledger;
}
const all = (ledger: Ledger) => ledger.listTransactions('0001-01-01', '9999-12-31');

function baseline() {
  return serializeBudgetDocument({
    ...emptyBudgetState(), version: 1,
    months: [{ id: 'baseline', month: '2026-10', income: 0, surplus: 0, rawSpare: 0, tuition: 0,
      balances: {}, changes: {}, expenses: {}, revision: null, migrated: true,
      legacyTotalDifference: 0, legacyBalanceAnchor: 0, time: '', actor: 'legacy' }],
  });
}

test('CSV 只需類別與金額，缺漏選填欄位預設今天、現金、支出、空白，依列計數', async (t) => {
  const ledger = await fresh(t);
  const result = await ledger.importTransactionsCsv('類別,金額\n飲食,80\n交通,20');
  assert.deepEqual([result.totalRows, result.addedRows, result.skippedRows, result.rejectedRows, result.defaultedRows], [2, 2, 0, 0, 2]);
  const rows = await all(ledger);
  assert.deepEqual(rows.map((r) => [r.date, r.accountName, r.flow, r.note, r.memberName]),
    [['2026-11-11', '現金', 'expense', '', null], ['2026-11-11', '現金', 'expense', '', null]]);
  assert.deepEqual(result.defaults[0].fields, ['日期', '帳戶', '收支別', '備註', '成員']);
});

test('CSV 選填欄位錯誤套預設；欄位可重排，分類可用別名，收入與備註保留', async (t) => {
  const ledger = await fresh(t);
  const result = await ledger.importTransactionsCsv('金額,分類,日期,帳戶,收支別,備註,成員\n100,飲食,2026-02-30,不存在,亂填,,陌生成員\n40000,薪資,2026/11/2,銀行,收入,薪水,');
  assert.equal(result.addedRows, 2);
  assert.equal(result.defaultedRows, 1);
  const rows = await all(ledger);
  assert.deepEqual(rows.map((r) => [r.date, r.accountName, r.flow, r.note, r.memberName]),
    [['2026-11-02', '銀行', 'income', '薪水', null], ['2026-11-11', '現金', 'expense', '', null]]);
  assert.deepEqual(await ledger.listMembers(), []);
});

test('CSV 未知分類逐列拒收並列名稱，金額無效及收支分類衝突分開回報，不建立分類', async (t) => {
  const ledger = await fresh(t);
  const before = await ledger.listCategories();
  const result = await ledger.importTransactionsCsv('類別,金額,收支\n陌生分類甲,10,支\n陌生分類乙,20,支\n飲食,不是數字,支\n飲食,-1,支\n飲食,0,支\n飲食,1.5,支\n飲食,9007199254740992,支\n飲食,10,收\n薪資,100,\n飲食,30,支');
  assert.deepEqual([result.addedRows, result.skippedRows, result.rejectedRows], [1, 0, 9]);
  assert.deepEqual(result.unknownCategories, ['陌生分類甲', '陌生分類乙']);
  assert.deepEqual(result.rejections.map((r) => r.code), ['unknown_category', 'unknown_category', 'invalid_amount', 'invalid_amount', 'invalid_amount', 'invalid_amount', 'invalid_amount', 'flow_mismatch', 'flow_mismatch']);
  assert.equal(result.rejections[0].row, 2);
  assert.match(result.rejections[0].message, /陌生分類甲/);
  assert.deepEqual(await ledger.listCategories(), before);
});

test('CSV 數量式去重保留同日同類別同額多筆，鍵不含帳戶、收支、成員或備註', async (t) => {
  const ledger = await fresh(t);
  const cats = await ledger.listCategories();
  const accounts = await ledger.listAccounts();
  await ledger.addTransaction({ date: '2026-11-01', categoryId: cats[0].id, accountId: accounts[0].id, flow: 'expense', amount: 80 });
  const csv = '日期,類別,金額,帳戶,收支,備註,成員\n2026-11-01,飲食,80,銀行,支,第一筆,\n2026-11-01,飲食,80,信用卡,支,第二筆,';
  const first = await ledger.importTransactionsCsv(csv);
  assert.deepEqual([first.addedRows, first.skippedRows, first.rejectedRows], [1, 1, 0]);
  const again = await ledger.importTransactionsCsv(csv);
  assert.deepEqual([again.addedRows, again.skippedRows, again.rejectedRows], [0, 2, 0]);
  assert.equal((await all(ledger)).length, 2);
  assert.equal((await all(ledger))[1].note, '第二筆');
});

test('CSV 支援 12 欄標題、舊日期形式、千分位與由右定位收支，未加引號的備註逗號容錯', async (t) => {
  const ledger = await fresh(t);
  const result = await ledger.importTransactionsCsv(`${HEADER12}\n2026/11/2,飲食,生活,"1,200",TWD,,銀行,,餐點,飲料,支,2026-11-03,id-a\n20261101,薪資,工作,+40000,TWD,,銀行,,薪水,收,2026-11-03,id-b`);
  assert.deepEqual([result.addedRows, result.rejectedRows, result.defaultedRows], [2, 0, 0]);
  const rows = await all(ledger);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.flow, r.note]), [['2026-11-01', 40000, 'income', '薪水'], ['2026-11-02', 1200, 'expense', '餐點,飲料']]);
});

test('CSV UTF-8 BOM、雙引號跳脫、多行備註與空白紀錄能解析，匯出再匯入不新增', async (t) => {
  const ledger = await fresh(t);
  await ledger.importTransactionsCsv('\uFEFF日期,類別,金額,帳戶,收支,備註,成員\r\n\r\n2026-11-02,飲食,90,現金,支,"餐點,\"\"加料\"\"\r\n第二行",\r\n');
  const before = await all(ledger);
  assert.equal(before[0].note, '餐點,"加料"\r\n第二行');
  const bytes = await ledger.exportTransactionsCsv();
  assert.ok(bytes instanceof Uint8Array);
  assert.match(new TextDecoder().decode(bytes), /日期,類別,金額,帳戶,收支別,備註,成員/);
  const result = await ledger.importTransactionsCsv(bytes);
  assert.deepEqual([result.addedRows, result.skippedRows, result.rejectedRows], [0, 1, 0]);
  assert.deepEqual(await all(ledger), before);
});

test('CSV Big5 自動與指定編碼都可解碼，不依賴環境的 Big5 解碼器', async (t) => {
  const ledger = await fresh(t);
  // 類別,金額\n飲食,80；公開字碼自行組成的假資料。
  const bytes = Uint8Array.from([0xc3,0xfe,0xa7,0x4f,44,0xaa,0xf7,0xc3,0x42,10,0xb6,0xbc,0xad,0xb9,44,56,48]);
  const decoder = globalThis.TextDecoder;
  const encoder = globalThis.TextEncoder;
  try {
    Object.assign(globalThis, { TextDecoder: undefined, TextEncoder: undefined });
    assert.equal((await ledger.importTransactionsCsv(bytes)).addedRows, 1);
    assert.equal((await ledger.importTransactionsCsv(bytes, { encoding: 'big5' })).skippedRows, 1);
    const exported = await ledger.exportTransactionsCsv();
    assert.equal((await ledger.importTransactionsCsv(exported, { encoding: 'utf-8' })).skippedRows, 1);
  } finally {
    Object.assign(globalThis, { TextDecoder: decoder, TextEncoder: encoder });
  }
});

test('CSV 畸形檔案整份拒絕且不寫入，缺少必要標題、重複標題、未閉合引號及壞編碼皆有說明', async (t) => {
  const ledger = await fresh(t);
  for (const csv of ['', '日期,金額\n2026-11-01,80', '類別,分類,金額\n飲食,飲食,80', '類別,金額,備註\n飲食,10,正常\n飲食,20,"未結束', '類別,金額\n飲"食,80']) {
    await assert.rejects(ledger.importTransactionsCsv(csv), /CSV|標題|引號|空白/);
    assert.deepEqual(await all(ledger), []);
  }
  await assert.rejects(ledger.importTransactionsCsv(Uint8Array.from([0xff]), { encoding: 'utf-8' }), /編碼|UTF/);
  await assert.rejects(ledger.importTransactionsCsv(Uint8Array.from([0x81]), { encoding: 'big5' }), /編碼|Big5/);
});

test('CSV 多餘欄位逐列拒收，缺少選填欄位仍套預設，空檔只有標題回報零筆', async (t) => {
  const ledger = await fresh(t);
  const result = await ledger.importTransactionsCsv('類別,金額,日期\n飲食,80\n飲食,10,2026-11-01,多一欄');
  assert.deepEqual([result.totalRows, result.addedRows, result.rejectedRows, result.defaultedRows], [2, 1, 1, 1]);
  assert.equal(result.rejections[0].code, 'invalid_row');
  assert.equal((await ledger.importTransactionsCsv('類別,金額\n')).totalRows, 0);
});

test('CSV 已結及期初基準月拒收，只新增開放列，月結快照與財務文件不改寫', async (t) => {
  const ledger = await fresh(t);
  await ledger.importFinanceDocument(baseline());
  const before = await ledger.exportFinanceDocument();
  const snapshot = await ledger.getBudgetMonth('2026-10');
  const result = await ledger.importTransactionsCsv('日期,類別,金額\n2026-10-20,飲食,80\n2026-11-01,飲食,90');
  assert.deepEqual([result.addedRows, result.rejectedRows], [1, 1]);
  assert.equal(result.rejections[0].code, 'month_closed');
  assert.equal(await ledger.exportFinanceDocument(), before);
  assert.deepEqual(await ledger.getBudgetMonth('2026-10'), snapshot);
  assert.equal((await all(ledger)).length, 1);
});

test('CSV 已存在已結交易回匯仍拒收，既有交易與匯出完整保留', async (t) => {
  const ledger = await fresh(t);
  await ledger.importTransactionsCsv('日期,類別,金額\n2026-10-20,飲食,80');
  await ledger.importFinanceDocument(baseline());
  const before = await all(ledger);
  const doc = await ledger.exportFinanceDocument();
  const bytes = await ledger.exportTransactionsCsv();
  const result = await ledger.importTransactionsCsv(bytes);
  assert.deepEqual([result.addedRows, result.skippedRows, result.rejectedRows], [0, 0, 1]);
  assert.equal(result.rejections[0].code, 'month_closed');
  assert.deepEqual(await all(ledger), before);
  assert.equal(await ledger.exportFinanceDocument(), doc);
});

test('CSV 匯入的收支會進入既有月結計算，重匯不改變收入與分類實支', async (t) => {
  const ledger = await fresh(t);
  await ledger.importFinanceDocument(baseline());
  const csv = '日期,類別,金額,收支\n2026-11-01,飲食,120,支\n2026-11-01,薪資,1000,收';
  await ledger.importTransactionsCsv(csv);
  await ledger.importTransactionsCsv(csv);
  const caps = await ledger.runBudgetCommand({ action: 'add', month: '2026-11', version: 1, operationId: randomUUID(), reason: '虛構上限',
    name: '飲食', kind: 'actual', amount: 0 });
  await ledger.runBudgetCommand({ action: 'close', month: '2026-11', version: caps.version, operationId: randomUUID(), reason: '虛構月結', amount: await ledger.getMonthIncome('2026-11') });
  const close = await ledger.getBudgetMonth('2026-11');
  assert.equal(close.income, 1000);
  assert.equal(close.surplus, 880);
  assert.equal(close.total, 880);
});

test('CSV 精確保留大小寫不同的分類、帳戶與成員，匯出回匯不錯配或增筆', async (t) => {
  const ledger = await fresh(t);
  await ledger.importLegacyLedger({
    openingDate: '2026-11-01', accounts: [{ name: 'Wallet', kind: 'cash', openingBalance: 0 }, { name: 'WALLET', kind: 'bank', openingBalance: 0 }],
    categories: [{ name: 'Food', flow: 'expense' }, { name: 'FOOD', flow: 'expense' }], members: ['A', 'a'], transactions: [], document: baseline(),
  });
  const csv = '日期,類別,金額,帳戶,收支別,備註,成員\n2026-11-01,Food,100,Wallet,支出,餐點,A\n2026-11-01,FOOD,200,WALLET,支出,車資,a';
  const result = await ledger.importTransactionsCsv(csv);
  assert.equal(result.addedRows, 2);
  assert.equal(result.defaultedRows, 0);
  assert.deepEqual((await all(ledger)).map((r) => [r.categoryName, r.accountName, r.memberName]), [['Food', 'Wallet', 'A'], ['FOOD', 'WALLET', 'a']]);
  const again = await ledger.importTransactionsCsv(await ledger.exportTransactionsCsv());
  assert.deepEqual([again.addedRows, again.skippedRows], [0, 2]);
});

test('CSV 沒有現金帳戶時只在實際新增需要預設帳戶的交易時補建，不為拒收或重複列建帳戶', async (t) => {
  const ledger = await fresh(t);
  await ledger.importLegacyLedger({ openingDate: '2026-11-01',
    accounts: [{ name: '銀行甲', kind: 'bank', openingBalance: 0 }], categories: [{ name: '餐飲', flow: 'expense' }],
    members: [], transactions: [], document: baseline() });
  const [category] = await ledger.listCategories();
  const [bank] = await ledger.listAccounts();
  await ledger.addTransaction({ date: '2026-11-11', categoryId: category.id, accountId: bank.id, flow: 'expense', amount: 80 });
  assert.equal((await ledger.importTransactionsCsv('類別,金額\n未知,1')).rejectedRows, 1);
  assert.equal((await ledger.listAccounts()).length, 1);
  assert.equal((await ledger.importTransactionsCsv('類別,金額\n餐飲,80')).skippedRows, 1);
  assert.equal((await ledger.listAccounts()).length, 1);
  assert.equal((await ledger.importTransactionsCsv('類別,金額\n餐飲,90\n餐飲,100')).addedRows, 2);
  assert.deepEqual((await ledger.listAccounts()).map((r) => [r.name, r.kind, r.openingBalance]), [['銀行甲', 'bank', 0], ['現金', 'cash', 0]]);
  assert.deepEqual((await all(ledger)).map((r) => r.accountName), ['銀行甲', '現金', '現金']);
});

test('CSV 補建現金帳戶遇到同名銀行時不覆寫既有帳戶', async (t) => {
  const ledger = await fresh(t);
  await ledger.importLegacyLedger({ openingDate: '2026-11-01',
    accounts: [{ name: '現金', kind: 'bank', openingBalance: 0 }], categories: [{ name: '餐飲', flow: 'expense' }],
    members: [], transactions: [], document: baseline() });
  const result = await ledger.importTransactionsCsv('類別,金額\n餐飲,90');
  assert.equal(result.addedRows, 1);
  const accounts = await ledger.listAccounts();
  assert.deepEqual(accounts.map((r) => [r.name, r.kind]), [['現金', 'bank'], ['現金（2）', 'cash']]);
  assert.equal((await all(ledger))[0].accountName, '現金（2）');
});

test('CSV UTF-8 匯出至另一個帳本保留 emoji、空白、引號與多行備註', async (t) => {
  const source = await fresh(t);
  const target = await fresh(t);
  const note = '  🧾,"加料"\r\n第二行 🥤  ';
  const [category] = await source.listCategories();
  const [account] = await source.listAccounts();
  await source.addTransaction({ date: '2026-11-01', categoryId: category.id, accountId: account.id, flow: 'expense', amount: 88, note });
  const exported = await source.exportTransactionsCsv();
  assert.deepEqual([...exported.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal((await target.importTransactionsCsv(exported, { encoding: 'utf-8' })).addedRows, 1);
  assert.deepEqual(await all(target), await all(source));
});

test('CSV Big5 擴充字與四個雙碼點特例在備註完整保留，UTF-8 回匯也相同', async (t) => {
  const ledger = await fresh(t);
  const pair = (pointer: number) => {
    const trail = pointer % 157;
    return [0x81 + Math.floor(pointer / 157), trail + (trail < 63 ? 0x40 : 0x62)];
  };
  // 類別,金額,備註\n飲食,81, 加上公開 Big5 指標對應的合成備註。
  const bytes = Uint8Array.from([0xc3,0xfe,0xa7,0x4f,44,0xaa,0xf7,0xc3,0x42,44,0xb3,0xc6,0xb5,0xf9,10,0xb6,0xbc,0xad,0xb9,44,56,49,44,
    ...pair(942), ...pair(1133), ...pair(1135), ...pair(1164), ...pair(1166)]);
  assert.equal((await ledger.importTransactionsCsv(bytes, { encoding: 'big5' })).addedRows, 1);
  assert.equal((await all(ledger))[0].note, '䏰\u00ca\u0304\u00ca\u030c\u00ea\u0304\u00ea\u030c');
  assert.equal((await ledger.importTransactionsCsv(await ledger.exportTransactionsCsv())).skippedRows, 1);
});

test('CSV 拒絕不合法 UTF-8（過長、孤立接續、代理碼、超出Unicode及截斷），不靜默取代', async (t) => {
  const ledger = await fresh(t);
  for (const bytes of [[0xc0, 0xaf], [0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe4, 0xb8]]) {
    await assert.rejects(ledger.importTransactionsCsv(Uint8Array.from(bytes), { encoding: 'utf-8' }), /編碼|UTF/);
  }
  assert.deepEqual(await all(ledger), []);
});

test('CSV 日期錯誤預設為今天之後仍受已結月份鎖定，改成明確開放日期才新增', async (t) => {
  const ledger = await fresh(t);
  const doc = baseline().replaceAll('2026-10', '2026-11');
  await ledger.importFinanceDocument(doc);
  const before = await ledger.exportFinanceDocument();
  const result = await ledger.importTransactionsCsv('日期,類別,金額\n不合法,飲食,10\n2026-12-01,飲食,20');
  assert.deepEqual([result.addedRows, result.rejectedRows, result.defaultedRows], [1, 1, 2]);
  assert.equal(result.rejections[0].code, 'month_closed');
  assert.equal(await ledger.exportFinanceDocument(), before);
});

test('CSV 名稱前後空白是既有名稱的一部分時精確保留，回匯不得錯配而重增', async (t) => {
  const ledger = await fresh(t);
  await ledger.importLegacyLedger({ openingDate: '2026-11-01',
    accounts: [{ name: ' 現金 ', kind: 'cash', openingBalance: 0 }, { name: '現金', kind: 'bank', openingBalance: 0 }],
    categories: [{ name: ' Food ', flow: 'expense' }, { name: 'Food', flow: 'expense' }], members: [' A ', 'A'], transactions: [], document: baseline() });
  const csv = '日期,類別,金額,帳戶,收支別,備註,成員\n2026-11-01, Food ,100, 現金 ,支出,餐點, A ';
  assert.equal((await ledger.importTransactionsCsv(csv)).addedRows, 1);
  assert.deepEqual((await all(ledger)).map((r) => [r.categoryName, r.accountName, r.memberName]), [[' Food ', ' 現金 ', ' A ']]);
  const result = await ledger.importTransactionsCsv(await ledger.exportTransactionsCsv());
  assert.deepEqual([result.addedRows, result.skippedRows], [0, 1]);
});
