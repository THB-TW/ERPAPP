// 設定 → 提醒。規則與設定驗證由帳本服務提供，這頁只收集設定、顯示待排清單。
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Account, LoanView, NotificationSettings, PlannedNotification } from '../ledger/index.ts';
import { NotificationSettingsError } from '../ledger/index.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { taipeiDateTime } from '../ui/backupText.ts';
import { hasMonthlyCloseEntitlement, useHasPaidAccess } from '../ui/closeEntitlement.ts';
import { userMessage } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

type ReminderKind = keyof NotificationSettings['enabled'];
interface Form {
  settings: NotificationSettings;
  payday: string;
  monthlyCloseDay: string;
  creditCardClosingDay: string;
  cardDays: Record<number, string>;
  loanDays: Record<number, string>;
}
const REMINDERS: { kind: ReminderKind; title: string; hint: string; paid?: boolean }[] = [
  { kind: 'entry', title: '每日記帳', hint: '每天在指定時間提醒記錄交易。' },
  { kind: 'budgetOverrun', title: '預算超支', hint: '分類實支超過預算上限時提醒。' },
  { kind: 'backupAfterClose', title: '月結後備份', hint: '月結完成且尚未備份時提醒。' },
  { kind: 'backupOverdue', title: '超過 35 天未備份', hint: '提醒匯出整本帳的備份檔。' },
  { kind: 'monthlyClose', title: '月結提醒', hint: '到了月結日，提醒尚未完成的月結。', paid: true },
  { kind: 'creditCardStatement', title: '信用卡帳單未匯入', hint: '結帳日後，已確認尚未匯入的帳單才提醒。', paid: true },
  { kind: 'loanPayment', title: '貸款繳款', hint: '每筆貸款繳款日前一天提醒。', paid: true },
];

function editForm(settings: NotificationSettings): Form {
  return {
    settings,
    payday: String(settings.payday),
    monthlyCloseDay: String(settings.monthlyCloseDay),
    creditCardClosingDay: String(settings.creditCardClosingDay),
    cardDays: Object.fromEntries(settings.creditCardClosingDays.map((row) => [row.accountId, String(row.day)])),
    loanDays: Object.fromEntries(settings.loanDueDays.map((row) => [row.loanId, String(row.day)])),
  };
}

/** 空白的個別日期代表沿用預設（信用卡）或不提醒（貸款）。格式由帳本服務統一驗證。 */
function formSettings(form: Form): NotificationSettings {
  const day = (value: string) => /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  return {
    ...form.settings,
    payday: day(form.payday),
    monthlyCloseDay: day(form.monthlyCloseDay),
    creditCardClosingDay: day(form.creditCardClosingDay),
    creditCardClosingDays: Object.entries(form.cardDays).filter(([, value]) => value.trim() !== '')
      .map(([id, value]) => ({ accountId: Number(id), day: day(value) })),
    loanDueDays: Object.entries(form.loanDays).filter(([, value]) => value.trim() !== '')
      .map(([id, value]) => ({ loanId: Number(id), day: day(value) })),
  };
}

