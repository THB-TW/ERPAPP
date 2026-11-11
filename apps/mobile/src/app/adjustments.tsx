import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shiftMonth } from '../calc/dates.ts';
import type { AdjustmentPreview, AdjustmentRequest, BudgetAdjustmentView, BudgetMonthSummary, BudgetMonthView, BudgetStatus } from '../ledger/index.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { closeErrorMessage } from '../ui/MonthlyCloseSummary.tsx';
import { colors } from '../ui/theme.ts';

type Mode = 'transfer' | 'fund' | 'correct' | 'reverse' | 'rollback';
const MODES: { id: Mode; title: string }[] = [
  { id: 'transfer', title: '儲備挪用' }, { id: 'fund', title: '補入儲備' }, { id: 'correct', title: '前期更正' },
  { id: 'reverse', title: '沖銷調整' }, { id: 'rollback', title: '撤銷月結' },
];
const actionTitle = (kind: string) => MODES.find((mode) => mode.id === kind)?.title ?? '調整';
const reversible = (row: BudgetAdjustmentView) => !row.reversed && !row.reverses && !row.pending;
const amountText = (value: number) => `NT$ ${formatAmount(value)}`;

/** 僅識別同一次操作，讓連點與中斷重送不重複生效。 */
function operationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function displayTime(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

export default function AdjustmentsScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const params = useLocalSearchParams<{ action?: string }>();
  const initialMode = MODES.find((mode) => mode.id === params.action)?.id ?? 'transfer';
  const scroll = useRef<ScrollViewInstance>(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [months, setMonths] = useState<BudgetMonthSummary[]>([]);
  const [latest, setLatest] = useState<BudgetMonthView | null>(null);
  const [history, setHistory] = useState<BudgetAdjustmentView[]>([]);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [targetMonth, setTargetMonth] = useState('');
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [negative, setNegative] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ request: AdjustmentRequest; result: AdjustmentPreview } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [entitled, setEntitled] = useState(hasMonthlyCloseEntitlement());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
    setEntitled(hasMonthlyCloseEntitlement());
    Promise.all([ledger.getBudgetStatus(), ledger.listBudgetMonths(), ledger.listBudgetAdjustments()]).then(async ([next, closed, adjustments]) => ({
      next, closed, adjustments, snapshot: next.latestMonth ? await ledger.getBudgetMonth(next.latestMonth) : null,
    })).then(({ next, closed, adjustments, snapshot }) => {
      if (cancelled) return;
      const reserves = next.categories.filter((category) => category.active && category.kind === 'reserve');
      setStatus(next); setMonths(closed); setHistory(adjustments); setLatest(snapshot);
      setFrom(reserves[0]?.id ?? null); setTo(reserves[1]?.id ?? reserves[0]?.id ?? null);
      setTargetMonth(next.latestMonth ?? '');
      setOriginalId(adjustments.findLast(reversible)?.id ?? null);
      setAmount(''); setNegative(false); setReason(''); setLoading(false);
    }, (e: unknown) => {
      if (cancelled) return;
      setStatus(null); setLatest(null); setMonths([]); setHistory([]);
      setError(closeErrorMessage(e)); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ledger, retry]));

  function edit(action: () => void) {
    if (inFlight.current) return;
    setPreview(null); setError(null); setSuccess(null); action();
  }

  function chooseMode(next: Mode) {
    edit(() => { setMode(next); setReason(''); });
  }

  function chooseReversal(row: BudgetAdjustmentView) {
    edit(() => { setMode('reverse'); setOriginalId(row.id); setReason(''); });
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  async function showPreview() {
    if (!status?.latestMonth || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setSuccess(null); Keyboard.dismiss();
    const request: AdjustmentRequest = {
      command: { action: mode, operationId: operationId(), version: status.version,
        // 引擎以指令月份的前一個月作為更正月份；畫面選的是實際被更正月份。
        month: mode === 'correct' ? shiftMonth(targetMonth, 1) : status.latestMonth, reason,
        ...(mode === 'transfer' ? { from, to, amount: Number(amount) } : {}),
        ...(mode === 'fund' ? { to, amount: Number(amount) } : {}),
        ...(mode === 'correct' ? { amount: Number(amount) * (negative ? -1 : 1) } : {}),
        ...(mode === 'reverse' ? { reverses: originalId } : {}),
      }, hasEntitlement: hasMonthlyCloseEntitlement(),
    };
    try {
      setPreview({ request, result: await ledger.previewAdjustment(request) });
    } catch (e) {
      setPreview(null); setError(closeErrorMessage(e));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      inFlight.current = false; setBusy(false); setEntitled(hasMonthlyCloseEntitlement());
    }
  }

  async function confirmPreview() {
    if (!preview || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await ledger.confirmAdjustment({ ...preview.request, previewToken: preview.result.previewToken, hasEntitlement: hasMonthlyCloseEntitlement() });
      void syncNotifications(ledger).catch(() => {});
      setPreview(null);
      setSuccess(preview.request.command.action === 'rollback'
        ? '已撤銷最近一次月結。該月交易已解鎖；請修改後回月結精靈重新月結，待重結調整會恢復一次影響。'
        : '調整已生效，原因與原始紀錄已保留。');
      setRetry((value) => value + 1);
      scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (e) {
      setPreview(null); setError(closeErrorMessage(e));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      inFlight.current = false; setBusy(false); setEntitled(hasMonthlyCloseEntitlement());
    }
  }

  const reserves = status?.categories.filter((category) => category.active && category.kind === 'reserve') ?? [];
  const balance = (id: string) => latest?.reserves.find((reserve) => reserve.categoryId === id)?.balance ?? 0;
  const categoryName = (id: string | null) => status?.categories.find((category) => category.id === id)?.name ?? '未指定';
  const disabled = loading || busy || !entitled || preview !== null;
  const monthIndex = months.findIndex((month) => month.month === targetMonth);
  const original = history.find((row) => row.id === originalId);
  const numericAmount = Number(amount);
  const needsAmount = mode === 'transfer' || mode === 'fund' || mode === 'correct';
  const canPreview = status?.latestMonth && reason.trim().length > 0 && (!needsAmount || (Number.isSafeInteger(numericAmount) && numericAmount > 0))
    && (mode !== 'transfer' || (from && to && from !== to)) && (mode !== 'fund' || to)
    && (mode !== 'correct' || monthIndex >= 0) && (mode !== 'reverse' || (original && reversible(original)))
    && (mode !== 'rollback' || months.length > 1);

  return <SafeAreaView style={styles.screen} edges={['bottom']}>
    <Stack.Screen options={{ title: '挪用與調整', headerBackTitle: '返回' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator accessibilityLabel="讀取調整資料中" /> : null}
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        {success ? <Text style={styles.success} accessibilityLiveRegion="polite">{success}</Text> : null}
        <Button title="重新讀取" secondary disabled={loading || busy} onPress={() => { setSuccess(null); setRetry((value) => value + 1); }} />
        {!loading && status ? <>
          <View style={styles.card}>
            <Text style={styles.heading}>{status.latestMonth ? `最近已結：${monthTitle(status.latestMonth)}` : '尚無已結月份'}</Text>
            {latest ? <><Text style={styles.note}>可用餘額 {amountText(latest.spare)} ／ 總儲備金 {amountText(latest.reserve)}</Text><Text style={styles.note}>帳面總資產 {amountText(latest.total)}</Text></> : <Text style={styles.note}>完成開帳與月結後，才能進行調整。</Text>}
            <Text style={styles.note}>每次調整都必須填寫原因、查看前後金額，再確認生效。調整保留獨立紀錄。</Text>
            {!entitled ? <Text style={styles.note}>目前付費內容為唯讀，可查看原有調整；需要有效的付費權益才能新增或修改。</Text> : null}
          </View>
          <View style={styles.chips}>{MODES.map((item) => <Chip key={item.id} title={item.title} selected={mode === item.id} disabled={busy || preview !== null} onPress={() => chooseMode(item.id)} />)}</View>
          {(mode === 'transfer' || mode === 'fund') ? <>
            <Text style={styles.note}>{mode === 'transfer' ? '只挪用最近已結月份的累積儲備，轉出類別必須有足夠儲備。' : '從最近已結月份的可用餘額補入使用中的儲備分類。'}帳面總資產與貸款／分期儲備不變。</Text>
            {mode === 'transfer' ? <View style={styles.field}><Text style={styles.label}>轉出分類</Text><View style={styles.chips}>{reserves.map((category) => <Chip key={category.id} title={`${category.name} ${formatAmount(balance(category.id))}`} selected={from === category.id} disabled={disabled} onPress={() => edit(() => setFrom(category.id))} />)}</View></View> : null}
            <View style={styles.field}><Text style={styles.label}>轉入分類</Text><View style={styles.chips}>{reserves.filter((category) => mode !== 'transfer' || category.id !== from).map((category) => <Chip key={category.id} title={`${category.name} ${formatAmount(balance(category.id))}`} selected={to === category.id} disabled={disabled} onPress={() => edit(() => setTo(category.id))} />)}</View></View>
            {reserves.length === 0 ? <Text style={styles.note}>尚無使用中的儲備分類，請先到「預算與分類」設定。</Text> : null}
          </> : null}
          {mode === 'correct' ? <View style={styles.field}>
            <Text style={styles.label}>被更正的已結月份</Text>
            <View style={styles.monthPicker}>
              <Button title="較早" secondary disabled={disabled || monthIndex <= 0} onPress={() => edit(() => setTargetMonth(months[monthIndex - 1].month))} />
              <Text style={styles.label}>{targetMonth ? monthTitle(targetMonth) : '尚無月份'}</Text>
              <Button title="較晚" secondary disabled={disabled || monthIndex < 0 || monthIndex >= months.length - 1} onPress={() => edit(() => setTargetMonth(months[monthIndex + 1].month))} />
            </View>
            <Text style={styles.note}>更正這個月的可用餘額，影響延續到之後所有已結月份。搬遷月缺上限或影響範圍有歷史差異時，帳本服務會拒絕並保留原數字。</Text>
            <View style={styles.chips}><Chip title="增加" selected={!negative} disabled={disabled} onPress={() => edit(() => setNegative(false))} /><Chip title="減少" selected={negative} disabled={disabled} onPress={() => edit(() => setNegative(true))} /></View>
          </View> : null}
          {mode === 'reverse' ? <View style={styles.field}>
            <Text style={styles.label}>選擇要沖銷的原調整</Text>
            {history.filter(reversible).length === 0 ? <Text style={styles.note}>沒有可沖銷的調整。待重結的原調整須先重結。</Text> : null}
            {[...history].reverse().filter(reversible).map((row) => <Pressable key={row.id} disabled={disabled} onPress={() => edit(() => setOriginalId(row.id))} accessibilityRole="button" accessibilityState={{ selected: originalId === row.id, disabled }} style={[styles.card, originalId === row.id && styles.selected]}>
              <Text style={styles.label}>{monthTitle(row.month)}・{actionTitle(row.kind)}・{amountText(row.amount)}</Text><Text style={styles.note}>{row.reason}</Text><Text style={styles.note}>{displayTime(row.time)}</Text>
            </Pressable>)}
            <Text style={styles.note}>沖銷會新增相反調整，保留原紀錄。挪用與補儲備仍受目前可退儲備限制。</Text>
          </View> : null}
          {mode === 'rollback' ? <View style={styles.card}>
            <Text style={styles.heading}>撤銷{status.latestMonth ? monthTitle(status.latestMonth) : '最近一次'}月結</Text>
            <Text style={styles.note}>只能撤銷最近一次月結，並保留期初基準。撤銷後該月交易解鎖，屬於該月的調整改為待重結；重新月結時恢復一次影響。</Text>
            {months.length < 2 ? <Text style={styles.note}>目前僅有期初基準，不能撤銷。</Text> : null}
          </View> : null}
          {needsAmount ? <View style={styles.field}><Text style={styles.label}>{mode === 'correct' ? '更正金額' : '調整金額'}（新台幣正整數）</Text><TextInput style={styles.input} accessibilityLabel="調整金額" keyboardType="number-pad" maxLength={10} editable={!disabled} value={amount} onChangeText={(value) => edit(() => setAmount(value.replace(/\D/g, '')))} placeholder="輸入金額" /></View> : null}
          <View style={styles.field}><Text style={styles.label}>原因（必填，1～300 字）</Text><TextInput style={[styles.input, styles.reason]} accessibilityLabel="調整原因" maxLength={300} multiline editable={!disabled} value={reason} onChangeText={(value) => edit(() => setReason(value))} placeholder="請說明這次調整的原因" /><Text style={styles.note}>{reason.length} / 300 字</Text></View>
          <Button title={busy ? '處理中…' : '預覽前後金額'} disabled={disabled || !canPreview} onPress={() => void showPreview()} />
          {preview ? <View style={styles.preview} onLayout={(event) => scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true })}>
            <Text style={styles.heading}>確認前預覽・{actionTitle(preview.request.command.action)}</Text>
            <Text style={styles.label}>原因：{preview.request.command.reason.trim()}</Text>
            {preview.request.command.action === 'rollback' ? <>
              <Text style={styles.note}>最近已結：{preview.result.latestBefore ? monthTitle(preview.result.latestBefore.month) : '無'} → {preview.result.latestAfter ? monthTitle(preview.result.latestAfter.month) : '無'}</Text>
              {preview.result.latestBefore && preview.result.latestAfter ? <Comparison before={preview.result.latestBefore} after={preview.result.latestAfter} /> : null}
              <Text style={styles.note}>這是撤銷前與撤銷後最近已結月份的資產；被撤月份重新成為開放月份。</Text>
            </> : preview.result.months.map((month) => <View key={month.month} style={styles.field}><Text style={styles.label}>{monthTitle(month.month)}</Text>{month.after ? <Comparison before={month.before} after={month.after} /> : <Text style={styles.note}>撤銷後此月尚未月結。</Text>}</View>)}
            {preview.result.pending.length > 0 ? <View style={styles.field}><Text style={styles.label}>儲存後待重結的調整</Text>{preview.result.pending.map((row) => <Text key={row.id} style={styles.note}>{monthTitle(row.month)}・{actionTitle(row.kind)}・{amountText(row.amount)}・{row.reason}</Text>)}</View> : null}
            <Button title="確認生效" disabled={busy || !entitled} onPress={() => void confirmPreview()} />
            <Button title="返回修改" secondary disabled={busy} onPress={() => { setPreview(null); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
          </View> : null}
          <View style={styles.links}><Button title="到預算與分類停用分類 ›" secondary disabled={busy} onPress={() => router.push('/budget-settings')} /><Button title="回月結精靈重新月結 ›" secondary disabled={busy} onPress={() => router.dismissTo('/(tabs)/close')} /></View>
          <Text style={styles.heading}>調整紀錄</Text>
          {history.length === 0 ? <Text style={styles.note}>尚無調整紀錄。</Text> : null}
          {[...history].reverse().map((row) => <View key={row.id} style={styles.card}>
            <Text style={styles.label}>{monthTitle(row.month)}・{actionTitle(row.kind)}・{amountText(row.amount)}</Text>
            {row.from || row.to ? <Text style={styles.note}>{row.kind === 'fund' && row.amount < 0
              ? `${categoryName(row.to)} → 可用餘額`
              : `${row.from ? categoryName(row.from) : '可用餘額'} → ${categoryName(row.to)}`}</Text> : null}
            <Text style={styles.label}>原因：{row.reason}</Text>
            <Text style={styles.note}>{displayTime(row.time)}（台北時間）</Text>
            <Text style={styles.note}>{[row.reverses ? '沖銷紀錄' : row.reversed ? '已沖銷' : '未沖銷', row.pending ? '待重結' : '已生效'].join('・')}</Text>
            {reversible(row) ? <Button title="沖銷這筆調整" secondary disabled={disabled} onPress={() => chooseReversal(row)} /> : null}
          </View>)}
        </> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Comparison({ before, after }: { before: BudgetMonthView; after: BudgetMonthView }) {
  const categories = [...new Set([...before.reserves.map((row) => row.categoryId), ...after.reserves.map((row) => row.categoryId)])];
  return <View style={styles.field}>
    {([['當月收入', before.income, after.income], ['當月盈餘', before.surplus, after.surplus], ['可用餘額', before.spare, after.spare], ['貸款／分期儲備', before.tuition, after.tuition], ['總儲備金', before.reserve, after.reserve], ['帳面總資產', before.total, after.total]] as const).map(([label, old, next]) => <Text key={label} style={styles.note}>{label}：{amountText(old)} → {amountText(next)}</Text>)}
    {categories.map((id) => {
      const old = before.reserves.find((row) => row.categoryId === id);
      const next = after.reserves.find((row) => row.categoryId === id);
      return <Text key={id} style={styles.note}>{next?.name ?? old?.name ?? '歷史分類'}儲備：{amountText(old?.balance ?? 0)} → {amountText(next?.balance ?? 0)}</Text>;
    })}
  </View>;
}

function Chip({ title, selected, disabled, onPress }: { title: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }} style={[styles.chip, selected && styles.selected, disabled && { opacity: 0.45 }]}><Text style={{ color: selected ? colors.accent : colors.text }}>{title}</Text></Pressable>;
}

function Button({ title, disabled, onPress, secondary = false }: { title: string; disabled: boolean; onPress: () => void; secondary?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.button, { backgroundColor: secondary ? colors.surface : colors.accent }, disabled && { opacity: 0.45 }]}><Text style={{ color: secondary ? colors.accent : '#fff', fontSize: 15, fontWeight: '600' }}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 18 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  label: { color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  error: { color: colors.expense, lineHeight: 22 },
  success: { color: colors.income, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 10 },
  field: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 10, backgroundColor: colors.surface },
  selected: { borderWidth: 1, borderColor: colors.accent },
  monthPicker: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, minHeight: 46, color: colors.text, fontSize: 16 },
  reason: { minHeight: 88, textAlignVertical: 'top' },
  button: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 10, padding: 12 },
  preview: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 14, gap: 16 },
  links: { gap: 8 },
});
