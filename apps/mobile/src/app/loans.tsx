import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidMonth } from '../calc/dates.ts';
import type { BudgetStatus, LoanInput, LoanRevision, LoanView, LoanWriteRequest } from '../ledger/index.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { LoanCards } from '../ui/LoanCards.tsx';
import { closeErrorMessage } from '../ui/MonthlyCloseSummary.tsx';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { colors } from '../ui/theme.ts';

interface FormFields { name: string; totalAmount: string; monthlyPayment: string; remainingPrincipal: string; expectedEndMonth: string; reason: string }
const EMPTY: FormFields = { name: '', totalAmount: '', monthlyPayment: '', remainingPrincipal: '', expectedEndMonth: '', reason: '' };
const FIELDS: { key: keyof FormFields; label: string; numeric?: boolean; placeholder?: string }[] = [
  { key: 'name', label: '名稱', placeholder: '例如：車貸' },
  { key: 'totalAmount', label: '總額（元）', numeric: true },
  { key: 'monthlyPayment', label: '每月繳款（元）', numeric: true },
  { key: 'remainingPrincipal', label: '剩餘本金（元）', numeric: true },
  { key: 'expectedEndMonth', label: '預計結清月份', placeholder: 'YYYY-MM' },
  { key: 'reason', label: '設定原因（必填）', placeholder: '請填寫這次新增或修改的原因' },
];

