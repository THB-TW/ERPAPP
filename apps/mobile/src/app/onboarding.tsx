import { Stack, router, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BudgetRuleError, LedgerError, type Account, type Category, type Flow } from '../ledger/index.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

class InputError extends Error {}

type Step = 'choice' | 'categories' | 'balances' | 'income' | 'budget';
type Kind = 'reserve' | 'fixed' | 'actual';
type BudgetRow = {
  categoryId: number; name: string; kind: Kind; amount: string;
  averageExpense: number | null; incomeRatio: number | null; confirmed: boolean;
};
const GROUPS: { value: Kind; label: string }[] = [
  { value: 'reserve', label: '儲備類' }, { value: 'fixed', label: '固定支出' }, { value: 'actual', label: '照實支' },
];

function integer(text: string, label: string, signed = false): number {
  const value = text.trim();
  const result = (signed ? /^-?\d+$/ : /^\d+$/).test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(result)) throw new InputError(`「${label}」請填入${signed ? '' : '大於或等於 0 的'}整數（新台幣元）。`);
  return result;
}

export default function OnboardingScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [step, setStep] = useState<Step>('choice');
  const [moving, setMoving] = useState(false);
  const [months, setMonths] = useState<{ current: string; previous: string } | null>(null);
  const [openingMonth, setOpeningMonth] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [deployed, setDeployed] = useState('0');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryFlow, setCategoryFlow] = useState<Flow>('expense');
  const [income, setIncome] = useState('');
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [historyMonths, setHistoryMonths] = useState<string[]>([]);
  const [suggestionSource, setSuggestionSource] = useState<'income' | 'history'>('income');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const storedBalances = useRef(new Map<number, number>());
  const scroll = useRef<ScrollViewInstance>(null);
  const focused = useRef(false);
  const [reload, setReload] = useState(0);

  // 從 CSV 或帳戶管理返回時只刷新清單，保留使用者的步驟與尚未提交的輸入。
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    focused.current = true;
    setLoaded(false);
    setError(null);
    Promise.all([ledger.getOnboardingStatus(), ledger.listAccounts(), ledger.listCategories()]).then(
      ([status, nextAccounts, nextCategories]) => {
        if (cancelled) return;
        if (status.completed) {
          router.replace('/(tabs)');
          return;
        }
        setMonths({ current: status.currentMonth, previous: status.previousMonth });
        setOpeningMonth((previous) => previous === status.currentMonth || previous === status.previousMonth ? previous : status.currentMonth);
        setAccounts(nextAccounts);
        const previouslyStored = storedBalances.current;
        setBalances((previous) => Object.fromEntries(nextAccounts.map((account) => {
          // 帳戶管理已儲存的新值優先；未在管理頁變動的帳戶保留本頁尚未提交的輸入。
          const changed = previouslyStored.has(account.id) && previouslyStored.get(account.id) !== account.openingBalance;
          return [account.id, changed ? String(account.openingBalance) : previous[account.id] ?? String(account.openingBalance)];
        })));
        storedBalances.current = new Map(nextAccounts.map((account) => [account.id, account.openingBalance]));
        setCategories(nextCategories);
        setLoaded(true);
      },
      () => {
        if (!cancelled) setError('無法讀取開帳資料，請重試。');
      },
    );
    return () => { cancelled = true; focused.current = false; };
  }, [ledger, reload]));

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);

  async function perform(task: () => Promise<void>) {
    if (inFlight.current || !loaded) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    try { await task(); }
    catch (e: unknown) {
      if (focused.current) {
        setError(e instanceof LedgerError || e instanceof BudgetRuleError || e instanceof InputError ? e.message : '操作失敗，請再試一次。');
        scroll.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      inFlight.current = false;
      if (focused.current) setBusy(false);
    }
  }

  function chooseMode(isMoving: boolean) {
    setMoving(isMoving);
    setError(null);
    setStep(isMoving ? 'categories' : 'balances');
  }

  function addCategory() {
    void perform(async () => {
      await ledger.addOpeningCategory({ name: categoryName, flow: categoryFlow });
      const next = await ledger.listCategories();
      if (!focused.current) return;
      setCategories(next);
      setCategoryName('');
      setBudgetRows([]);
    });
  }

  function checkBalances() {
    for (const account of accounts) integer(balances[account.id] ?? '', account.name, true);
    integer(deployed, '期初投入額');
  }

  function suggest(requireIncome: boolean) {
    void perform(async () => {
      checkBalances();
      const suggestion = await ledger.getOpeningBudgetSuggestions(requireIncome ? { monthlyIncome: integer(income, '月收入') } : {});
      if (!focused.current) return;
      if (suggestion.source === 'income' && !requireIncome) {
        setStep('income');
        return;
      }
      setSuggestionSource(suggestion.source);
      setHistoryMonths(suggestion.months);
      setBudgetRows(suggestion.rows.map((row) => ({ ...row, amount: String(row.amount), confirmed: false })));
      setStep('budget');
    });
  }

  function editBudget(id: number, changes: Partial<BudgetRow>) {
    setBudgetRows((previous) => previous.map((row) => row.categoryId === id ? { ...row, ...changes, confirmed: false } : row));
    setError(null);
  }

  function confirmBudget(row: BudgetRow) {
    try {
      const amount = integer(row.amount, `${row.name}上限`);
      if (amount > 1000000) throw new InputError('每項預算上限最高為 1,000,000 元，請修改後確認。');
      setBudgetRows((previous) => previous.map((item) => item.categoryId === row.categoryId ? { ...item, confirmed: true } : item));
      setError(null);
    } catch (e) {
      setError(e instanceof InputError ? e.message : '請檢查預算上限。');
      scroll.current?.scrollTo({ y: 0, animated: true });
    }
  }

  function finish() {
    void perform(async () => {
      checkBalances();
      if (budgetRows.some((row) => !row.confirmed)) throw new InputError('請逐項確認所有預算。');
      await ledger.completeOnboarding({
        openingDate: `${openingMonth}-01`, openingDeployed: integer(deployed, '期初投入額'),
        accounts: accounts.map((account) => ({ id: account.id, openingBalance: integer(balances[account.id] ?? '', account.name, true) })),
        budgets: budgetRows.map((row) => ({ categoryId: row.categoryId, kind: row.kind, amount: row.kind === 'actual' ? 0 : integer(row.amount, `${row.name}上限`) })),
      });
      if (focused.current) router.replace('/(tabs)');
    });
  }

  function back() {
    setError(null);
    if (step === 'categories') setStep('choice');
    else if (step === 'balances') setStep(moving ? 'categories' : 'choice');
    else if (step === 'income') setStep('balances');
    else setStep(suggestionSource === 'income' ? 'income' : 'balances');
  }

  const disabled = busy || !loaded;
  const confirmedCount = budgetRows.filter((row) => row.confirmed).length;
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: '開始記帳', headerBackVisible: false, gestureEnabled: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {!loaded ? <ActivityIndicator accessibilityLabel="正在讀取開帳資料" /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {!loaded && error ? <Action label="重新讀取" onPress={() => setReload((value) => value + 1)} /> : null}

          {loaded && step === 'choice' ? (
            <>
              <Text style={styles.title}>開始你的帳本</Text>
              <Text style={styles.hint}>設定開帳日、帳戶餘額與預算，就能開始記帳。開帳與 CSV 匯入全程免費。</Text>
              <Action label="其他 App 搬家（匯入 CSV）" disabled={disabled} onPress={() => chooseMode(true)} />
              <Action label="從零開始" disabled={disabled} onPress={() => chooseMode(false)} secondary />
              <Pressable accessibilityRole="link" disabled={disabled} onPress={() => router.push('/settings-backup')} style={{ paddingVertical: 12, alignSelf: 'center' }}><Text style={{ color: colors.accent }}>已有備份檔？還原帳本</Text></Pressable>
            </>
          ) : null}

          {loaded && step === 'categories' ? (
            <>
              <Text style={styles.title}>先準備 CSV 的分類</Text>
              <Text style={styles.hint}>下方預設分類可以直接使用。CSV 裡有其他分類時，請先依原名稱新增，再進入匯入；分類不會自動建立。</Text>
              <Text style={styles.label}>支出分類</Text>
              <Text style={styles.text}>{categories.filter((category) => category.flow === 'expense').map((category) => category.name).join('、') || '尚無支出分類'}</Text>
              <Text style={styles.label}>收入分類</Text>
              <Text style={styles.text}>{categories.filter((category) => category.flow === 'income').map((category) => category.name).join('、') || '尚無收入分類'}</Text>
              <View style={styles.card}>
                <Field label="新增分類名稱" value={categoryName} onChangeText={setCategoryName} editable={!disabled} onCard />
                <View style={styles.choices}>
                  <Choice label="支出" selected={categoryFlow === 'expense'} disabled={disabled} onPress={() => setCategoryFlow('expense')} onCard />
                  <Choice label="收入" selected={categoryFlow === 'income'} disabled={disabled} onPress={() => setCategoryFlow('income')} onCard />
                </View>
                <Action label="確認新增分類" disabled={disabled || !categoryName.trim()} onPress={addCategory} secondary onCard />
              </View>
              <Action label="分類已準備好，前往匯入 CSV" disabled={disabled} onPress={() => router.push('/csv-import')} />
              <Text style={styles.hint}>匯入完成後按左上角返回，再繼續開帳。若有未知分類，返回這裡新增後重新匯入同一份 CSV，已成功的交易會略過。</Text>
              <Action label="繼續設定開帳日與餘額" disabled={disabled} onPress={() => setStep('balances')} secondary />
            </>
          ) : null}

          {loaded && step === 'balances' && months ? (
            <>
              <Text style={styles.title}>從哪一天開始算帳？</Text>
              <Text style={styles.hint}>開帳日以前的交易保留供明細與平均使用，不參與月結或帳戶餘額。</Text>
              <View style={styles.choices}>
                <Choice label={`${monthTitle(months.current)} 1 日（本月）`} selected={openingMonth === months.current} disabled={disabled} onPress={() => setOpeningMonth(months.current)} />
                <Choice label={`${monthTitle(months.previous)} 1 日（上月）`} selected={openingMonth === months.previous} disabled={disabled} onPress={() => setOpeningMonth(months.previous)} />
              </View>
              <Text style={styles.label}>各帳戶在 {openingMonth}-01 當天的開帳餘額</Text>
              <Text style={styles.hint}>信用卡請填尚未繳清的負數，例如未繳 500 元填 -500。沒有餘額填 0。</Text>
              {accounts.map((account) => (
                <Field key={account.id} label={`${account.name}${account.kind === 'credit_card' ? '（信用卡未繳金額填負數）' : ''}${account.active ? '' : '（已停用）'}`} value={balances[account.id] ?? ''} onChangeText={(value) => setBalances((previous) => ({ ...previous, [account.id]: value }))} editable={!disabled} numeric signed />
              ))}
              <Action label="新增或管理帳戶" disabled={disabled} onPress={() => router.push('/accounts')} secondary />
              <Field label="期初投入額（元，沒有請填 0）" value={deployed} onChangeText={setDeployed} editable={!disabled} numeric />
              <Text style={styles.hint}>填入開帳前已投入投資、仍在帳面中的金額。期初可用餘額＝各帳戶開帳餘額合計＋期初投入額；所有儲備從 0 開始。</Text>
              <Action label="下一步：取得預算建議" disabled={disabled} onPress={() => suggest(false)} />
            </>
          ) : null}

          {loaded && step === 'income' ? (
            <>
              <Text style={styles.title}>依收入準備預算</Text>
              <Text style={styles.hint}>目前沒有可用的完整月份，請填月收入。先按預設的分類、組別與占收入比例產生建議，每項都可以修改。</Text>
              <Field label="月收入（元）" value={income} onChangeText={setIncome} editable={!disabled} numeric />
              <Action label="產生預算建議" disabled={disabled || !income.trim()} onPress={() => suggest(true)} />
            </>
          ) : null}

          {loaded && step === 'budget' ? (
            <>
              <Text style={styles.title}>逐項確認預算</Text>
              <Text style={styles.hint}>{suggestionSource === 'history' ? `依 ${historyMonths.map(monthTitle).join('、')} 的平均支出，進位到百元。沒有支出的月份以 0 計算。` : '依你填寫的月收入與預設比例建議。'}</Text>
              <Text style={styles.hint}>儲備類會累積上限與實支的差額；固定支出按實支計算；照實支不設上限。修改後請重新確認該項。</Text>
              {budgetRows.map((row) => (
                <View key={row.categoryId} style={styles.card}>
                  <Text style={styles.label}>{row.name}</Text>
                  <Text style={styles.hint}>{row.averageExpense !== null ? `平均支出約 ${formatAmount(Math.round(row.averageExpense))} 元／月` : row.incomeRatio !== null ? `預設占收入 ${Math.round(row.incomeRatio * 100)}%` : '新分類預設照實支'}</Text>
                  <View style={styles.choices}>{GROUPS.map((group) => (
                    <Choice key={group.value} label={group.label} selected={row.kind === group.value} disabled={disabled} onPress={() => editBudget(row.categoryId, { kind: group.value, ...(group.value === 'actual' ? { amount: '0' } : {}) })} onCard />
                  ))}</View>
                  {row.kind === 'actual' ? <Text style={styles.hint}>照實支，不設定上限。</Text> : <Field label={`${row.name}每月上限（元）`} value={row.amount} onChangeText={(value) => editBudget(row.categoryId, { amount: value })} editable={!disabled} numeric onCard />}
                  <Action label={row.confirmed ? '✓ 已確認' : '確認這項預算'} disabled={disabled || row.confirmed} onPress={() => confirmBudget(row)} secondary onCard />
                </View>
              ))}
              <Text style={styles.label}>已確認 {confirmedCount}／{budgetRows.length} 項</Text>
              <Text style={styles.hint}>確認後會建立 {openingMonth}-01 的帳本與期初基準，不會自動補結歷史月份。</Text>
              <Action label={busy ? '正在建立帳本…' : '完成開帳，開始記帳'} disabled={disabled || confirmedCount !== budgetRows.length} onPress={finish} />
            </>
          ) : null}

          {loaded && step !== 'choice' ? <Action label="返回上一步" disabled={disabled} onPress={back} secondary /> : null}
          {busy ? <ActivityIndicator accessibilityLabel="正在處理" /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, editable, numeric = false, signed = false, onCard = false }: {
  label: string; value: string; onChangeText: (value: string) => void; editable: boolean; numeric?: boolean; signed?: boolean; onCard?: boolean;
}) {
  return <View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} editable={editable} keyboardType={numeric ? signed ? 'numbers-and-punctuation' : 'number-pad' : 'default'} accessibilityLabel={label} autoCorrect={false} style={[styles.input, onCard && styles.onCardFill]} /></View>;
}
// onCard：控制項畫在白卡片內時，次要底色改用 colors.fill、不畫細框；直接在灰底頁面上維持白底。
function Action({ label, onPress, disabled = false, secondary = false, onCard = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; onCard?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.action, { backgroundColor: secondary ? (onCard ? colors.fill : colors.surface) : colors.accent, opacity: disabled ? 0.5 : 1, borderWidth: secondary && !onCard ? 1 : 0 }]}><Text style={{ color: secondary ? colors.accent : '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{label}</Text></Pressable>;
}
function Choice({ label, selected, disabled, onPress, onCard = false }: { label: string; selected: boolean; disabled: boolean; onPress: () => void; onCard?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }} style={{ minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, backgroundColor: selected ? colors.accent : onCard ? colors.fill : colors.surface, borderWidth: selected || onCard ? 0 : 1, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: selected ? '#fff' : colors.text }}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text }, label: { fontSize: 16, fontWeight: '600', color: colors.text },
  text: { fontSize: 16, color: colors.text }, hint: { fontSize: 14, lineHeight: 21, color: colors.muted }, error: { color: colors.expense, fontSize: 15 },
  card: { padding: 14, gap: 12, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, color: colors.text, fontSize: 18 },
  // 畫在白卡片內的輸入框：用 fill 底色取代細框。
  onCardFill: { backgroundColor: colors.fill, borderColor: colors.fill },
  action: { minHeight: 48, padding: 12, borderRadius: 8, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
});
