import { Text, View } from 'react-native';
import type { CardReconciliation } from '../ledger/index.ts';
import { formatAmount } from './format.ts';
import { closeStyles as styles } from './MonthlyCloseSummary.tsx';

/** 只顯示帳本服務算出的核對結果，不在畫面重做配對。 */
export function CardStatementCheck({ result }: { result: CardReconciliation }) {
  return <View style={styles.card}>
    <Text style={styles.heading}>信用卡帳單核對</Text>
    {!result.hasCards ? <Text style={styles.note}>沒有信用卡帳戶，可略過這一步。</Text> : <>
      {result.cards.map((card) => <Text key={card.accountId} style={styles.label}>
        {card.account}：記帳 {card.transactionCount} 筆 ／ 帳單 {card.statementCount} 筆
      </Text>)}
      {result.matched ? <Text style={styles.note}>該月每張卡的同日同額筆數均一致，可以繼續月結。</Text> : <>
        <Text style={styles.error} accessibilityRole="alert">信用卡記帳與帳單筆數不符，請先修正，才能繼續月結。</Text>
        {result.mismatches.map((row) => <View key={`${row.accountId}|${row.date}|${row.amount}`}>
          <Text style={styles.label}>{row.account}・{row.date}・NT$ {formatAmount(row.amount)}</Text>
          <Text style={styles.error}>記帳 {row.transactionCount} 筆 ／ 帳單 {row.statementCount} 筆</Text>
        </View>)}
        <Text style={styles.note}>請確認是否尚未匯入帳單，或回「記帳」補記、修正日期、金額與所屬信用卡。</Text>
      </>}
    </>}
  </View>;
}
