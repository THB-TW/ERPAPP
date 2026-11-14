// 財務文件對應測試：讀進一份舊格式（C# System.Text.Json、PascalCase）文件再寫出，內容等價。
// 文件內容全部虛構；形狀與欄位照 BudgetState.cs。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BudgetDocumentError, parseBudgetDocument, serializeBudgetDocument } from './budgetDocument.ts';
import { position } from './budgetEngine.ts';

const revision = {
  Id: 'caps-1', Month: '2026-10',
  Limits: [{ CategoryId: 'study', Amount: 22983 }, { CategoryId: 'ai', Amount: 0 }],
  Mapping: { AI: 'ai', __proto__x: 'study' },
  Tuition: 15000, Reason: '虛構上限', Actor: 'someone', Time: '2026-10-01T09:30:00.1234567+08:00',
};
const legacyDocument = {
  Version: 7,
  Categories: [{ Id: 'study', Name: '學習深造', Kind: 'reserve' }, { Id: 'ai', Name: 'AI', Kind: 'reserve' }],
  Revisions: [revision],
  Months: [
    {
      Id: 'sep', Month: '2026-09', Income: 0, Surplus: 0, RawSpare: 49031, Tuition: 60000,
      Balances: { study: 145854 }, Changes: {}, Expenses: {}, Revision: null,
      Migrated: true, LegacyTotalDifference: 0, LegacyBalanceAnchor: 5, Time: '0001-01-01T00:00:00+00:00', Actor: '',
    },
    {
      Id: 'oct', Month: '2026-10', Income: 51058, Surplus: 13075, RawSpare: 62106, Tuition: 75000,
      Balances: { study: 149561, ai: 0 }, Changes: { study: 3707, ai: -3707 }, Expenses: { ai: 19276 }, Revision: revision,
      Migrated: false, LegacyTotalDifference: 0, LegacyBalanceAnchor: 0, Time: '2026-11-07T12:00:00+08:00', Actor: 'someone',
    },
  ],
  CloseHistory: [],
  Adjustments: [
    {
      Id: 'adj-1', Month: '2026-10', Kind: 'transfer', Amount: 6802, From: 'study', To: 'ai', Reason: '虛構挪用', Actor: 'someone',
      Time: '2026-11-08T08:00:00+08:00', Reverses: null,
      Changes: [{ Month: '2026-10', Field: 'reserve', CategoryId: 'ai', Before: 0, After: 6802 }, { Month: '2026-10', Field: 'spare', CategoryId: null, Before: 1, After: 2 }],
    },
    {
      Id: 'adj-2', Month: '2026-09', Kind: 'correct', Amount: -700, From: null, To: null, Reason: '虛構更正', Actor: 'someone',
      Time: '2026-11-08T09:00:00+08:00', Reverses: 'adj-0', Changes: [],
    },
  ],
  Receipts: [{ Id: 'adj-1', Fingerprint: 'ABCDEF0123', Action: 'transfer', Month: '2026-10', Reason: '虛構挪用', Actor: 'someone', Time: '2026-11-08T08:00:00+08:00' }],
  Checks: [{ Id: 'chk', Month: '2026-10', Time: '2026-11-09T00:00:00+08:00', Actor: 'x', Reason: '例行核對', Input: { Cash: 1, Bank: 2, Nested: [{ A: null }] }, Result: { Diff: 0, Rollbacks: [] }, Version: 3 }],
};

test('讀進舊格式文件再寫出，內容等價（含 null、時間字串、Checks 原樣）', () => {
  const state = parseBudgetDocument(JSON.stringify(legacyDocument));
  assert.deepEqual(JSON.parse(serializeBudgetDocument(state)), legacyDocument);
});

test('讀進的文件可直接給引擎計算', () => {
  const state = parseBudgetDocument(legacyDocument);
  assert.equal(state.version, 7);
  assert.equal(position(state, '2026-10').balances.ai, 6802);
  assert.equal(state.months[0].migrated, true);
  assert.equal(state.months[0].legacyBalanceAnchor, 5);
});

test('名稱叫 __proto__ 的分類歸屬與儲備也能無損往返', () => {
  const json = '{"Version":1,"Revisions":[{"Id":"r","Month":"2026-10","Mapping":{"__proto__":"a","constructor":"b"}}],"Months":[{"Id":"m","Month":"2026-09","Balances":{"__proto__":5}}]}';
  const state = parseBudgetDocument(json);
  assert.equal(Object.hasOwn(state.revisions[0].mapping, '__proto__'), true);
  const back = JSON.parse(serializeBudgetDocument(state));
  assert.equal(Object.hasOwn(back.Revisions[0].Mapping, '__proto__'), true);
  assert.equal(Object.hasOwn(back.Months[0].Balances, '__proto__'), true);
  assert.equal(position(state, '2026-09').reserve, 5);
});

test('缺少的屬性依預設值補上；型別不對或不是 JSON 則拒絕', () => {
  const state = parseBudgetDocument('{"Version":2}');
  assert.deepEqual(state.months, []);
  assert.deepEqual(state.checks, []);
  assert.throws(() => parseBudgetDocument('{"Version":"2"}'), BudgetDocumentError);
  assert.throws(() => parseBudgetDocument('{"Months":[{"RawSpare":1.5}]}'), BudgetDocumentError);
  assert.throws(() => parseBudgetDocument('不是 JSON'), BudgetDocumentError);
  assert.throws(() => parseBudgetDocument('[]'), BudgetDocumentError);
});
