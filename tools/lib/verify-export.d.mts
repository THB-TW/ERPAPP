export const repositoryRoot: string;
export const defaultPrivateRoot: string;
export function sha256(value: string | Uint8Array): string;
export function integerType(type: string): boolean;
export function insidePrivate(directory: string, privateRoot?: string): string;

export interface ExportColumn {
  schema: string;
  table: string;
  ordinal: number;
  name: string;
  type: string;
  nullable: boolean;
}
export type ExportValue = string | number | boolean | null;
export interface ExportTable {
  /** 例如 'dbo.Transactions'。 */
  source: string;
  sourceTable: string;
  name: string;
  columns: ExportColumn[];
  rows: Record<string, ExportValue>[];
  omittedColumns: string[];
}
export interface VerifiedExport {
  input: string;
  manifest: { formatVersion: number; sourceCommit?: string; sourceDatabase?: string; [key: string]: unknown };
  manifestSha256: string;
  schema: ExportColumn[];
  tables: ExportTable[];
}
export function verifyExport(exportDirectory: string, options?: { privateRoot?: string }): VerifiedExport;
