import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { monthOf, taipeiDate } from '../calc/dates.ts';
import type { Account, Category, Flow, Member } from '../ledger/index.ts';
import { dayTitle, monthTitle, userMessage } from '../ui/format.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

// 記帳表單。新增：/entry?date=YYYY-MM-DD；修改：/entry?id=交易編號（帶出原本的內容，可改可刪）。
// 已結月份的交易以唯讀顯示並說明原因；真正的鎖定檢查在帳本服務，這裡只是提早告知。
export default function EntryScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight(); // 鍵盤避讓要扣掉上方標題列的高度，「儲存」才不會被鍵盤蓋住
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ color: colors.muted }}>{dayTitle(date)}</Text>

          {locked ? (
            <Text style={{ color: colors.text, backgroundColor: colors.surface, padding: 12, borderRadius: 8 }}>
              🔒 {monthTitle(monthOf(date))}已月結，這筆交易已鎖定，不能修改或刪除。要更改請先撤銷該月的月結，或做前期更正。
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="支出" active={flow === 'expense'} disabled={readOnly} onPress={() => chooseFlow('expense')} />
            <Chip label="收入" active={flow === 'income'} disabled={readOnly} onPress={() => chooseFlow('income')} />
            {editingId === null ? <Chip label="轉帳" active={false} disabled={readOnly || saving} onPress={() => router.replace({ pathname: '/transfer', params: { date } })} /> : null}
          </View>

          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            placeholder="金額"
            autoFocus={editingId === null}
            editable={!readOnly}
            style={{ fontSize: 32, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}
          />

          <Text style={{ color: colors.muted }}>分類</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shownCategories.map((c) => (
              <Chip key={c.id} label={c.name} active={c.id === categoryId} disabled={readOnly} onPress={() => setCategoryId(c.id)} />
            ))}
          </View>
          {loaded && shownCategories.length === 0 ? (
            <Text style={{ color: colors.muted }}>還沒有{flow === 'expense' ? '支出' : '收入'}分類，請先到設定新增分類。</Text>
          ) : null}

          <Text style={{ color: colors.muted }}>帳戶</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {accounts.filter((a) => a.active || a.id === originalAccountId).map((a) => (
              <Chip key={a.id} label={`${a.name}${a.active ? '' : '（已停用）'}`} active={a.id === accountId} disabled={readOnly} onPress={() => setAccountId(a.id)} />
            ))}
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="備註（選填）"
            editable={!readOnly}
            style={{ fontSize: 16, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}
          />

          {members.length > 0 && !showMember && !readOnly ? (
            <Pressable onPress={() => setShowMember(true)} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: colors.accent }}>＋ 成員（選填）</Text>
            </Pressable>
          ) : null}
          {members.length > 0 && showMember ? (
            <>
              <Text style={{ color: colors.muted }}>成員（選填）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="不指定" active={memberId === null} disabled={readOnly} onPress={() => setMemberId(null)} />
                {members.map((m) => (
                  <Chip key={m.id} label={m.name} active={m.id === memberId} disabled={readOnly} onPress={() => setMemberId(m.id)} />
                ))}
              </View>
            </>
          ) : null}

          {error ? <Text style={{ color: colors.expense }}>{error}</Text> : null}

          {editingId !== null && !readOnly ? (
            <Pressable onPress={confirmDelete} disabled={saving} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ color: colors.expense }}>刪除這筆交易</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {readOnly ? null : (
          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            style={{ margin: 16, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>儲存</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chip(props: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: props.active ? colors.accent : colors.surface,
        opacity: props.disabled && !props.active ? 0.5 : 1,
      }}
    >
      <Text style={{ color: props.active ? '#fff' : colors.text }}>{props.label}</Text>
    </Pressable>
  );
}
