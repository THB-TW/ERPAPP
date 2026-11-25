import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { AssetCheckRecord } from '../ledger/index.ts';
import { taipeiDateTime } from '../ui/backupText.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { CloseAmount, CloseButton, ClosePage, closeErrorMessage, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';

export default function AssetCheckHistoryScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string | string[] }>();
  const month = typeof monthParam === 'string' ? monthParam : undefined;
  const ledger = useLedger();
  const [records, setRecords] = useState<AssetCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ledger.listAssetChecks(month).then((result) => {
      if (!cancelled) { setRecords(result); setLoading(false); }
    }, (e: unknown) => {
      if (!cancelled) { setError(closeErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, month, retry]));

  return <>
    <Stack.Screen options={{ title: '總資產核對紀錄', headerBackTitle: '返回' }} />
    <ClosePage>
      <Text style={styles.title}>{month ? monthTitle(month) : '全部月份'}核對紀錄</Text>
      <Text style={styles.note}>以下是核對當時保存的金額與倒回明細，之後的交易與更正不會改寫它。</Text>
      {loading ? <ActivityIndicator accessibilityLabel="讀取核對紀錄中" /> : null}
      {error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><CloseButton title="重新讀取" onPress={() => setRetry((value) => value + 1)} /></> : null}
      {!loading && !error && records.length === 0 ? <Text style={styles.note}>尚未保存核對紀錄。</Text> : null}
      {!loading && !error ? [...records].reverse().map((record) => <View key={record.id} style={styles.card}>
        <Text style={styles.heading}>{monthTitle(record.month)}／{taipeiDateTime(record.time)}</Text>
        <Text style={styles.note}>餘額日期：{record.result.asOf}</Text>
        <CloseAmount label="實際合計" amount={record.result.actualTotal} />
        <CloseAmount label="帳面總資產" amount={record.result.bookTotal} />
        <CloseAmount label="總差額" amount={record.result.difference} />
        <CloseAmount label="累計投入淨額" amount={record.result.netDeployed} />
        {record.result.accounts.map((account) => <View key={account.accountId} style={{ gap: 8 }}>
          <Text style={styles.heading}>{account.name}</Text>
          <CloseAmount label={account.editable ? '當時實際餘額輸入' : '當時 App 餘額'} amount={account.inputBalance} />
          <CloseAmount label="倒回調整" amount={account.rollback} />
          <CloseAmount label="換算月底餘額" amount={account.monthEndBalance} />
          <CloseAmount label="與 App 月底餘額差額" amount={account.difference} />
          {account.movements.map((movement) => <Text key={`${movement.kind}:${movement.id}`} style={styles.note}>
            {movement.date} {movement.description}：{formatAmount(movement.amount)} 元，倒回 {formatAmount(movement.adjustment)} 元
          </Text>)}
        </View>)}
      </View>) : null}
    </ClosePage>
  </>;
}
