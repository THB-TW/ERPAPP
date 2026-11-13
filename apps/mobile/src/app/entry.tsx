import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthOf, taipeiDate } from '../calc/dates.ts';
import type { Account, Category, Flow, Member } from '../ledger/index.ts';
import { dayTitle, monthTitle, userMessage } from '../ui/format.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { Banner, Card, Chip, PrimaryButton, Segmented, text } from '../ui/kit.tsx';
import { colors, typeScale } from '../ui/theme.ts';
import { useKeyboardHeight } from '../ui/useKeyboardHeight.ts';

// 記帳表單。新增：/entry?date=YYYY-MM-DD；修改：/entry?id=交易編號（帶出原本的內容，可改可刪）。
// 已結月份的交易以唯讀顯示並說明原因；真正的鎖定檢查在帳本服務，這裡只是提早告知。
// 本頁以 iOS 底部面板（modal）呈現：沒有自動返回鈕，左上角自備「取消／關閉」。
export default function EntryScreen() {
  const ledger = useLedger();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const params = useLocalSearchParams<{ date?: string; id?: string; flow?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const [date, setDate] = useState(params.date ?? taipeiDate(new Date()));
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [flow, setFlow] = useState<Flow>(params.flow === 'income' ? 'income' : 'expense');
  const [originalAccountId, setOriginalAccountId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [showMember, setShowMember] = useState(false); // 成員欄位預設隱藏
  const [note, setNote] = useState('');
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(editingId === null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cats, accs, mems] = await Promise.all([ledger.listCategories(monthOf(date)), ledger.listAccounts(), ledger.listMembers()]);
      if (cancelled) return;
      setCategories(cats);
      setAccounts(accs);
      setMembers(mems);
      if (editingId === null) {
        setAccountId((current) => current ?? accs.find((a) => a.active)?.id ?? null); // 預設排在最前面的使用中帳戶
        return;
      }
      const t = await ledger.getTransaction(editingId);
      const closed = await ledger.isMonthClosed(monthOf(t.date));
      const datedCategories = await ledger.listCategories(monthOf(t.date));
      if (cancelled) return;
      setDate(t.date);
      setCategories(datedCategories);
      setFlow(t.flow);
      setAmountText(String(t.amount));
      setCategoryId(t.categoryId);
      setAccountId(t.accountId);
      setOriginalAccountId(t.accountId);
      setMemberId(t.memberId);
      setShowMember(t.memberId !== null);
      setNote(t.note);
      setLocked(closed);
      setLoaded(true);
    })().catch((e: unknown) => {
      if (!cancelled) setError(userMessage(e, '讀取交易失敗，請返回後再試一次。'));
    });
    return () => {
      cancelled = true;
    };
  }, [ledger, editingId]);

  function chooseFlow(next: Flow) {
    if (next === flow) return;
    setFlow(next);
    setCategoryId(null); // 分類依收支別而不同，換收支別要重選
  }

  async function save() {
    setError(null);
    if (categoryId === null) {
      setError('請先選一個分類。');
      return;
    }
    if (accountId === null) {
      setError('請先選一個帳戶。');
      return;
    }
    setSaving(true);
    const input = {
      date,
      categoryId,
      accountId,
      flow,
      amount: /^\d+$/.test(amountText) ? Number(amountText) : NaN,
      note,
      memberId,
    };
    try {
      if (editingId === null) await ledger.addTransaction(input);
      else await ledger.updateTransaction(editingId, input);
      void syncNotifications(ledger).catch(() => {});
      router.back();
    } catch (e) {
      setError(userMessage(e, '儲存失敗，請再試一次。'));
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (editingId === null) return;
    Alert.alert('刪除這筆交易？', '刪除後無法復原。', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await ledger.deleteTransaction(editingId);
            void syncNotifications(ledger).catch(() => {});
            router.back();
          } catch (e) {
            setError(userMessage(e, '刪除失敗，請再試一次。'));
            setSaving(false);
          }
        },
      },
    ]);
  }

  const shownCategories = categories.filter((c) => c.flow === flow);
  const readOnly = locked || !loaded;
  const title = editingId === null ? '新增交易' : locked ? '檢視交易' : '修改交易';
  const flowOptions: readonly { key: 'expense' | 'income' | 'transfer'; label: string }[] =
    editingId === null
      ? [{ key: 'expense', label: '支出' }, { key: 'income', label: '收入' }, { key: 'transfer', label: '轉帳' }]
      : [{ key: 'expense', label: '支出' }, { key: 'income', label: '收入' }];

  return (
    // 面板底緣就是螢幕底緣，KeyboardAvoidingView 在面板裡會算錯：改成自己量鍵盤高度，
    // 鍵盤開著時底部留白＝鍵盤高度（「儲存」停在鍵盤上方），沒開時留出底部安全區。
    <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom }}>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" style={{ paddingHorizontal: 8 }}>
              <Text style={text.link}>{readOnly ? '關閉' : '取消'}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.content}
      >
        <Text style={text.subheadMuted}>{dayTitle(date)}</Text>

        {locked ? (
          <Banner tone="locked">
            🔒 {monthTitle(monthOf(date))}已月結，這筆交易已鎖定，不能修改或刪除。要更改請先撤銷該月的月結，或做前期更正。
          </Banner>
        ) : null}

        <Segmented
          options={flowOptions}
          value={flow}
          disabled={readOnly}
          onChange={(key) => {
            if (key === 'transfer') {
              if (!saving) router.replace({ pathname: '/transfer', params: { date } });
              return;
            }
            chooseFlow(key);
          }}
        />

        <Card>
          <View style={styles.amountRow}>
            <Text style={text.bodyMuted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">NT$</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="number-pad"
              placeholder="金額"
              placeholderTextColor={colors.chevron}
              autoFocus={editingId === null}
              editable={!readOnly}
              style={styles.amountInput}
            />
          </View>
        </Card>

        <Card>
          <Text style={text.footnote}>分類</Text>
          <View style={styles.chips}>
            {shownCategories.map((c) => (
              <Chip key={c.id} label={c.name} active={c.id === categoryId} disabled={readOnly} onPress={() => setCategoryId(c.id)} />
            ))}
          </View>
          {loaded && shownCategories.length === 0 ? (
            <Text style={text.footnote}>還沒有{flow === 'expense' ? '支出' : '收入'}分類，請先到設定新增分類。</Text>
          ) : null}
        </Card>

        <Card>
          <Text style={text.footnote}>帳戶</Text>
          <View style={styles.chips}>
            {accounts.filter((a) => a.active || a.id === originalAccountId).map((a) => (
              <Chip key={a.id} label={`${a.name}${a.active ? '' : '（已停用）'}`} active={a.id === accountId} disabled={readOnly} onPress={() => setAccountId(a.id)} />
            ))}
          </View>
        </Card>

        <Card>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="備註（選填）"
            placeholderTextColor={colors.muted}
            editable={!readOnly}
            style={styles.noteInput}
          />
        </Card>

        {members.length > 0 && !showMember && !readOnly ? (
          <Pressable onPress={() => setShowMember(true)} hitSlop={8} accessibilityRole="button">
            <Text style={text.link}>＋ 成員（選填）</Text>
          </Pressable>
        ) : null}
        {members.length > 0 && showMember ? (
          <Card>
            <Text style={text.footnote}>成員（選填）</Text>
            <View style={styles.chips}>
              <Chip label="不指定" active={memberId === null} disabled={readOnly} onPress={() => setMemberId(null)} />
              {members.map((m) => (
                <Chip key={m.id} label={m.name} active={m.id === memberId} disabled={readOnly} onPress={() => setMemberId(m.id)} />
              ))}
            </View>
          </Card>
        ) : null}

        {error ? <Text style={text.error}>{error}</Text> : null}

        {editingId !== null && !readOnly ? (
          <PrimaryButton tone="destructive" title="刪除這筆交易" onPress={confirmDelete} disabled={saving} />
        ) : null}
      </ScrollView>

      {readOnly ? null : (
        <View style={styles.saveBar}>
          <PrimaryButton title="儲存" onPress={save} disabled={saving} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: { flex: 1, fontSize: 34, fontWeight: '600', fontVariant: ['tabular-nums'], color: colors.text, padding: 0, minHeight: 44 },
  noteInput: { ...typeScale.body, color: colors.text, minHeight: 24, padding: 0 },
  saveBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
});
