// 數量式去重只有這一份；來源負責鍵與排序，目的地負責既有筆數與寫入。
export interface ImportSource<Row> {
  rows: readonly Row[];
  key(row: Row): string;
}
export interface ImportDestination<Row> {
  existingCounts(): Promise<ReadonlyMap<string, number>>;
  write(row: Row): Promise<void>;
}

export async function runQuantityImport<Row>(source: ImportSource<Row>, destination: ImportDestination<Row>) {
  const existing = await destination.existingCounts();
  const seen = new Map<string, number>();
  let addedRows = 0;
  let skippedRows = 0;
  for (const row of source.rows) {
    const key = source.key(row);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count <= (existing.get(key) ?? 0)) skippedRows++;
    else { await destination.write(row); addedRows++; }
  }
  return { addedRows, skippedRows };
}
