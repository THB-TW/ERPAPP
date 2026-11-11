import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidDate } from '../calc/dates.ts';
import type { AssetCheckPreview, AssetCheckRecord, AssetCheckRequest } from '../ledger/index.ts';
import { CardStatementMismatchError, type CardReconciliation } from '../ledger/index.ts';
import { CardStatementCheck } from '../ui/CardStatementCheck.tsx';
import { cardStatementErrorMessage } from '../ui/cardStatementError.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { CloseAmount, CloseButton, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';
import { colors } from '../ui/theme.ts';

function newOperationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function CloseAssetsScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string | string[] }>();
  const month = typeof monthParam === 'string' ? monthParam : '';
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [preview, setPreview] = useState<AssetCheckPreview | null>(null);
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [dateText, setDateText] = useState('');
  const [saved, setSaved] = useState<AssetCheckRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardFailure, setCardFailure] = useState<CardReconciliation | null>(null);
  const [reload, setReload] = useState(0);
  const working = useRef(false);
  const confirming = useRef(false);
  const completedRef = useRef(false);
  const checkOperation = useRef(newOperationId());
  const closeOperation = useRef(newOperationId());
  const loadSequence = useRef(0);

  function failed(error: unknown) {
    setError(cardStatementErrorMessage(error));
    setCardFailure(error instanceof CardStatementMismatchError ? error.reconciliation : null);
    if (error instanceof CardStatementMismatchError) { setPreview(null); setSaved(null); }
  }

  function show(value: AssetCheckPreview) {
    setPreview(value);
    setDateText(value.asOf);
    setBalances(Object.fromEntries(value.accounts.filter((a) => a.editable).map((a) => [a.accountId, String(a.inputBalance)])));
    setDirty(false);
    checkOperation.current = newOperationId();
  }

  useFocusEffect(useCallback(() => {
    if (completedRef.current) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    setCardFailure(null);
    setSaved(null);
    ledger.previewAssetCheck({ month, hasEntitlement: hasMonthlyCloseEntitlement() }).then((value) => {
      if (sequence === loadSequence.current) { show(value); setLoading(false); }
    }, (e: unknown) => {
      if (sequence === loadSequence.current) { failed(e); setLoading(false); setPreview(null); }
    });
    return () => { loadSequence.current++; };
  }, [ledger, month, reload]));

  function changed() {
    setSaved(null);
    setDirty(true);
    setError(null);
    checkOperation.current = newOperationId();
  }

  async function selectDate(value: string) {
    if (!preview || working.current) return;
    Keyboard.dismiss();
    changed();
    if (!isValidDate(value) || value < preview.minDate || value > preview.maxDate) {
      setError(`餘額日期請選 ${preview.minDate} 到 ${preview.maxDate}。`);
      return;
    }
    working.current = true;
    setBusy(true);
    const sequence = ++loadSequence.current;
    try {
      const result = await ledger.previewAssetCheck({ month, asOf: value, hasEntitlement: hasMonthlyCloseEntitlement() });
      if (sequence === loadSequence.current) show(result);
    } catch (e) {
      if (sequence === loadSequence.current) failed(e);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function input(): AssetCheckRequest | null {
    if (!preview) return null;
    if (dateText !== preview.asOf) {
      setError('請先套用餘額日期，再輸入該日期的實際餘額。');
      return null;
    }
    const values: { accountId: number; balance: number }[] = [];
    for (const account of preview.accounts.filter((a) => a.editable)) {
      const text = balances[account.accountId]?.trim() ?? '';
      const value = Number(text);
      if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(value)) {
        setError(`${account.name}的實際餘額請填新台幣整數，可填負數。`);
        return null;
      }
      values.push({ accountId: account.accountId, balance: value });
    }
    return { month, asOf: preview.asOf, balances: values, hasEntitlement: hasMonthlyCloseEntitlement() };
  }

  async function check() {
    if (working.current || completedRef.current) return;
    Keyboard.dismiss();
    const request = input();
    if (!request) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = await ledger.previewAssetCheck(request);
      // 儲存失敗後重試沿用識別碼；輸入改變或成功保存才開始下一次核對。
      const record = await ledger.recordAssetCheck({ ...request, checkToken: result.checkToken, operationId: checkOperation.current });
      show(record.result);
      setSaved(record);
      closeOperation.current = newOperationId();
    } catch (e) {
      failed(e);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function complete(record: AssetCheckRecord) {
    if (working.current || completedRef.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      // 核對會新增財務文件版本；完成前重新取得月結預覽，服務仍會驗證核對是否過期。
      const calculation = await ledger.previewMonthlyClose({ month, hasEntitlement: hasMonthlyCloseEntitlement() });
      await ledger.completeMonthlyClose({ month, version: calculation.version, previewToken: calculation.previewToken,
        operationId: closeOperation.current, assetCheckId: record.id, hasEntitlement: hasMonthlyCloseEntitlement() });
      completedRef.current = true;
      setCompleted(true);
      Alert.alert('月結完成', '請記得匯出備份，保存這次月結。');
    } catch (e) {
      setSaved(null);
      failed(e);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function confirm() {
    if (!saved?.result.canComplete || dirty || working.current || confirming.current || completedRef.current) return;
    const record = saved;
    confirming.current = true;
    Keyboard.dismiss();
    Alert.alert(`完成 ${monthTitle(month)}月結？`, '實際合計與帳面總資產相等。確認完成後，該月交易會鎖定。', [
      { text: '返回檢查', style: 'cancel', onPress: () => { confirming.current = false; } },
      { text: '確認完成', onPress: () => { confirming.current = false; void complete(record); } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false; } });
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
    <Stack.Screen options={{ title: '總資產核對', headerBackTitle: '返回' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{month ? monthTitle(month) : '月結'}{completed ? '已完成' : '總資產核對'}</Text>
        {loading ? <ActivityIndicator accessibilityLabel="讀取總資產核對中" /> : null}
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        {cardFailure ? <>
          <CardStatementCheck result={cardFailure} />
          <CloseButton title="回信用卡帳單匯入與核對" onPress={() => router.push({ pathname: '/close-card-statement', params: { month } })} />
        </> : null}
        {completed ? <>
          <Text style={styles.note}>本月已鎖定。請匯出一份備份，保存這次月結。</Text>
          <CloseButton title="匯出備份" onPress={() => router.push('/settings-backup')} />
          <CloseButton title="查看本月快照" onPress={() => router.replace({ pathname: '/close-snapshot', params: { month } })} />
          <CloseButton title="返回月結" onPress={() => router.dismissTo('/(tabs)/close')} />
        </> : <>
          {!loading && preview ? <>
            <Text style={styles.note}>④ 現金與信用卡由 App 計算月底餘額。銀行與電子支付請核對餘額日期當天的實際金額，App 會倒回月底。</Text>
            <View style={styles.card}>
              <Text style={styles.heading}>餘額日期</Text>
              <Text style={styles.note}>可選 {preview.minDate} 至 {preview.maxDate}。更換日期會重新帶入 App 餘額。</Text>
              <TextInput value={dateText} editable={!busy} accessibilityLabel="餘額日期" placeholder="YYYY-MM-DD"
                autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation"
                style={{ color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12 }}
                onChangeText={(value) => { setDateText(value); changed(); }} />
              <CloseButton title="套用日期" onPress={() => { void selectDate(dateText); }} disabled={busy} />
              <View style={styles.row}>
                <DateButton title="‹ 前一天" disabled={busy || preview.asOf <= preview.minDate} onPress={() => { void selectDate(shiftDate(preview.asOf, -1)); }} />
                <DateButton title="後一天 ›" disabled={busy || preview.asOf >= preview.maxDate} onPress={() => { void selectDate(shiftDate(preview.asOf, 1)); }} />
              </View>
              <View style={styles.row}>
                <DateButton title="結算月月底" disabled={busy} onPress={() => { void selectDate(preview.minDate); }} />
                <DateButton title="今天" disabled={busy} onPress={() => { void selectDate(preview.maxDate); }} />
              </View>
            </View>
            {preview.accounts.map((account) => <View key={account.accountId} style={styles.card}>
              <Text style={styles.heading}>{account.name}{account.editable ? '' : '（唯讀）'}</Text>
              {account.editable ? <>
                <Text style={styles.label}>{preview.asOf} 實際餘額（元）</Text>
                <TextInput value={balances[account.accountId] ?? ''} editable={!busy}
                  accessibilityLabel={`${account.name}實際餘額`} keyboardType="numbers-and-punctuation" autoCorrect={false}
                  style={{ color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12 }}
                  onChangeText={(value) => { setBalances((current) => ({ ...current, [account.accountId]: value })); changed(); }} />
                <CloseAmount label="該日期 App 餘額" amount={account.appBalance} />
              </> : <CloseAmount label="月底餘額（App 計算）" amount={account.appMonthEndBalance} />}
              {!dirty ? <>
                {account.editable ? <CloseAmount label="換算月底餘額" amount={account.monthEndBalance} /> : null}
                <CloseAmount label="與 App 月底餘額差額" amount={account.difference} />
                <CloseAmount label="月底後倒回調整" amount={account.rollback} />
                {account.movements.map((movement) => <Text key={`${movement.kind}:${movement.id}`} style={styles.note}>
                  {movement.date} {movement.description}：{formatAmount(movement.amount)} 元，倒回 {formatAmount(movement.adjustment)} 元
                </Text>)}
              </> : null}
            </View>)}
            {dirty ? <Text style={styles.note}>輸入已變更，請重新核對並保存紀錄。</Text> : <View style={styles.card}>
              <CloseAmount label="各帳戶月底餘額合計" amount={preview.actualTotal - preview.netDeployed} />
              <CloseAmount label="累計投入淨額" amount={preview.netDeployed} />
              <CloseAmount label="實際合計" amount={preview.actualTotal} />
              <CloseAmount label="帳面總資產" amount={preview.bookTotal} />
              <CloseAmount label="總差額（實際－帳面）" amount={preview.difference} />
              <Text style={preview.canComplete ? styles.note : styles.error}>
                {preview.canComplete ? '金額相等。保存核對紀錄後，可確認完成月結。' : '有差額，不能完成月結。請查看各帳戶差額，回記帳補記或更正後再核對。'}
              </Text>
            </View>}
            {saved ? <Text style={styles.note}>已保存這次核對紀錄，之後的交易不會改寫此紀錄。</Text> : null}
            <CloseButton title={busy ? '處理中…' : '核對並保存紀錄'} onPress={() => { void check(); }} disabled={busy} />
            <CloseButton title="完成月結" onPress={confirm} disabled={busy || dirty || !saved?.result.canComplete} />
            <DateButton title="回記帳檢查交易 ›" disabled={busy} onPress={() => router.navigate('/(tabs)')} />
          </> : null}
          {!loading ? <CloseButton title="重新讀取 App 餘額" disabled={busy} onPress={() => setReload((value) => value + 1)} /> : null}
        </>}
        <DateButton title="查看本月核對紀錄 ›" disabled={busy} onPress={() => router.push({ pathname: '/asset-check-history', params: { month } })} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function DateButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ opacity: disabled ? 0.45 : 1 }}>
    <Text style={styles.link}>{title}</Text>
  </Pressable>;
}
