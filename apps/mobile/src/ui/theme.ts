export const colors = {
  background: '#ffffff',
  surface: '#f3f4f6',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  accent: '#2563eb',
  expense: '#dc2626',
  income: '#059669',
};

/** 圓餅圖切片的顏色（原型第五版的 c1–c8），依切片順序取用；最後一色給合併的「其他分類」。 */
export const chartColors = ['#16705a', '#d08a2e', '#3f6fb5', '#c2544b', '#7a5ea8', '#3c97a8', '#8a7a3a', '#7d8a86'];

/**
 * Apple 風格的分組畫面配色（試做中，目前只有預算頁與分頁列使用）：淺灰底＋白卡片，
 * 文字用 iOS 系統的主要／次要標籤色，強調色用 iOS 系統藍。確認方向後再推到其他畫面。
 */
export const grouped = {
  background: '#f2f2f7',
  card: '#ffffff',
  text: '#1d1d1f',
  secondary: '#6e6e73',
  separator: '#e5e5ea',
  track: '#ececf0',
  accent: '#007aff',
  expense: '#e5484d',
};

/** 預算各組的識別色：比原本的飽和度低，在白卡片上不搶金額的視線。 */
export const groupColors = {
  overview: '#8e8e93',
  reserve: '#5b7fd6',
  fixed: '#d99a2b',
  actual: '#34a37a',
  loan: '#9b7bd4',
};

/** Apple 字級（iOS 預設 Dynamic Type「大」）：大標題由原生導覽列負責，其餘照這張表。中文行高放鬆一點。 */
export const typeScale = {
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  title3: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' as const },
  subhead: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  footnote: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  /** 大金額：等寬數字，上下列對齊。 */
  amount: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
};