export default function LoansScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormFields>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<LoanWriteRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyLoan, setHistoryLoan] = useState<number | null>(null);
  const [history, setHistory] = useState<LoanRevision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequest = useRef(0);
  const savingRef = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollIntent = useRef<'form' | 'preview' | null>(null);
  const hasEntitlement = hasMonthlyCloseEntitlement();
  const readOnly = loading || saving || !hasEntitlement || status === null;

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    setFormOpen(false);
    setHistoryLoan(null);
    setHistoryLoading(false);
    historyRequest.current += 1;
    Promise.all([ledger.listLoans(), ledger.getBudgetStatus()]).then(([result, current]) => {
      if (cancelled) return;
      setLoans(result);
      setStatus(current);
      setLoading(false);
    }, (e: unknown) => {
      if (cancelled) return;
      setStatus(null);
      setLoading(false);
      setError(closeErrorMessage(e));
    });
    return () => { cancelled = true; historyRequest.current += 1; };
  }, [ledger, retry]));

  function edit(loan: LoanView | null) {
    scrollIntent.current = 'form';
    setEditingId(loan?.id ?? null);
    setForm(loan ? {
      name: loan.name,
      totalAmount: loan.totalAmount === null ? '' : String(loan.totalAmount),
      monthlyPayment: String(loan.monthlyPayment),
      remainingPrincipal: loan.remainingPrincipal === null ? '' : String(loan.remainingPrincipal),
      expectedEndMonth: loan.expectedEndMonth ?? '',
      reason: '',
    } : EMPTY);
    setFormOpen(true);
    setPreview(null);
    setError(null);
  }

  async function showHistory(id: number) {
    const requestId = ++historyRequest.current;
    setHistoryLoan(id);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const result = await ledger.listLoanRevisions(id);
      if (requestId === historyRequest.current) setHistory(result);
    } catch (e) {
      if (requestId === historyRequest.current) setHistoryError(closeErrorMessage(e));
    } finally {
      if (requestId === historyRequest.current) setHistoryLoading(false);
    }
  }

  function prepare() {
    if (readOnly || !status) return;
    setError(null);
    const amount = (text: string) => /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
    const input: LoanInput = { name: form.name.trim(), totalAmount: amount(form.totalAmount), monthlyPayment: amount(form.monthlyPayment),
      remainingPrincipal: amount(form.remainingPrincipal), expectedEndMonth: form.expectedEndMonth.trim() };
    if (!input.name || input.name.length > 50) { setError('請填寫 1～50 字的貸款名稱。'); return; }
    if (![input.totalAmount, input.monthlyPayment, input.remainingPrincipal].every(Number.isSafeInteger)
      || input.totalAmount <= 0 || input.monthlyPayment <= 0 || input.remainingPrincipal < 0 || input.remainingPrincipal > input.totalAmount) {
      setError('總額與每月繳款請填正整數；剩餘本金請填 0 到總額之間的整數。'); return;
    }
    if (input.monthlyPayment > 1_000_000) { setError('每月繳款須為 1～1,000,000 元的整數。'); return; }
    if (!isValidMonth(input.expectedEndMonth)) { setError('預計結清月份請用 YYYY-MM，例如 2027-06。'); return; }
    const reason = form.reason.trim();
    if (!reason || reason.length > 300) { setError('請填寫 1～300 字的設定原因。'); return; }
    Keyboard.dismiss();
    scrollIntent.current = 'preview';
    setPreview({ ...input, reason, version: status.version, hasEntitlement });
  }

  async function save() {
    if (readOnly || !preview || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let saved = false;
    try {
      const input = { ...preview, hasEntitlement: hasMonthlyCloseEntitlement() };
      if (editingId === null) await ledger.createLoan(input);
      else await ledger.updateLoan(editingId, input);
      saved = true;
      setFormOpen(false);
      setPreview(null);
      setHistoryLoan(null);
      historyRequest.current += 1;
      const [result, current] = await Promise.all([ledger.listLoans(), ledger.getBudgetStatus()]);
      setLoans(result);
      setStatus(current);
    } catch (e) {
      setPreview(null);
      setStatus(null);
      setError(saved ? '貸款已儲存，但資料讀取失敗，請重新讀取。' : closeErrorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <SafeAreaView style={styles.screen} edges={['bottom']}>
    <Stack.Screen options={{ title: '貸款／分期' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} onContentSizeChange={() => {
        if (scrollIntent.current === 'preview') scroll.current?.scrollToEnd({ animated: true });
        else if (scrollIntent.current === 'form') scroll.current?.scrollTo({ y: 0, animated: true });
        scrollIntent.current = null;
      }}>
        <Text style={styles.note}>{status ? `設定從開放月份 ${monthTitle(status.openMonth)}生效；已結月份保留當時快照。` : '讀取貸款設定後即可查看開放月份。'}</Text>
        <Text style={styles.note}>月結時自動提撥；繳款請到記帳新增一筆支出，分類選這筆貸款。儲備與剩餘本金在月結完成後扣減。</Text>
        {!hasEntitlement ? <Text style={styles.note}>目前沒有有效的付費權益，貸款資料僅供檢視。</Text> : null}
        {loading ? <ActivityIndicator accessibilityLabel="讀取貸款中" /> : null}
        {!loading && !formOpen ? <>
          <LoanCards loans={loans} onEdit={hasEntitlement ? edit : undefined} disabled={readOnly} />
          {hasEntitlement ? <Pressable onPress={() => edit(null)} disabled={readOnly} accessibilityRole="button" accessibilityState={{ disabled: readOnly }} style={{ paddingVertical: 12 }}>
            <Text style={styles.link}>＋ 新增貸款／分期</Text>
          </Pressable> : null}
          {loans.length > 0 ? <View style={{ gap: 12 }}>
            <Text style={styles.heading}>設定紀錄</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {loans.map((loan) => <Pressable key={loan.id} onPress={() => showHistory(loan.id)} disabled={saving}
                accessibilityRole="button" accessibilityLabel={`查看${loan.name}設定紀錄`} accessibilityState={{ selected: historyLoan === loan.id }} style={{ paddingVertical: 8 }}>
                <Text style={styles.link}>{loan.name} ›</Text>
              </Pressable>)}
            </View>
            {historyLoading ? <ActivityIndicator accessibilityLabel="讀取貸款設定紀錄中" /> : null}
            {historyError ? <Text style={styles.error} accessibilityRole="alert">{historyError}請再點貸款名稱重試。</Text> : null}
            {historyLoan !== null && !historyLoading && !historyError ? history.map((revision) => <View key={revision.id} style={styles.preview}>
              <Text style={styles.label}>{revision.monthlyPayment === null ? '舊學費承接' : `${monthTitle(revision.month)}起`}・{revision.name}</Text>
              <Text style={styles.note}>總額 {revision.totalAmount === null ? '待補資料' : `${formatAmount(revision.totalAmount)} 元`}・每月 {revision.monthlyPayment === null ? '沿用舊提撥' : `${formatAmount(revision.monthlyPayment)} 元`}</Text>
              <Text style={styles.note}>宣告剩餘本金 {revision.remainingPrincipal === null ? '待補資料' : `${formatAmount(revision.remainingPrincipal)} 元`}・結清 {revision.expectedEndMonth === null ? '待補資料' : monthTitle(revision.expectedEndMonth)}</Text>
              <Text style={styles.label}>原因：{revision.reason}</Text>
              <Text style={styles.note}>{revision.time ? `設定時間：${revision.time}` : '舊資料未保存設定時間'}</Text>
            </View>) : null}
          </View> : null}
        </> : null}
        {formOpen ? <View style={{ gap: 16 }}>
          <Text style={styles.heading}>{editingId === null ? '新增貸款／分期' : '修改貸款／分期'}</Text>
          {FIELDS.map((field) => <View key={field.key} style={{ gap: 4 }}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput value={form[field.key]} onChangeText={(text) => { setForm((old) => ({ ...old, [field.key]: text })); setPreview(null); }}
              keyboardType={field.numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false}
              placeholder={field.placeholder} accessibilityLabel={field.label} editable={!readOnly}
              multiline={field.key === 'reason'}
              maxLength={field.key === 'reason' ? 300 : field.key === 'name' ? 50 : field.key === 'expectedEndMonth' ? 7 : 16} style={styles.input} />
          </View>)}
          <Text style={styles.note}>剩餘本金請填實際尚未償還的金額；累積儲備會保留。結清月份是規劃，停止提撥以剩餘本金歸零為準。</Text>
          {preview ? <View style={styles.preview}>
            <Text style={styles.heading}>確認這次設定</Text>
            <Text style={styles.label}>{preview.name}</Text>
            <Text style={styles.label}>總額 {formatAmount(preview.totalAmount)} 元・每月 {formatAmount(preview.monthlyPayment)} 元</Text>
            <Text style={styles.label}>剩餘本金 {formatAmount(preview.remainingPrincipal)} 元</Text>
            <Text style={styles.label}>預計 {monthTitle(preview.expectedEndMonth)}結清</Text>
            <Text style={styles.label}>原因：{preview.reason}</Text>
            <Text style={styles.note}>確認儲存後從開放月份生效。</Text>
          </View> : null}
          <Pressable onPress={() => { setFormOpen(false); setPreview(null); setError(null); }} disabled={saving} accessibilityRole="button" style={{ alignSelf: 'center', padding: 10 }}>
            <Text style={styles.note}>取消修改</Text>
          </Pressable>
        </View> : null}
        {error ? <View style={{ gap: 6 }}>
          <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          <Pressable onPress={() => setRetry((value) => value + 1)} disabled={saving} accessibilityRole="button" style={{ paddingVertical: 10 }}>
            <Text style={styles.link}>重新讀取</Text>
          </Pressable>
        </View> : null}
      </ScrollView>
      {formOpen && hasEntitlement ? <Pressable onPress={preview ? save : prepare} disabled={readOnly} accessibilityRole="button"
        accessibilityState={{ disabled: readOnly }} style={[styles.button, readOnly && { opacity: 0.5 }]}>
        <Text style={styles.buttonText}>{saving ? '儲存中…' : preview ? '確認儲存' : '預覽設定'}</Text>
      </Pressable> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '600' },
  label: { color: colors.text, fontSize: 15, lineHeight: 22 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  link: { color: colors.accent, fontSize: 16 },
  input: { color: colors.text, fontSize: 19, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
  preview: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  error: { color: colors.expense, lineHeight: 22 },
  button: { margin: 16, padding: 15, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
