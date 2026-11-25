import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LoanView } from '../ledger/index.ts';
import { formatAmount, monthTitle } from './format.ts';
import { colors, groupColors } from './theme.ts';

export function LoanCards({ loans, onEdit, disabled = false, cardStyle }: {
  loans: LoanView[];
  onEdit?: (loan: LoanView) => void;
  disabled?: boolean;
  /** 只用來覆寫內距或圓角等；白卡片底色已是預設。 */
  cardStyle?: StyleProp<ViewStyle>;
}) {
  return <View style={{ gap: 12 }}>
    {loans.length === 0 ? <Text style={styles.note}>這個月份還沒有貸款／分期。</Text> : null}
    {loans.map((loan) => {
      const progress = loan.totalAmount !== null && loan.totalAmount > 0 && loan.remainingPrincipal !== null
        ? Math.max(0, Math.min(1, 1 - loan.remainingPrincipal / loan.totalAmount)) : null;
      return <View key={loan.id} style={[styles.card, cardStyle]}>
        <View style={styles.row}>
          <Text style={styles.name}>{loan.name}</Text>
          <Text style={styles.amount}>{loan.remainingPrincipal === null ? '本金待補' : loan.remainingPrincipal === 0 ? '已結清' : `剩 ${formatAmount(loan.remainingPrincipal)} 元`}</Text>
        </View>
        {progress !== null ? <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${loan.name}還款進度`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={styles.track}
        >
          <View style={{ height: 6, width: `${progress * 100}%`, borderRadius: 3, backgroundColor: groupColors.loan }} />
        </View> : null}
        <Text style={styles.note}>每月繳款 {formatAmount(loan.monthlyPayment)} 元・總額 {loan.totalAmount === null ? '待補資料' : `${formatAmount(loan.totalAmount)} 元`}</Text>
        <Text style={styles.note}>預計結清：{loan.expectedEndMonth === null ? '待補資料' : monthTitle(loan.expectedEndMonth)}</Text>
        <Text style={{ color: loan.reserve < 0 ? colors.expense : colors.text }}>累積儲備 {formatAmount(loan.reserve)} 元</Text>
        {loan.remainingPrincipal === 0 ? <Text style={styles.note}>本金已結清，停止每月提撥。</Text> : null}
        {loan.needsSetup ? <Text style={styles.note}>舊學費儲備已保留；請到設定補齊總額、剩餘本金與結清月份。補齊前沿用原提撥，補齊後可選這筆貸款分類記繳款。</Text> : null}
        {onEdit ? <Pressable onPress={() => onEdit(loan)} disabled={disabled} accessibilityRole="button"
          accessibilityLabel={`修改${loan.name}`} accessibilityState={{ disabled }} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
          <Text style={{ color: colors.accent }}>{loan.needsSetup ? '補齊貸款資料' : '修改貸款資料'} ›</Text>
        </Pressable> : null}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: 16, borderCurve: 'continuous', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600', flexShrink: 1 },
  amount: { color: colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  // 軌道在白卡片裡，要用 fill 才看得出來。
  track: { height: 6, backgroundColor: colors.fill, borderRadius: 3, overflow: 'hidden' },
});
