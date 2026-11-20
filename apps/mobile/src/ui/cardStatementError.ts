import { CardStatementMismatchError, CsvFormatError } from '../ledger/index.ts';
import { closeErrorMessage } from './MonthlyCloseSummary.tsx';

/** 只顯示服務提供的安全訊息；未知原生錯誤仍使用共用的一般提示。 */
export function cardStatementErrorMessage(error: unknown): string {
  return error instanceof CardStatementMismatchError || error instanceof CsvFormatError
    ? error.message : closeErrorMessage(error);
}
