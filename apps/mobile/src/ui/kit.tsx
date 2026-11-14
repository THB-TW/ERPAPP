import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { colors, typeScale } from './theme.ts';

// 全 App 共用的畫面零件（Apple「分組清單」風格）：淺灰底、白色圓角卡片、卡片外放小字說明。
// 畫面只組合這裡的零件與 kit／text 樣式，不要各自寫色碼、字級或圓角，整個 App 才會一致。
//
// 版面規則：
// - 畫面最外層是 ScrollView，style={kit.screen}、contentContainerStyle={kit.content}、
//   contentInsetAdjustmentBehavior="automatic"（原生大標題才會收合、內容不被分頁列蓋住）。
// - 內容由上到下是一個個「區段」（<View style={kit.section}>）：區段標題 → 卡片 → 卡片外的小字說明。
// - 一張卡片只放一類東西。多列資料用 <Group>（列與列之間自動加細分隔線），不要每列各一張卡片。
// - 卡片「裡面」需要底色的東西（未選取的選項、輸入框、進度條軌道）用 colors.fill，不要用白色或畫面底色。

/** 文字樣式：照 Apple 字級，一律含顏色。金額與會上下對齊的數字用 value／amount（等寬數字）。 */
export const text = StyleSheet.create({
  /** 區段標題。 */
  title: { ...typeScale.title3, color: colors.text },
  /** 列的主要文字（粗）。 */
  headline: { ...typeScale.headline, color: colors.text },
  body: { ...typeScale.body, color: colors.text },
  bodyMuted: { ...typeScale.body, color: colors.muted },
  subhead: { ...typeScale.subhead, color: colors.text },
  subheadMuted: { ...typeScale.subhead, color: colors.muted },
  /** 說明、註解。 */
  footnote: { ...typeScale.footnote, color: colors.muted },
  caption: { ...typeScale.caption, color: colors.muted },
  /** 列右側的數字。 */
  value: { ...typeScale.body, color: colors.text, fontVariant: ['tabular-nums'] },
  /** 卡片裡的大金額。 */
  amount: { ...typeScale.amount, color: colors.text },
  link: { ...typeScale.body, color: colors.accent },
  error: { ...typeScale.subhead, color: colors.expense },
});

export const kit = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 24 },
  section: { gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden' },
  cardPadding: { padding: 16, gap: 12 },
  /** 清單列：左右 16、最小高度 48（手指好點）。 */
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  pressed: { backgroundColor: colors.fill },
  /** 卡片外的小字要和卡片內文字的左緣對齊感一致，左右各縮 4。 */
  outsideText: { paddingHorizontal: 4 },
  /** 卡片裡的單行輸入框。 */
  input: { ...typeScale.body, color: colors.text, backgroundColor: colors.fill, borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 10 },
  progressTrack: { height: 6, backgroundColor: colors.fill, borderRadius: 3, overflow: 'hidden' },
});

/** 白色圓角卡片。padded（預設）＝內距 16、子項間距 12；放清單列時用 <Group>。 */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[kit.card, padded && kit.cardPadding, style]}>{children}</View>;
}

/**
 * 一張卡片裡的多列：列與列之間自動加細分隔線（左側縮 16，和 iOS 設定一樣）。
 * 子項放 <Row>、<NavRow> 或自訂的列；null／false 會被略過。注意：不要用 <>…</> 包多列，請直接放或用陣列。
 */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;
  return (
    <View style={[kit.card, style]}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <View style={kit.separator} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/** 不可點的清單列。 */
export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[kit.row, style]}>{children}</View>;
}

