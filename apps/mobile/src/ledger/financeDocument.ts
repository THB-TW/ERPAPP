// 財務文件的儲存：資料表 finance_document 一列（id=1），內容是舊系統格式的 JSON，欄位 version 與文件內的
// Version 一致。寫入用「版本相符才更新」的條件式更新（樂觀鎖），並與呼叫端的資料庫交易同一個。
import type { Queryable } from '../db/driver.ts';
import { emptyBudgetState, parseBudgetDocument, serializeBudgetDocument } from '../calc/budgetDocument.ts';
import type { BudgetState } from '../calc/budgetTypes.ts';
import { BudgetRuleError } from '../calc/budgetEngine.ts';

interface Row { version: number; document: string }

export async function readStoredDocument(q: Queryable): Promise<{ exists: boolean; state: BudgetState }> {
  const row = await q.get<Row>('SELECT version, document FROM finance_document WHERE id = 1');
  if (!row) return { exists: false, state: emptyBudgetState() };
  return { exists: true, state: parseBudgetDocument(row.document) };
}

export async function readState(q: Queryable): Promise<BudgetState> {
  return (await readStoredDocument(q)).state;
}

/** 寫入新狀態。exists 為 false 時新增那一列；否則要求資料庫裡的版本仍是 expectedVersion。 */
export async function writeState(q: Queryable, exists: boolean, expectedVersion: number, state: BudgetState): Promise<void> {
  const document = serializeBudgetDocument(state);
  if (!exists) {
    await q.run('INSERT INTO finance_document (id, version, document) VALUES (1, ?, ?)', [state.version, document]);
    return;
  }
  const result = await q.run('UPDATE finance_document SET version = ?, document = ? WHERE id = 1 AND version = ?', [
    state.version, document, expectedVersion,
  ]);
  if (result.changes !== 1) throw new BudgetRuleError('operation', '資料版本已改變，未套用本次操作。');
}

/** 直接取代整份文件（只給匯入入口用）。 */
export async function replaceDocument(q: Queryable, state: BudgetState): Promise<void> {
  await q.run(
    `INSERT INTO finance_document (id, version, document) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version, document = excluded.document`,
    [state.version, serializeBudgetDocument(state)],
  );
}
