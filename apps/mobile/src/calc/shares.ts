// 純計算：把一組金額換算成占比（明細頁的百分比與圓餅圖的弧長共用）。

/**
 * 用最大餘數法把 units 個單位依金額比例分給每一項，回傳的整數合計一定等於 units
 * （全部為 0 或空清單時全部回 0）。先各自無條件捨去，剩下的單位依餘數由大到小補 1，
 * 餘數相同時排在前面的先拿。金額必須是不小於 0 的整數；內部用 BigInt，不受浮點誤差影響。
 * 例：三項各 1 元、units = 1000（千分比）→ [334, 333, 333]。
 */
export function allocateShares(amounts: readonly number[], units: number): number[] {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error('單位數必須是不小於 0 的整數。');
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('金額必須是不小於 0 的整數。');
  }
  const total = amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
  if (total === 0n) return amounts.map(() => 0);

  const scale = BigInt(units);
  const shares = amounts.map((amount) => Number((BigInt(amount) * scale) / total));
  const remainders = amounts.map((amount) => (BigInt(amount) * scale) % total);
  const leftover = units - shares.reduce((sum, share) => sum + share, 0);
  const order = amounts
    .map((_, index) => index)
    .sort((a, b) => (remainders[a] === remainders[b] ? a - b : remainders[a] > remainders[b] ? -1 : 1));
  for (const index of order.slice(0, leftover)) shares[index] += 1;
  return shares;
}

export interface ShareItem {
  categoryId: number;
  categoryName: string;
  amount: number;
  permille: number;
}

export interface PieSlice {
  /** 單一分類為分類編號的字串；合併的那一片為 'rest'。 */
  key: string;
  name: string;
  amount: number;
  /** 千分比。合併片為其中各分類的合計，所以全部切片加起來仍是 1000。 */
  permille: number;
  categoryIds: number[];
}

export const REST_SLICE_KEY = 'rest';

/**
 * 圓餅圖切片：items 已依金額由大到小排好。分類太多時只留前 maxSlices 個，其餘合併成「其他分類」；
 * 只多出一個時不合併（合併成只含一個分類的「其他分類」沒有意義）。
 */
export function pieSlices(items: readonly ShareItem[], maxSlices: number): PieSlice[] {
  const single = (item: ShareItem): PieSlice => ({
    key: String(item.categoryId),
    name: item.categoryName,
    amount: item.amount,
    permille: item.permille,
    categoryIds: [item.categoryId],
  });
  if (items.length <= maxSlices + 1) return items.map(single);
  const rest = items.slice(maxSlices);
  return [
    ...items.slice(0, maxSlices).map(single),
    {
      key: REST_SLICE_KEY,
      name: '其他分類',
      amount: rest.reduce((sum, item) => sum + item.amount, 0),
      permille: rest.reduce((sum, item) => sum + item.permille, 0),
      categoryIds: rest.map((item) => item.categoryId),
    },
  ];
}
