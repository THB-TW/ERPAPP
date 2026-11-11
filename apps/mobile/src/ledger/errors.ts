export type LedgerErrorCode =
  | 'invalid_date'
  | 'invalid_month'
  | 'invalid_amount'
  | 'invalid_flow'
  | 'unknown_category'
  | 'unknown_account';

/** 帳本服務拒絕指令或查詢時丟出；message 是可直接顯示給使用者的繁體中文。 */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}
