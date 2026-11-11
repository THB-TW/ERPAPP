import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AccountBalance, AccountKind } from '../ledger/index.ts';
import { formatAmount, userMessage } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'cash', label: '現金' },
  { value: 'bank', label: '銀行' },
  { value: 'credit_card', label: '信用卡' },
  { value: 'e_wallet', label: '電子支付' },
];

export default function AccountsScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [openingDate, setOpeningDate] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('cash');
  const [amountText, setAmountText] = useState('0');
  const [negative, setNegative] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    Promise.all([ledger.listAccountBalances(), ledger.getOpeningDate()]).then(
      ([balances, date]) => {
        if (cancelled) return;
        setAccounts(balances);
        setOpeningDate(date);
        setLoaded(true);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(userMessage(e, '讀取帳戶失敗，請返回後再試一次。'));
      },
    );
    return () => { cancelled = true; };
  }, [ledger]));

  function edit(account: AccountBalance | null) {
    setEditingId(account?.id ?? null);
    setName(account?.name ?? '');
    setKind(account?.kind ?? 'cash');
    setAmountText(String(Math.abs(account?.openingBalance ?? 0)));
    setNegative((account?.openingBalance ?? 0) < 0);
    setActive(account?.active ?? true);
    setError(null);
    setFormOpen(true);
  }

  async function save() {
    if (savingRef.current || !loaded) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let saved = false;
    try {
      // 金額是否合法由帳本服務判斷；空白不視為 0，避免不小心清除開帳餘額。
      const openingBalance = /^\d+$/.test(amountText) ? Number(amountText) * (negative ? -1 : 1) : NaN;
      if (editingId === null) await ledger.addAccount({ name, kind, openingBalance });
      else await ledger.updateAccount(editingId, { name, openingBalance, active });
      saved = true;
      setFormOpen(false);
      setLoaded(false);
      setAccounts(await ledger.listAccountBalances());
      setLoaded(true);
    } catch (e) {
      setError(saved ? '帳戶已儲存，但餘額讀取失敗，請返回後再試一次。' : userMessage(e, '儲存帳戶失敗，請再試一次。'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const readOnly = saving || !loaded;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: '帳戶管理' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ color: colors.muted }}>
            {loaded ? openingDate ? `開帳日：${openingDate}；開帳前顯示開帳餘額，開帳後顯示截至今日的帳戶餘額。` : '尚未設定開帳日，目前餘額暫計全部交易。' : '正在讀取帳戶…'}
          </Text>
          {!formOpen ? accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() => edit(account)}
              disabled={readOnly}
              accessibilityRole="button"
              accessibilityHint="修改名稱、開帳餘額或停用狀態"
              style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surface, gap: 6 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ color: colors.text, fontSize: 17, flexShrink: 1 }}>{account.name}{account.active ? '' : '（已停用）'}</Text>
                <Text style={{ color: account.balance < 0 ? colors.expense : colors.text, fontSize: 17 }}>{formatAmount(account.balance)} 元</Text>
              </View>
              <Text style={{ color: colors.muted }}>
                {KINDS.find((item) => item.value === account.kind)?.label}・開帳餘額 {formatAmount(account.openingBalance)} 元
              </Text>
              {account.kind === 'credit_card' && account.balance < 0 ? <Text style={{ color: colors.muted }}>負餘額代表尚未繳清的金額</Text> : null}
            </Pressable>
          )) : null}

          {!formOpen ? (
            <Pressable onPress={() => edit(null)} disabled={readOnly} accessibilityRole="button" style={{ paddingVertical: 8 }}>
              <Text style={{ color: colors.accent, fontSize: 17 }}>＋ 新增帳戶</Text>
            </Pressable>
          ) : null}

          {formOpen ? (
            <View style={{ gap: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }}>
              <Text style={{ fontSize: 18, color: colors.text, fontWeight: '600' }}>{editingId === null ? '新增帳戶' : '修改帳戶'}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="帳戶名稱"
                accessibilityLabel="帳戶名稱"
                editable={!readOnly}
                style={{ color: colors.text, fontSize: 17, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}
              />
              <Text style={{ color: colors.muted }}>帳戶種類{editingId === null ? '' : '（建立後固定）'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {KINDS.map((item) => (
                  <Choice key={item.value} label={item.label} selected={kind === item.value} disabled={editingId !== null || readOnly} onPress={() => setKind(item.value)} />
                ))}
              </View>
              <Text style={{ color: colors.muted }}>開帳餘額（元）</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="number-pad"
                accessibilityLabel="開帳餘額金額"
                editable={!readOnly}
                style={{ color: colors.text, fontSize: 28, borderBottomWidth: 1, borderBottomColor: colors.border }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Choice label="正數／零" selected={!negative} disabled={readOnly} onPress={() => setNegative(false)} />
                <Choice label="負數" selected={negative} disabled={readOnly} onPress={() => setNegative(true)} />
              </View>
              <Text style={{ color: colors.muted }}>填入開帳日當天的餘額；信用卡未繳金額請選「負數」。</Text>
              {editingId !== null ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Choice label="使用中" selected={active} disabled={readOnly} onPress={() => setActive(true)} />
                    <Choice label="停用" selected={!active} disabled={readOnly} onPress={() => setActive(false)} />
                  </View>
                  <Text style={{ color: colors.muted }}>停用後不再供新交易或轉帳選用，歷史交易與餘額仍保留。</Text>
                </>
              ) : null}
              <Pressable onPress={() => setFormOpen(false)} disabled={saving} accessibilityRole="button" style={{ padding: 8, alignSelf: 'center' }}>
                <Text style={{ color: colors.muted }}>取消修改</Text>
              </Pressable>
            </View>
          ) : null}
          {error ? <Text style={{ color: colors.expense }}>{error}</Text> : null}
        </ScrollView>
        {formOpen ? (
          <Pressable
            onPress={save}
            disabled={readOnly}
            accessibilityRole="button"
            style={{ margin: 16, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent, opacity: readOnly ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>儲存帳戶</Text>
          </Pressable>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choice(props: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected, disabled: props.disabled }}
      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: props.selected ? colors.accent : colors.surface, opacity: props.disabled && !props.selected ? 0.5 : 1 }}
    >
      <Text style={{ color: props.selected ? '#fff' : colors.text }}>{props.label}</Text>
    </Pressable>
  );
}
