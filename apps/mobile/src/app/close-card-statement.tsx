import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cardStatementFilePort, CardStatementFileError } from '../csv/cardFilePort.ts';
import type { CsvEncoding } from '../csv/encoding.ts';
import type { Account, CardReconciliation } from '../ledger/index.ts';
import { CardStatementCheck } from '../ui/CardStatementCheck.tsx';
import { cardStatementErrorMessage } from '../ui/cardStatementError.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { monthTitle } from '../ui/format.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { CloseButton, closeStyles as styles } from '../ui/MonthlyCloseSummary.tsx';
import { colors } from '../ui/theme.ts';

const ENCODINGS: { value: CsvEncoding; label: string }[] = [
  { value: 'auto', label: '自動辨識' }, { value: 'utf-8', label: 'UTF-8' }, { value: 'big5', label: 'Big5' },
];

export default function CloseCardStatementScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string | string[] }>();
  const month = typeof monthParam === 'string' ? monthParam : '';
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [cards, setCards] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [check, setCheck] = useState<CardReconciliation | null>(null);
  const [encoding, setEncoding] = useState<CsvEncoding>('auto');
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const entitled = hasMonthlyCloseEntitlement();

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCheck(null);
    Promise.all([ledger.listAccounts(), ledger.getCardReconciliation(month), ledger.isMonthClosed(month)]).then(([accounts, result, isClosed]) => {
      if (cancelled) return;
      const creditCards = accounts.filter((a) => a.kind === 'credit_card' && a.active);
      setCards(creditCards);
      setAccountId((selected) => creditCards.some((a) => a.id === selected) ? selected : null);
      setCheck(result);
      setClosed(isClosed);
      setLoading(false);
    }, (e: unknown) => {
      if (!cancelled) { setError(cardStatementErrorMessage(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ledger, month, retry]));

  async function importCsv(fromFile: boolean) {
    if (accountId === null || busy || loading || closed) return;
    const selectedId = accountId;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let content: string | Uint8Array = csv;
      let name = '貼上的 CSV';
      if (fromFile) {
        const file = await cardStatementFilePort.pickCsv();
        if (file === null) return;
        content = file.bytes;
        name = file.name;
      }
      const result = await ledger.importCardStatement({ accountId: selectedId, csv: content, encoding });
      void syncNotifications(ledger).catch(() => {});
      setMessage(`${name}：新增 ${result.imported} 筆，已存在略過 ${result.skipped} 筆，共 ${result.total} 筆消費。負數繳款列不計數。`);
      setCheck(null);
      setCheck(await ledger.getCardReconciliation(month));
    } catch (e: unknown) {
      setError(e instanceof CardStatementFileError ? e.message : cardStatementErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const importDisabled = busy || loading || closed || accountId === null;
  return <>
    <Stack.Screen options={{ title: '信用卡帳單', headerBackTitle: '返回' }} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>② {month ? monthTitle(month) : '月結'}信用卡帳單</Text>
        <Text style={styles.note}>帳單只供核對，不會新增支出交易或改變帳戶餘額。</Text>
        {loading ? <ActivityIndicator accessibilityLabel="讀取信用卡核對中" /> : null}
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        {message ? <Text style={styles.note} accessibilityLiveRegion="polite">{message}</Text> : null}
        {!loading && closed ? <Text style={styles.note}>這個月份已月結，帳單不能再匯入。若需更正，請先撤銷月結。</Text> : null}
        {!loading && cards.length > 0 && !closed ? <View style={styles.card}>
          <Text style={styles.heading}>先選這份帳單所屬的信用卡</Text>
          <View style={localStyles.choices}>
            {cards.map((card) => <Choice key={card.id} label={card.name} selected={card.id === accountId} disabled={busy}
              onPress={() => { setAccountId(card.id); setMessage(null); }} />)}
          </View>
          <Text style={styles.note}>每張卡分別匯入；同一份帳單可重複匯入，合法的同日同店同額多筆仍會保留。</Text>
          <Text style={styles.label}>檔案編碼</Text>
          <View style={localStyles.choices}>
            {ENCODINGS.map((option) => <Choice key={option.value} label={option.label} selected={encoding === option.value}
              disabled={busy} onPress={() => setEncoding(option.value)} />)}
          </View>
          <CloseButton title={busy ? '處理中…' : '選擇帳單 CSV'} disabled={importDisabled} onPress={() => { void importCsv(true); }} />
          <Text style={styles.note}>支援銀行帳單明細原始匯出檔，以及「日期,店家,金額」三欄檔。負數繳款列不匯入、不計數。</Text>
          <Text style={styles.label}>或貼上 CSV 內容</Text>
          <TextInput value={csv} onChangeText={setCsv} multiline editable={!busy} autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="信用卡帳單 CSV 內容" placeholder={'日期,店家,金額\n2026-10-05,合成店家,100'}
            style={localStyles.csv} textAlignVertical="top" />
          <CloseButton title="匯入貼上的內容" disabled={importDisabled || !csv.trim()} onPress={() => { void importCsv(false); }} />
        </View> : null}
        {!loading && cards.length === 0 && check?.hasCards ? <Text style={styles.note}>目前沒有使用中的信用卡帳戶可匯入。若停用卡仍有待核對交易，請先到帳戶設定重新啟用。</Text> : null}
        {check ? <CardStatementCheck result={check} /> : null}
        {!loading ? <CloseButton title="重新核對" disabled={busy} onPress={() => setRetry((n) => n + 1)} /> : null}
        {!entitled ? <Text style={styles.note}>需要有效的付費權益才能繼續月結；帳單匯入仍可使用。</Text> : null}
        <CloseButton title={check && !check.hasCards ? '略過信用卡，進入計算預覽' : '進入計算預覽'}
          disabled={loading || busy || closed || !check?.matched || !entitled}
          onPress={() => router.push({ pathname: '/close-calculation', params: { month } })} />
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)')}><Text style={styles.link}>回記帳修正交易 ›</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={[localStyles.choice, selected && { backgroundColor: colors.accent }, disabled && { opacity: 0.5 }]}>
    <Text style={{ color: selected ? '#fff' : colors.text }}>{label}</Text>
  </Pressable>;
}

const localStyles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.background },
  csv: { minHeight: 150, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text, backgroundColor: colors.background },
});
