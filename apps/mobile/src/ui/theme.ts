// 全 App 共用配色（Apple「分組清單」風格）：淺灰底、白卡片、系統藍強調色。
// 2026-11-13 起由原本的白底灰卡片對調過來；畫面一律用這些名稱，不要直接寫色碼。
export const colors = {
  /** 畫面底色（淺灰）。 */
  background: '#f2f2f7',
  /** 卡片、清單列的底色（白）。 */
  surface: '#ffffff',
  /** 卡片「裡面」的填色：未選取的選項、輸入框、進度條軌道。 */
  fill: '#ececf0',
  text: '#1d1d1f',
  /** 次要文字（說明、註解）。 */
  muted: '#6e6e73',
  /** 分隔線與框線。 */
  border: '#e5e5ea',
  accent: '#007aff',
  /** 強調色的淡底：被選取的日期、提示區塊。 */
  accentSoft: '#e5f1ff',
  expense: '#dc3b40',
  income: '#12855a',
  /** 清單列右側的「›」。 */
  chevron: '#c7c7cc',
  warningBackground: '#fff4d6',
  warningText: '#8a5a00',
};

/** 圓餅圖切片的顏色（原型第五版的 c1–c8），依切片順序取用；最後一色給合併的「其他分類」。 */
export const chartColors = ['#16705a', '#d08a2e', '#3f6fb5', '#c2544b', '#7a5ea8', '#3c97a8', '#8a7a3a', '#7d8a86'];

/** 舊名稱（預算頁使用），與 colors 是同一組顏色；新程式請直接用 colors。 */
export const grouped = {
  background: colors.background,
  card: colors.surface,
  text: colors.text,
  secondary: colors.muted,
  separator: colors.border,
  track: colors.fill,
  accent: colors.accent,
  expense: colors.expense,
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
