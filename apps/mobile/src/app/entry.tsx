import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { taipeiDate } from '../calc/dates.ts';
import type { Account, Category, Flow } from '../ledger/index.ts';
import { dayTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

export default function EntryScreen() {
  const ledger = useLedger();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? taipeiDate(new Date());

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [flow, setFlow] = useState<Flow>('expense');
  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([ledger.listCategories(), ledger.listAccounts()]).then(([cats, accs]) => {
      setCategories(cats);
      setAccounts(accs);
      setAccountId((current) => current ?? accs[0]?.id ?? null); // 預設第一個帳戶（現金），少點一下
    });
  }, [ledger]);

  function chooseFlow(next: Flow) {
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
    try {
      await ledger.addTransaction({
        date,
        categoryId,
        accountId,
        flow,
        amount: amountText === '' ? 0 : Number(amountText),
        note,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗。');
      setSaving(false);
    }
  }

  const shownCategories = categories.filter((c) => c.flow === flow);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ color: colors.muted }}>{dayTitle(date)}</Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="支出" active={flow === 'expense'} onPress={() => chooseFlow('expense')} />
            <Chip label="收入" active={flow === 'income'} onPress={() => chooseFlow('income')} />
          </View>

          <TextInput
            value={amountText}
            onChangeText={(text) => setAmountText(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="金額"
            autoFocus
            style={{ fontSize: 32, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}
          />

          <Text style={{ color: colors.muted }}>分類</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shownCategories.map((c) => (
              <Chip key={c.id} label={c.name} active={c.id === categoryId} onPress={() => setCategoryId(c.id)} />
            ))}
          </View>

          <Text style={{ color: colors.muted }}>帳戶</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} active={a.id === accountId} onPress={() => setAccountId(a.id)} />
            ))}
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="備註（選填）"
            style={{ fontSize: 16, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}
          />

          {error ? <Text style={{ color: colors.expense }}>{error}</Text> : null}
        </ScrollView>

        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={{ margin: 16, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>儲存</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: props.active ? colors.accent : colors.surface,
      }}
    >
      <Text style={{ color: props.active ? '#fff' : colors.text }}>{props.label}</Text>
    </Pressable>
  );
}
