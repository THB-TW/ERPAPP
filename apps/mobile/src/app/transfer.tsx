import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { monthOf, taipeiDate } from '../calc/dates.ts';
import type { Account } from '../ledger/index.ts';
import { dayTitle, userMessage } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

export default function TransferScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const params = useLocalSearchParams<{ date?: string; id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const [date, setDate] = useState(params.date ?? taipeiDate(new Date()));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [original, setOriginal] = useState<{ from: number; to: number } | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const accs = await ledger.listAccounts();
      const detail = editingId === null ? null : await ledger.getTransfer(editingId);
      const targetDate = detail?.date ?? params.date ?? taipeiDate(new Date());
      const closed = await ledger.isMonthClosed(monthOf(targetDate));
      if (cancelled) return;
      setAccounts(accs);
      setDate(targetDate);
      const active = accs.filter((a) => a.active);
      setFromId(detail?.fromAccountId ?? active[0]?.id ?? null);
      setToId(detail?.toAccountId ?? active[1]?.id ?? null);
      setOriginal(detail ? { from: detail.fromAccountId, to: detail.toAccountId } : null);
      setAmount(detail ? String(detail.amount) : '');
      setNote(detail?.note ?? '');
      setLocked(closed);
      setLoaded(true);
    })().catch((e: unknown) => { if (!cancelled) setError(userMessage(e, '讀取轉帳失敗，請返回後再試一次。')); });
    return () => { cancelled = true; };
  }, [ledger, editingId, params.date]);

  async function save() {
    if (savingRef.current || !loaded || locked) return;
    if (fromId === null || toId === null) { setError('請選擇轉出與轉入帳戶；不足兩個帳戶時請先到設定新增。'); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const input = { date, fromAccountId: fromId, toAccountId: toId, amount: /^\d+$/.test(amount) ? Number(amount) : NaN, note };
      if (editingId === null) await ledger.addTransfer(input);
      else await ledger.updateTransfer(editingId, input);
      router.back();
    } catch (e) {
      setError(userMessage(e, '儲存轉帳失敗，請再試一次。'));
      savingRef.current = false;
      setSaving(false);
    }
  }
  function confirmDelete() {
    if (editingId === null) return;
    Alert.alert('刪除這筆轉帳？', '刪除後兩個帳戶的餘額會還原，無法復原這筆轉帳。', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        try { await ledger.deleteTransfer(editingId); router.back(); }
        catch (e) { setError(userMessage(e, '刪除轉帳失敗，請再試一次。')); savingRef.current = false; setSaving(false); }
      } },
    ]);
  }
  const readOnly = !loaded || locked;
  const disabled = readOnly || saving;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: editingId === null ? '新增轉帳' : locked ? '檢視轉帳' : '修改轉帳' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ color: colors.muted }}>{dayTitle(date)}</Text>
          {editingId === null ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <Choice label="支出" active={false} disabled={disabled} onPress={() => router.replace({ pathname: '/entry', params: { date, flow: 'expense' } })} />
            <Choice label="收入" active={false} disabled={disabled} onPress={() => router.replace({ pathname: '/entry', params: { date, flow: 'income' } })} />
            <Choice label="轉帳" active disabled={disabled} onPress={() => {}} />
          </View> : null}
          <Text style={{ color: colors.muted }}>轉帳只影響帳戶餘額，不計入收入、支出或預算。</Text>
          {locked ? <Text style={{ color: colors.text }}>🔒 這個月份已月結，轉帳不能新增、修改或刪除，請先撤銷月結。</Text> : null}
          <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="金額" accessibilityLabel="轉帳金額" editable={!disabled} autoFocus={editingId === null} style={{ fontSize: 32, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }} />
          <Text style={{ color: colors.muted }}>轉出帳戶</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{accounts.filter((a) => a.active || a.id === original?.from).map((a) => <Choice key={a.id} label={`${a.name}${a.active ? '' : '（已停用）'}`} active={fromId === a.id} disabled={disabled} onPress={() => setFromId(a.id)} />)}</View>
          <Text style={{ color: colors.muted }}>轉入帳戶</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{accounts.filter((a) => a.active || a.id === original?.to).map((a) => <Choice key={a.id} label={`${a.name}${a.active ? '' : '（已停用）'}`} active={toId === a.id} disabled={disabled} onPress={() => setToId(a.id)} />)}</View>
          {loaded && accounts.filter((a) => a.active).length < 2 && editingId === null ? <Text style={{ color: colors.muted }}>請先到設定的帳戶管理新增或啟用兩個帳戶。</Text> : null}
          <TextInput value={note} onChangeText={setNote} placeholder="備註（選填）" editable={!disabled} style={{ color: colors.text, fontSize: 16, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }} />
          {error ? <Text style={{ color: colors.expense }}>{error}</Text> : null}
          {editingId !== null && !readOnly ? <Pressable onPress={confirmDelete} disabled={saving} accessibilityRole="button" style={{ padding: 8, alignSelf: 'center' }}><Text style={{ color: colors.expense }}>刪除這筆轉帳</Text></Pressable> : null}
        </ScrollView>
        {!readOnly ? <Pressable onPress={save} disabled={saving} accessibilityRole="button" style={{ margin: 16, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}><Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>儲存</Text></Pressable> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Choice(props: { label: string; active: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable onPress={props.onPress} disabled={props.disabled} accessibilityRole="button" accessibilityState={{ selected: props.active, disabled: props.disabled }} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: props.active ? colors.accent : colors.surface, opacity: props.disabled && !props.active ? 0.5 : 1 }}><Text style={{ color: props.active ? '#fff' : colors.text }}>{props.label}</Text></Pressable>;
}
