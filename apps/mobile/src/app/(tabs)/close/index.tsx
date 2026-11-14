import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { MonthlyCloseDraft } from '../../../ledger/index.ts';
import { requirePaidFeature, useSubscriptionStatus } from '../../../ui/closeEntitlement.ts';
import { monthTitle } from '../../../ui/format.ts';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { Banner, Footnote, Group, NavRow } from '../../../ui/kit.tsx';
import { TabScrollView } from '../../../ui/LargeTitle.tsx';
import { CloseAmount, CloseButton, closeErrorMessage, closeStyles as styles } from '../../../ui/MonthlyCloseSummary.tsx';

export default function MonthlyCloseScreen() {
  const ledger = useLedger();
  const [draft, setDraft] = useState<MonthlyCloseDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const subscription = useSubscriptionStatus();

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ledger.getMonthlyCloseDraft().then((value) => {
      if (!cancelled) { setDraft(value); setLoading(false); }
    }, (e: unknown) => {
      if (!cancelled) { setDraft(null); setError(closeErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, retry]));

  return (
    <TabScrollView title="月結精靈" contentContainerStyle={styles.content}>
      <Footnote>① 月份與收入 → ② 信用卡 → ③ 計算 → ④ 總資產</Footnote>
      {subscription.kind === 'dev_unlocked' ? <Banner tone="warning">開發版・未接內購：月結精靈開放使用。</Banner> : null}
      {subscription.kind === 'expired' ? <Footnote>訂閱已到期，歷史月結仍可檢視；重新訂閱後從最早的開放月份依序補做月結。</Footnote> : null}
      {loading ? <ActivityIndicator accessibilityLabel="讀取開放月份中" /> : null}
      {error ? <><Text style={styles.error} accessibilityRole="alert">{error}</Text><CloseButton title="重新讀取" onPress={() => setRetry((n) => n + 1)} /></> : null}
      {!loading && draft ? <>
        <View style={styles.card}>
          <Text style={styles.heading}>① {monthTitle(draft.month)}</Text>
          <Text style={styles.note}>已自動選到開放月份，依序完成每個月的月結。</Text>
          <CloseAmount label="當月收入" amount={draft.income} />
          <Text style={styles.note}>由這個月的收入交易加總，不能在這裡修改。要更正請回「記帳」修改交易。</Text>
          <Text style={styles.note}>{draft.latestMonth ? `最近已結：${monthTitle(draft.latestMonth)}` : '尚未月結；請先完成開帳與預算設定。'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.heading}>② 信用卡帳單核對</Text>
          <Text style={styles.note}>選擇信用卡並匯入帳單，核對同日同額的筆數。沒有信用卡可在下一頁略過。</Text>
        </View>
        {!draft.canClose ? <Footnote>這個月還沒結束，要等下個月才能月結。</Footnote> : null}
        <CloseButton title="進入信用卡帳單核對" disabled={!draft.canClose} onPress={() => { if (requirePaidFeature('monthly_close')) router.push({ pathname: '/close-card-statement', params: { month: draft.month } }); }} />
      </> : null}
      <Group>
        <NavRow tone="accent" title="查看歷史月結" onPress={() => router.push('/close-history')} />
        {draft?.latestMonth ? <NavRow tone="accent" title="撤銷最近一次月結（先預覽）" onPress={() => router.push({ pathname: '/adjustments', params: { action: 'rollback' } })} /> : null}
      </Group>
    </TabScrollView>
  );
}
