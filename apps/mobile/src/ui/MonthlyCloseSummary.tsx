import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BudgetRuleError, LedgerError } from '../ledger/index.ts';
import type { BudgetMonthView } from '../ledger/index.ts';
import { formatAmount } from './format.ts';
import { colors } from './theme.ts';

export function closeErrorMessage(error: unknown): string {
  return error instanceof BudgetRuleError || error instanceof LedgerError
    ? error.message : '讀取或儲存失敗，請稍後重試。';
}

export function ClosePage({ children }: { children: ReactNode }) {
  return <ScrollView style={closeStyles.screen} contentContainerStyle={closeStyles.content}>{children}</ScrollView>;
}

export function CloseButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={[closeStyles.button, disabled && { opacity: 0.45 }]}>
      <Text style={closeStyles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function CloseAmount({ label, amount }: { label: string; amount: number }) {
  return <View style={closeStyles.row}><Text style={closeStyles.label}>{label}</Text><Text style={closeStyles.amount}>NT$ {formatAmount(amount)}</Text></View>;
}

export function MonthlyCloseSummary({ summary }: { summary: BudgetMonthView }) {
  return (
    <View style={closeStyles.card}>
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

export const closeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  label: { color: colors.text, flex: 1, lineHeight: 22 },
  amount: { color: colors.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: 12, gap: 12 },
  error: { color: colors.expense, fontSize: 14, lineHeight: 22 },
  link: { color: colors.accent, fontSize: 15, paddingVertical: 8 },
  button: { backgroundColor: colors.accent, padding: 15, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
