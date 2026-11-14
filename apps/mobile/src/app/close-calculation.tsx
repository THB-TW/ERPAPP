import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { CardReconciliation, MonthlyClosePreview } from '../ledger/index.ts';
import { CardStatementCheck } from '../ui/CardStatementCheck.tsx';
import { cardStatementErrorMessage } from '../ui/cardStatementError.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { CloseButton, ClosePage, MonthlyCloseSummary, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';

export default function CloseCalculationScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string | string[] }>();
  const month = typeof monthParam === 'string' ? monthParam : '';
  const ledger = useLedger();
  const [preview, setPreview] = useState<MonthlyClosePreview | null>(null);
  const [cardCheck, setCardCheck] = useState<CardReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setCardCheck(null);
    setError(null);
    async function load() {
      const check = await ledger.getCardReconciliation(month);
      if (!cancelled) setCardCheck(check);
      const value = check.matched ? await ledger.previewMonthlyClose({ month, hasEntitlement: hasMonthlyCloseEntitlement() }) : null;
      return { check, value };
    }
    load().then(({ check, value }) => {
      if (!cancelled) { setCardCheck(check); setPreview(value); setLoading(false); }
    }, (e: unknown) => {
      if (!cancelled) { setError(cardStatementErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, month, retry]));

  return <>
    <Stack.Screen options={{ title: '月結計算預覽', headerBackTitle: '返回' }} />
    <ClosePage>
      <Text style={styles.title}>{month ? monthTitle(month) : '月結'}計算預覽</Text>
      {loading ? <ActivityIndicator accessibilityLabel="計算月結中" /> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {cardCheck ? <CardStatementCheck result={cardCheck} /> : null}
      {!loading && cardCheck && !cardCheck.matched ? <CloseButton title="回信用卡帳單匯入與核對"
        onPress={() => router.push({ pathname: '/close-card-statement', params: { month } })} /> : null}
      <>
        {!loading && preview ? <>
          <Text style={styles.heading}>③ 自動計算結果</Text>
          <MonthlyCloseSummary summary={preview.summary} />
          <Text style={styles.heading}>各分類上限與實支</Text>
          {preview.rows.map((row) => <View key={row.categoryId} style={styles.card}>
            <Text style={styles.heading}>{row.name}</Text>
            <Text style={styles.note}>{row.cap === null ? '照實支' : `上限 ${formatAmount(row.cap)}`} ／ 實支 {formatAmount(row.spent)}</Text>
            {row.change !== null ? <Text style={styles.label}>上限－實支：{formatAmount(row.change)}</Text> : null}
            {row.balance !== null ? <Text style={styles.label}>新的累積儲備：NT$ {formatAmount(row.balance)}</Text> : null}
          </View>)}
          <View style={styles.card}>
            <Text style={styles.heading}>④ 總資產核對</Text>
            <Text style={styles.note}>核對各帳戶月底餘額，實際合計與帳面總資產相等後才能完成月結。</Text>
          </View>
          <CloseButton title="進入總資產核對" onPress={() => router.push({ pathname: '/close-assets', params: { month } })} />
        </> : null}
        {!loading ? <CloseButton title="重新計算預覽" onPress={() => setRetry((n) => n + 1)} /> : null}
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/settings')}><Text style={styles.link}>到設定修正預算歸屬 ›</Text></Pressable>
      </>
    </ClosePage>
  </>;
}
