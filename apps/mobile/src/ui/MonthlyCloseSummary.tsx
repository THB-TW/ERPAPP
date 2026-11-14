import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { BudgetRuleError, LedgerError } from '../ledger/index.ts';
import type { BudgetMonthView } from '../ledger/index.ts';
import { formatAmount } from './format.ts';
import { colors, typeScale } from './theme.ts';

export function closeErrorMessage(error: unknown): string {
  return error instanceof BudgetRuleError || error instanceof LedgerError
    ? error.message : '讀取或儲存失敗，請稍後重試。';
}

export function ClosePage({ children }: { children: ReactNode }) {
  return <ScrollView style={closeStyles.screen} contentContainerStyle={closeStyles.content} contentInsetAdjustmentBehavior="automatic">{children}</ScrollView>;
}

export function CloseButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={({ pressed }) => [closeStyles.button, pressed && { opacity: 0.75 }, disabled && { opacity: 0.45 }]}>
      <Text style={closeStyles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function CloseAmount({ label, amount }: { label: string; amount: number }) {
  return <View style={closeStyles.row}><Text style={closeStyles.label}>{label}</Text><Text style={closeStyles.amount}>NT$ {formatAmount(amount)}</Text></View>;
}

/** cardStyle：放在淺灰底的分組畫面（預算頁試做）時改成白卡片，其他畫面不用傳。 */
export function MonthlyCloseSummary({ summary, cardStyle }: { summary: BudgetMonthView; cardStyle?: StyleProp<ViewStyle> }) {
  return (
    <View style={[closeStyles.card, cardStyle]}>
      <CloseAmount label="當月收入" amount={summary.income} />
      <CloseAmount label="當月盈餘" amount={summary.surplus} />
      <CloseAmount label="可用餘額" amount={summary.spare} />
      <CloseAmount label="貸款／分期儲備" amount={summary.tuition} />
      <CloseAmount label="總儲備金" amount={summary.reserve} />
      <CloseAmount label="帳面總資產" amount={summary.total} />
      {summary.legacyTotalDifference !== 0 ? <CloseAmount label="保留的歷史差異" amount={summary.legacyTotalDifference} /> : null}
    </View>
  );
}

// 數值對齊 ui/kit.tsx：白色圓角卡片、Apple 字級、主要按鈕同 PrimaryButton。
export const closeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 16 },
  title: { ...typeScale.title3, color: colors.text },
  heading: { ...typeScale.headline, color: colors.text },
  note: { ...typeScale.subhead, color: colors.muted },
  label: { ...typeScale.body, color: colors.text, flex: 1 },
  amount: { ...typeScale.body, color: colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: 16, borderCurve: 'continuous', gap: 12 },
  error: { ...typeScale.subhead, color: colors.expense },
  link: { ...typeScale.body, color: colors.accent, paddingVertical: 10 },
  button: { backgroundColor: colors.accent, minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...typeScale.headline, color: '#ffffff' },
});
