import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import type { MonthlyClosePreview } from '../ledger/index.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { CloseButton, ClosePage, MonthlyCloseSummary, closeErrorMessage, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';

/** 只用來識別同一次儲存，與預算設定沿用相同 UUID 格式。 */
function newOperationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export default function CloseCalculationScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string | string[] }>();
  const month = typeof monthParam === 'string' ? monthParam : '';
  const ledger = useLedger();
  const [preview, setPreview] = useState<MonthlyClosePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [retry, setRetry] = useState(0);
  const operationId = useRef(newOperationId());
  const confirming = useRef(false);
  const completedRef = useRef(false);
  const submitting = useRef(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (completed) return;
    setLoading(true);
    setPreview(null);
    setError(null);
    operationId.current = newOperationId();
    ledger.previewMonthlyClose({ month, hasEntitlement: hasMonthlyCloseEntitlement() }).then((value) => {
      if (!cancelled) { setPreview(value); setLoading(false); }
    }, (e: unknown) => {
      if (!cancelled) { setError(closeErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, month, retry, completed]));

  async function save() {
    if (!preview || submitting.current || completedRef.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      await ledger.completeMonthlyClose({ month: preview.month, version: preview.version, previewToken: preview.previewToken,
        operationId: operationId.current, hasEntitlement: hasMonthlyCloseEntitlement() });
      completedRef.current = true;
      setCompleted(true);
      Alert.alert('月結完成', '請記得匯出備份，保存這次月結。');
    } catch (e) {
      setError(closeErrorMessage(e));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function confirm() {
    if (!preview || confirming.current || submitting.current || completedRef.current) return;
    confirming.current = true;
    Alert.alert(`完成 ${monthTitle(preview.month)}月結？`, '完成後該月交易會鎖定。目前尚未進行信用卡與總資產核對。', [
      { text: '返回檢查', style: 'cancel', onPress: () => { confirming.current = false; } },
      { text: '確認完成', onPress: () => { confirming.current = false; void save(); } },
    ]);
  }

  return <>
    <Stack.Screen options={{ title: '月結計算預覽', headerBackTitle: '返回' }} />
    <ClosePage>
      <Text style={styles.title}>{month ? monthTitle(month) : '月結'}{completed ? '已完成' : '計算預覽'}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="計算月結中" /> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {completed ? <>
        <Text style={styles.note}>本月已鎖定。請記得匯出備份，保存這次月結。</Text>
        <CloseButton title="查看本月快照" onPress={() => router.replace({ pathname: '/close-snapshot', params: { month } })} />
        <CloseButton title="返回月結" onPress={() => router.dismissTo('/(tabs)/close')} />
      </> : <>
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
            <Text style={styles.note}>總資產核對尚未開放。目前可確認完成月結，但尚無實際餘額差額的阻擋保護。</Text>
          </View>
          <CloseButton title={saving ? '儲存中…' : '完成月結'} onPress={confirm} disabled={saving} />
        </> : null}
        {!loading ? <CloseButton title="重新計算預覽" onPress={() => setRetry((n) => n + 1)} disabled={saving} /> : null}
        <Pressable disabled={saving} accessibilityRole="button" onPress={() => router.navigate('/(tabs)/settings')}><Text style={styles.link}>到設定修正預算歸屬 ›</Text></Pressable>
      </>}
    </ClosePage>
  </>;
}