/** 可點的清單列：標題（＋副標）、右側數值、「›」。按下時整列變淺灰。 */
export function NavRow(props: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress: () => void;
  /** accent：標題用強調色（動作連結，例如「挪用儲備」）；預設是一般文字色（前往某一頁）。 */
  tone?: 'default' | 'accent';
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const { title, subtitle, value, onPress, tone = 'default', disabled = false, accessibilityHint } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [kit.row, pressed && kit.pressed, disabled && { opacity: 0.45 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[text.body, tone === 'accent' && { color: colors.accent }]}>{title}</Text>
        {subtitle ? <Text style={text.footnote}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[text.value, { color: colors.muted }]}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/** 區段標題。color：標題前的小圓點（分組識別色）；right：標題右側的小字或按鈕。 */
export function SectionTitle({ children, color, right }: { children: ReactNode; color?: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[text.title, { flex: 1 }]} accessibilityRole="header">{children}</Text>
      {right}
    </View>
  );
}

/** 卡片外的小字說明。 */
export function Footnote({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[text.footnote, kit.outsideText, style]}>{children}</Text>;
}

/**
 * 月份切換列（大標題下方）：‹ 月份 ›。
 * hint：月份下方的小字（例如「本月」）；有 onHintPress 時小字變成可點的連結（例如「回到本月」）。
 */
export function MonthBar(props: {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  hint?: string;
  onHintPress?: () => void;
}) {
  const { title, onPrev, onNext, prevDisabled = false, nextDisabled = false, hint, onHintPress } = props;
  return (
    <View style={styles.monthBar}>
      <Pressable onPress={onPrev} disabled={prevDisabled} hitSlop={12} accessibilityRole="button" accessibilityLabel="上個月" accessibilityState={{ disabled: prevDisabled }} style={styles.monthArrow}>
        <Text style={[styles.arrow, prevDisabled && { color: colors.chevron }]}>‹</Text>
      </Pressable>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={text.headline}>{title}</Text>
        {hint && onHintPress ? (
          <Pressable onPress={onHintPress} accessibilityRole="button" hitSlop={8}>
            <Text style={[text.footnote, { color: colors.accent }]}>{hint}</Text>
          </Pressable>
        ) : hint ? <Text style={text.footnote}>{hint}</Text> : null}
      </View>
      <Pressable onPress={onNext} disabled={nextDisabled} hitSlop={12} accessibilityRole="button" accessibilityLabel="下個月" accessibilityState={{ disabled: nextDisabled }} style={styles.monthArrow}>
        <Text style={[styles.arrow, nextDisabled && { color: colors.chevron }]}>›</Text>
      </Pressable>
    </View>
  );
}

/** 主要按鈕（整列寬）。tone：accent 實心藍、secondary 白底藍字、destructive 白底紅字。 */
export function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'accent' | 'secondary' | 'destructive';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { title, onPress, disabled = false, tone = 'accent', style, accessibilityHint } = props;
  const filled = tone === 'accent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: filled ? colors.accent : colors.surface },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[text.headline, { color: filled ? '#ffffff' : tone === 'destructive' ? colors.expense : colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

/** iOS 風格的分段切換（兩到四個選項）。 */
export function Segmented<T extends string>(props: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  disabled?: boolean;
}) {
  const { options, value, onChange, disabled = false } = props;
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            disabled={disabled}
            hitSlop={{ top: 5, bottom: 5 }}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[text.subhead, { fontWeight: selected ? '600' : '400' }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 選項膠囊（分類、帳戶、成員）。放在白卡片裡：未選取是淺灰底，選取是實心藍。 */
export function Chip(props: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  const { label, active, disabled = false, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={[styles.chip, { backgroundColor: active ? colors.accent : colors.fill }, disabled && !active && { opacity: 0.5 }]}
    >
      <Text style={[text.subhead, { color: active ? '#ffffff' : colors.text, fontWeight: active ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

/** 提示區塊。info：一般說明（淡藍底）；warning：需要注意（淡黃底）；locked：已鎖定／唯讀（白底灰字）。 */
export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'locked' }) {
  const background = tone === 'warning' ? colors.warningBackground : tone === 'info' ? colors.accentSoft : colors.surface;
  const color = tone === 'warning' ? colors.warningText : tone === 'info' ? colors.text : colors.muted;
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Text style={[text.subhead, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chevron: { fontSize: 22, lineHeight: 24, color: colors.chevron },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -4 },
  monthArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.accent, fontSize: 30, lineHeight: 34 },
  button: { minHeight: 50, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  segmented: { flexDirection: 'row', backgroundColor: '#e3e3e8', borderRadius: 10, borderCurve: 'continuous', padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 34, borderRadius: 8, borderCurve: 'continuous' },
  segmentSelected: { backgroundColor: colors.surface, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  chip: { minHeight: 36, justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18 },
  banner: { borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 12 },
});
