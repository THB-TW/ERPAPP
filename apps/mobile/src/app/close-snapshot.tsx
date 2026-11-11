import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { MonthlyCloseSnapshot } from '../ledger/index.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { CloseAmount, CloseButton, ClosePage, MonthlyCloseSummary, closeErrorMessage, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';

export default function CloseSnapshotScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string | string[] }>();
  const month = typeof monthParam === 'string' ? monthParam : '';
  const ledger = useLedger();
  const [snapshot, setSnapshot] = useState<MonthlyCloseSnapshot | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([ledger.getMonthlyCloseSnapshot(month), ledger.getBudgetStatus()]).then(([value, status]) => {
      if (!cancelled) {
        setSnapshot(value);
        setNames(Object.fromEntries(status.categories.map((category) => [category.id, category.name])));
        setLoading(false);
      }
    }, (e: unknown) => {
      if (!cancelled) { setSnapshot(null); setError(closeErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, month, retry]));
  return <>
    <Stack.Screen options={{ title: '月結快照', headerBackTitle: '返回' }} />
    <ClosePage>
      <Text style={styles.title}>{month ? monthTitle(month) : '月結'}快照</Text>
      {loading ? <ActivityIndicator accessibilityLabel="讀取月結快照中" /> : null}
      {error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><CloseButton title="重新讀取" onPress={() => setRetry((n) => n + 1)} /></> : null}
      {!loading && snapshot ? <>
        <Text style={styles.heading}>已生效調整後的資產</Text>
        <Text style={styles.note}>當月盈餘保留原始月結值；可用餘額、各分類儲備與帳面總資產包含其後已生效的調整。</Text>
        <MonthlyCloseSummary summary={snapshot.summary} />
        <CloseButton title="查看本月總資產核對紀錄" onPress={() => router.push({ pathname: '/asset-check-history', params: { month } })} />
        <Text style={styles.heading}>各分類累積儲備</Text>
        {snapshot.summary.reserves.length === 0 ? <Text style={styles.note}>沒有分類儲備。</Text> : null}
        {snapshot.summary.reserves.map((reserve) => <View key={reserve.categoryId} style={styles.card}>
          <Text style={styles.label}>{reserve.name}</Text>
          <Text style={styles.amount}>NT$ {formatAmount(reserve.balance)}</Text>
        </View>)}
        <Text style={styles.heading}>原始月結計算</Text>
        <View style={styles.card}>
          <CloseAmount label="當月收入" amount={snapshot.calculation.income} />
          <CloseAmount label="當月盈餘" amount={snapshot.calculation.surplus} />
          <CloseAmount label="原始可用餘額" amount={snapshot.calculation.rawSpare} />
          <CloseAmount label="原始貸款／分期儲備" amount={snapshot.calculation.tuition} />
          <Text style={styles.note}>月結時間：{snapshot.time || '未提供'}</Text>
          {snapshot.calculation.capSnapshot ? snapshot.calculation.capSnapshot.limits.map((limit) => <View key={limit.categoryId} style={{ gap: 6 }}>
            <Text style={styles.label}>{names[limit.categoryId] ?? limit.categoryId}</Text>
            <Text style={styles.note}>實支 {snapshot.summary.migrated && !Object.hasOwn(snapshot.calculation.expenses, limit.categoryId)
              ? '未保存' : formatAmount(snapshot.calculation.expenses[limit.categoryId] ?? 0)}</Text>
            {Object.hasOwn(snapshot.calculation.changes, limit.categoryId) ? <Text style={styles.note}>儲備增減 {formatAmount(snapshot.calculation.changes[limit.categoryId])}</Text> : null}
            {Object.hasOwn(snapshot.calculation.balances, limit.categoryId) ? <Text style={styles.note}>原始累積儲備 {formatAmount(snapshot.calculation.balances[limit.categoryId])}</Text> : null}
          </View>) : <Text style={styles.note}>未保存完整分類計算快照，不從現在交易推估。</Text>}
        </View>
        <Text style={styles.heading}>月結採用的上限快照</Text>
        {snapshot.calculation.capSnapshot ? <View style={styles.card}>
          <Text style={styles.note}>原因：{snapshot.calculation.capSnapshot.reason}</Text>
          <Text style={styles.note}>保存時間：{snapshot.calculation.capSnapshot.time || '未提供'}</Text>
          <Text style={styles.label}>舊學費設定（歷史上限快照）：NT$ {formatAmount(snapshot.calculation.capSnapshot.tuition)}</Text>
          {snapshot.calculation.capSnapshot.limits.map((limit) => <Text key={limit.categoryId} style={styles.label}>
            {names[limit.categoryId] ?? limit.categoryId}：NT$ {formatAmount(limit.amount)}
          </Text>)}
          <Text style={styles.heading}>交易分類歸屬</Text>
          {Object.entries(snapshot.calculation.capSnapshot.mapping).map(([name, id]) => <Text key={name} style={styles.note}>
            {name} → {names[id] ?? id}
          </Text>)}
        </View> : <Text style={styles.note}>這個搬遷月份／期初基準沒有保存上限快照，原有數字照樣保留。</Text>}
      </> : null}
    </ClosePage>
  </>;
}