export default function NotificationsScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [form, setForm] = useState<Form | null>(null);
  const [cards, setCards] = useState<Account[]>([]);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [plan, setPlan] = useState<PlannedNotification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const busyRef = useRef(false);
  const hasEntitlement = useHasPaidAccess();
  const disabled = loading || busy !== null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([ledger.getNotificationSettings(), ledger.listAccounts(), ledger.listLoans()]).then(
      ([settings, accounts, currentLoans]) => {
        if (cancelled) return;
        setForm(editForm(settings));
        setCards(accounts.filter((account) => account.kind === 'credit_card' && account.active));
        setLoans(currentLoans);
        setPlan(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setForm(null);
        setLoading(false);
        setError(userMessage(e, '讀取提醒設定失敗，請重新讀取。'));
      },
    );
    return () => { cancelled = true; };
  }, [ledger, retry]);

  const change = useCallback((edit: (current: Form) => Form) => {
    setForm((current) => current ? edit(current) : current);
    setPlan(null);
    setMessage(null);
    setError(null);
  }, []);

  async function run(action: 'save' | 'preview') {
    if (!form || busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    setMessage(null);
    Keyboard.dismiss();
    let saved = false;
    try {
      const settings = formSettings(form);
      if (action === 'save') {
        await ledger.saveNotificationSettings(settings);
        saved = true;
        setForm(editForm(settings));
      }
      // 帳單資料尚未接入，省略 statementImports，未知的卡片期別不會提醒。
      const notifications = await ledger.getNotificationPlan({
        now: new Date(), settings, hasEntitlement: hasMonthlyCloseEntitlement(),
      });
      setPlan(notifications);
      if (action === 'save') {
        const result = await syncNotifications(ledger, { requestPermission: true });
        if (result.permission === 'unsupported') setMessage('設定已儲存。此裝置目前無法使用系統通知。');
        else if (result.permission === 'denied') setMessage('設定已儲存。系統通知權限未開啟，App 仍可正常使用。');
        else if (result.permission === 'undetermined') setMessage('設定已儲存。目前沒有待排通知，尚未要求系統通知權限。');
        else setMessage(`設定已儲存，已套用 ${result.scheduled} 則待排通知。`);
      }
    } catch (e) {
      setError(e instanceof NotificationSettingsError ? e.message
        : userMessage(e, saved ? '設定已儲存，但未能更新通知清單，請再試一次。' : '提醒設定未完成，請檢查欄位後再試。'));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  return <SafeAreaView style={styles.screen} edges={['bottom']}>
    <Stack.Screen options={{ title: '提醒設定', headerBackTitle: '返回' }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.heading}>本機通知</Text>
          <Text style={styles.note}>儲存並套用時，若有待排提醒才會要求通知權限；拒絕後仍可正常記帳。回到 App 時會更新接下來的排程。</Text>
          <Text style={styles.note}>通知內容不顯示金額、帳戶名稱或貸款名稱。</Text>
        </View>
        {loading ? <ActivityIndicator accessibilityLabel="讀取提醒設定中" /> : null}
        {form ? <>
          <View style={styles.card}>
            <Text style={styles.heading}>個別開關</Text>
            {REMINDERS.map((reminder) => <View key={reminder.kind} style={styles.reminder}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.label}>{reminder.title}{reminder.paid ? '（付費）' : ''}</Text>
                <Text style={styles.note}>{reminder.hint}</Text>
              </View>
              <Switch value={form.settings.enabled[reminder.kind]} disabled={disabled}
                accessibilityLabel={reminder.title}
                onValueChange={(value) => change((current) => ({ ...current,
                  settings: { ...current.settings, enabled: { ...current.settings.enabled, [reminder.kind]: value } },
                }))} />
            </View>)}
            {!hasEntitlement ? <Text style={styles.note}>目前沒有有效的付費權益，月結、帳單與貸款提醒不會列入待排清單；設定會保留。</Text> : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>時間與日期</Text>
            <Text style={styles.note}>以台北時間計算；每日記帳使用下方時間，月結、帳單與貸款提醒為上午 09:00。超支、月結後備份與已逾期的提醒會立即列入。日期填 1～31，短月以月底為準。</Text>
            <Text style={styles.note}>從未備份時，由首次儲存提醒設定起算 35 天；之後編輯設定不會延後起算日。</Text>
            <Field label="每日記帳時間" value={form.settings.entryTime} placeholder="HH:mm，例如 21:00" disabled={disabled}
              onChangeText={(value) => change((current) => ({ ...current, settings: { ...current.settings, entryTime: value } }))} />
            <Field label="每月發薪日" value={form.payday} numeric disabled={disabled}
              onChangeText={(value) => change((current) => ({ ...current, payday: value }))} />
            <Field label="每月月結提醒日" value={form.monthlyCloseDay} numeric disabled={disabled}
              onChangeText={(value) => change((current) => ({ ...current, monthlyCloseDay: value }))} />
            <Field label="信用卡預設結帳日" value={form.creditCardClosingDay} numeric disabled={disabled}
              onChangeText={(value) => change((current) => ({ ...current, creditCardClosingDay: value }))} />
            <Text style={styles.note}>發薪日只保存為個人設定，沒有另外的發薪通知。</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>各張信用卡結帳日</Text>
            <Text style={styles.note}>留空沿用預設結帳日。目前帳單匯入狀態尚未接入，視為未知，暫時不產生帳單提醒。</Text>
            {cards.length ? cards.map((card) => <Field key={card.id} label={card.name}
              value={form.cardDays[card.id] ?? ''} placeholder={`沿用 ${form.creditCardClosingDay} 日`} numeric disabled={disabled}
              onChangeText={(value) => change((current) => ({ ...current, cardDays: { ...current.cardDays, [card.id]: value } }))} />)
              : <Text style={styles.note}>尚無使用中的信用卡帳戶。</Text>}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>各筆貸款繳款日</Text>
            <Text style={styles.note}>在繳款日前一天提醒；留空不提醒。已結清或尚待補設定的貸款不會提醒。</Text>
            {loans.length ? loans.map((loan) => <Field key={loan.id} label={loan.name}
              value={form.loanDays[loan.id] ?? ''} placeholder="未設定" numeric disabled={disabled}
              onChangeText={(value) => change((current) => ({ ...current, loanDays: { ...current.loanDays, [loan.id]: value } }))} />)
              : <Text style={styles.note}>尚無貸款／分期。</Text>}
          </View>
          <Pressable onPress={() => { void run('preview'); }} disabled={disabled} accessibilityRole="button"
            accessibilityState={{ disabled, busy: busy === 'preview' }} style={[styles.secondaryButton, disabled && { opacity: 0.5 }]}>
            <Text style={styles.link}>{busy === 'preview' ? '讀取中…' : '預覽未來 30 天提醒'}</Text>
          </Pressable>
          {plan !== null ? <View style={styles.card}>
            <Text style={styles.heading}>待排提醒（{plan.length} 則）</Text>
            <Text style={styles.note}>這是依目前設定與帳本狀態計算的清單；實際送達以系統權限與套用結果為準。</Text>
            {plan.length ? plan.map((notification) => <View key={notification.id} style={{ gap: 2, paddingVertical: 8 }}>
              <Text style={styles.label}>{notification.title}</Text>
              <Text style={styles.note}>{taipeiDateTime(notification.fireAt)}（台北時間）</Text>
              <Text style={styles.note}>{notification.body}</Text>
            </View>) : <Text style={styles.note}>目前沒有待排提醒。</Text>}
          </View> : null}
        </> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        {!loading && !form ? <Pressable onPress={() => setRetry((value) => value + 1)} accessibilityRole="button" style={styles.secondaryButton}>
          <Text style={styles.link}>重新讀取</Text>
        </Pressable> : null}
      </ScrollView>
      {form ? <Pressable onPress={() => { void run('save'); }} disabled={disabled} accessibilityRole="button"
        accessibilityState={{ disabled, busy: busy === 'save' }} style={[styles.button, disabled && { opacity: 0.5 }]}>
        <Text style={styles.buttonText}>{busy === 'save' ? '儲存中…' : '儲存並套用提醒設定'}</Text>
      </Pressable> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Field(props: { label: string; value: string; onChangeText: (text: string) => void; disabled: boolean; numeric?: boolean; placeholder?: string }) {
  return <View style={{ gap: 4 }}>
    <Text style={styles.label}>{props.label}</Text>
    <TextInput value={props.value} onChangeText={props.onChangeText} editable={!props.disabled}
      accessibilityLabel={props.label} keyboardType={props.numeric ? 'number-pad' : 'default'}
      autoCapitalize="none" autoCorrect={false} placeholder={props.placeholder} placeholderTextColor={colors.muted}
      maxLength={props.numeric ? 2 : 5} style={styles.input} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: 12, gap: 12 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '600' },
  label: { color: colors.text, fontSize: 15, lineHeight: 22 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  input: { color: colors.text, fontSize: 18, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
  link: { color: colors.accent, fontSize: 16 },
  secondaryButton: { paddingVertical: 12, alignItems: 'center' },
  error: { color: colors.expense, lineHeight: 22 },
  success: { color: colors.income, lineHeight: 22 },
  button: { margin: 16, padding: 15, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
