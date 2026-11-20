import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthOf, taipeiDate } from '../calc/dates.ts';
import type { Account } from '../ledger/index.ts';
import { dayTitle, userMessage } from '../ui/format.ts';
import { success, warning } from '../ui/haptics.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { Banner, Card, Chip, Footnote, PrimaryButton, Segmented, text } from '../ui/kit.tsx';
import { colors, typeScale } from '../ui/theme.ts';
import { useKeyboardHeight } from '../ui/useKeyboardHeight.ts';

export default function TransferScreen() {
  const ledger = useLedger();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
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
    if (fromId === null || toId === null) { warning(); setError('請選擇轉出與轉入帳戶；不足兩個帳戶時請先到設定新增。'); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const input = { date, fromAccountId: fromId, toAccountId: toId, amount: /^\d+$/.test(amount) ? Number(amount) : NaN, note };
      if (editingId === null) await ledger.addTransfer(input);
      else await ledger.updateTransfer(editingId, input);
      success();
      router.back();
    } catch (e) {
      warning();
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
  const typeOptions = [{ key: 'expense', label: '支出' }, { key: 'income', label: '收入' }, { key: 'transfer', label: '轉帳' }] as const;
  return (
    // 本頁以 iOS 底部面板（modal）呈現：面板底緣就是螢幕底緣，KeyboardAvoidingView 會算錯，
    // 改成自己量鍵盤高度，鍵盤開著時底部留白＝鍵盤高度（「儲存」停在鍵盤上方），沒開時留出底部安全區。
    <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom }}>
      <Stack.Screen
        options={{
          title: editingId === null ? '新增轉帳' : locked ? '檢視轉帳' : '修改轉帳',
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
        {locked ? <Banner tone="locked">🔒 這個月份已月結，轉帳不能新增、修改或刪除，請先撤銷月結。</Banner> : null}
        {editingId === null ? (
          <Segmented
            options={typeOptions}
            value="transfer"
            disabled={disabled}
            onChange={(key) => {
              if (key === 'expense') router.replace({ pathname: '/entry', params: { date, flow: 'expense' } });
              else if (key === 'income') router.replace({ pathname: '/entry', params: { date, flow: 'income' } });
            }}
          />
        ) : null}
        <Footnote>轉帳只影響帳戶餘額，不計入收入、支出或預算。</Footnote>

        <Card>
          <View style={styles.amountRow}>
            <Text style={text.bodyMuted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">NT$</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="金額"
              placeholderTextColor={colors.chevron}
              accessibilityLabel="轉帳金額"
              editable={!disabled}
              autoFocus={editingId === null}
              style={styles.amountInput}
            />
          </View>
        </Card>

        <Card>
          <Text style={text.footnote}>轉出帳戶</Text>
          <View style={styles.chips}>
            {accounts.filter((a) => a.active || a.id === original?.from).map((a) => (
              <Chip key={a.id} label={`${a.name}${a.active ? '' : '（已停用）'}`} active={fromId === a.id} disabled={disabled} onPress={() => setFromId(a.id)} />
            ))}
          </View>
        </Card>

        <Card>
          <Text style={text.footnote}>轉入帳戶</Text>
          <View style={styles.chips}>
            {accounts.filter((a) => a.active || a.id === original?.to).map((a) => (
              <Chip key={a.id} label={`${a.name}${a.active ? '' : '（已停用）'}`} active={toId === a.id} disabled={disabled} onPress={() => setToId(a.id)} />
            ))}
          </View>
          {loaded && accounts.filter((a) => a.active).length < 2 && editingId === null ? (
            <Text style={text.footnote}>請先到設定的帳戶管理新增或啟用兩個帳戶。</Text>
          ) : null}
        </Card>

        <Card>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="備註（選填）"
            placeholderTextColor={colors.muted}
            editable={!disabled}
            style={styles.noteInput}
          />
        </Card>

        {error ? <Text style={text.error}>{error}</Text> : null}

        {editingId !== null && !readOnly ? (
          <PrimaryButton tone="destructive" title="刪除這筆轉帳" onPress={confirmDelete} disabled={saving} />
        ) : null}
      </ScrollView>

      {!readOnly ? (
        <View style={styles.saveBar}>
          <PrimaryButton title="儲存" onPress={save} disabled={saving} />
        </View>
      ) : null}
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
