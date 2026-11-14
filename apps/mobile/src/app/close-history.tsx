import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import type { BudgetMonthSummary } from '../ledger/index.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { Group, NavRow } from '../ui/kit.tsx';
import { CloseButton, ClosePage, closeErrorMessage, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';

export default function CloseHistoryScreen() {
  const ledger = useLedger();
  const [months, setMonths] = useState<BudgetMonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ledger.listBudgetMonths().then((value) => {
      if (!cancelled) { setMonths([...value].reverse()); setLoading(false); }
    }, (e: unknown) => {
      if (!cancelled) { setError(closeErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, retry]));
  return <>
    <Stack.Screen options={{ title: '歷史月結', headerBackTitle: '返回' }} />
    <ClosePage>
      {loading ? <ActivityIndicator accessibilityLabel="讀取歷史月結中" /> : error ? <>
        <Text style={styles.error} accessibilityRole="alert">{error}</Text>
        <CloseButton title="重新讀取" onPress={() => setRetry((n) => n + 1)} />
      </> : <>
        {months.length === 0 ? <Text style={styles.note}>尚未有月結快照。</Text> : null}
        {/* 標題已在導覽列，頁內不再重複；每個月一列，箭頭靠右。 */}
        <Group>
          {months.map((month) => <NavRow key={month.month} title={monthTitle(month.month)}
            subtitle={[`當月盈餘 NT$ ${formatAmount(month.surplus)}`, `帳面總資產 NT$ ${formatAmount(month.total)}`, month.migrated ? '搬遷月份／期初基準' : null].filter(Boolean).join('\n')}
            onPress={() => router.push({ pathname: '/close-snapshot', params: { month: month.month } })} />)}
        </Group>
      </>}
    </ClosePage>
  </>;
}
