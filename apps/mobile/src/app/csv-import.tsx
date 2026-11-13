import { Stack, router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { taipeiDate } from '../calc/dates.ts';
import { csvFilePort, CsvFilePortError, type CsvFile } from '../csv/filePort.ts';
import { CsvFormatError, LedgerError, type CsvImportResult } from '../ledger/index.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { hasMonthlyCloseEntitlement, requirePaidFeature } from '../ui/closeEntitlement.ts';
import { colors } from '../ui/theme.ts';

export default function CsvImportScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [text, setText] = useState('');
  const [file, setFile] = useState<CsvFile | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allRejections, setAllRejections] = useState(false);
  const [allDefaults, setAllDefaults] = useState(false);
  // ref 在重新渲染前就能阻擋連點；離開頁面後不再顯示過期的非同步結果。
  const working = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function perform(task: () => Promise<void>, fallback: string) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e: unknown) {
      if (mounted.current) {
        setError(e instanceof CsvFormatError || e instanceof LedgerError || e instanceof CsvFilePortError
          ? e.message : fallback);
      }
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function clearResult() {
    setResult(null);
    setError(null);
    setAllRejections(false);
    setAllDefaults(false);
  }

  function pickFile() {
    void perform(async () => {
      const picked = await csvFilePort.pickCsv();
      if (!mounted.current || picked === null) return;
      setFile(picked);
      setText('');
      clearResult();
    }, '選取檔案失敗，請再試一次。');
  }

  function importCsv() {
    if (file === null && text.trim() === '') return;
    void perform(async () => {
      clearResult();
      const imported = await ledger.importTransactionsCsv(file?.bytes ?? text);
      void syncNotifications(ledger).catch(() => {});
      if (mounted.current) setResult(imported);
    }, '匯入失敗，沒有完成這次匯入，請再試一次。');
  }

  function exportCsv() {
    void perform(async () => {
      const bytes = await ledger.exportTransactionsCsv();
      if (!mounted.current) return;
      await csvFilePort.shareCsv({ name: `交易-${taipeiDate(new Date())}.csv`, bytes });
    }, '匯出失敗，請再試一次。');
  }

  function exportBudget() {
    if (!requirePaidFeature('budget_export')) return;
    void perform(async () => {
      const bytes = await ledger.exportBudgetCsv({ hasEntitlement: hasMonthlyCloseEntitlement() });
      if (!mounted.current) return;
      await csvFilePort.shareCsv({ name: `預算資料-${taipeiDate(new Date())}.csv`, bytes });
    }, '匯出失敗，請再試一次。');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: '匯入 CSV', headerBackTitle: '返回' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>其他 App 搬家（匯入 CSV）</Text>
          <Text style={{ color: colors.muted }}>只需要類別與金額。交易的匯入與匯出皆免費，不需訂閱。</Text>
          <Action label="查看 CSV 規格說明" disabled={busy} onPress={() => router.push('/csv-spec')} secondary />

          <View style={{ padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface, gap: 12 }}>
            <Action label="選擇 CSV 檔案" disabled={busy} onPress={pickFile} secondary onCard />
            <Text style={{ color: colors.muted }}>可從「檔案」選擇 UTF-8 或 Big5 CSV，也可以貼上 CSV 內容。</Text>
            {file ? <Text style={{ color: colors.text }}>已選擇：{file.name}</Text> : null}
            <Text style={{ color: colors.text, fontWeight: '600' }}>或貼上 CSV 內容</Text>
            <TextInput
              value={text}
              onChangeText={(value) => {
                setText(value);
                setFile(null);
                clearResult();
              }}
              editable={!busy}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
              accessibilityLabel="CSV 內容"
              placeholder={'類別,金額\n飲食,120'}
              style={{ minHeight: 160, padding: 12, borderWidth: 1, borderColor: colors.border,
                borderRadius: 8, color: colors.text, backgroundColor: colors.fill, fontSize: 16 }}
            />
            <Text style={{ color: colors.muted }}>按下匯入會新增交易。通過驗證的重複交易會略過；已結月份一律拒收，並列出原因。</Text>
            <Action label={busy ? '處理中…' : '匯入 CSV'} disabled={busy || (file === null && text.trim() === '')} onPress={importCsv} />
          </View>

          {error ? <Text accessibilityRole="alert" style={{ color: colors.expense }}>{error}</Text> : null}

          {result ? (
            <View style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>匯入結果</Text>
              <Text style={{ color: colors.text }}>
                共 {result.totalRows} 列：新增 {result.addedRows} 筆、重複略過 {result.skippedRows} 筆、拒收 {result.rejectedRows} 筆。
              </Text>
              <Text style={{ color: colors.muted }}>套用預設值：{result.defaultedRows} 列（包含最後被略過或拒收的列）。</Text>
              {result.unknownCategories.length > 0 ? (
                <Text style={{ color: colors.expense }}>請先新增這些分類後再匯入：{result.unknownCategories.join('、')}。</Text>
              ) : null}
              {(allRejections ? result.rejections : result.rejections.slice(0, 20)).map((item, i) => (
                <Text key={`${item.row}-${i}`} style={{ color: colors.expense }}>第 {item.row} 列：{item.message}</Text>
              ))}
              {!allRejections && result.rejections.length > 20 ? (
                <Action label={`顯示全部拒收原因（${result.rejections.length} 筆）`} onPress={() => setAllRejections(true)} secondary />
              ) : null}
              {(allDefaults ? result.defaults : result.defaults.slice(0, 20)).map((item, i) => (
                <Text key={`${item.row}-${i}`} style={{ color: colors.muted }}>
                  第 {item.row} 列套用預設值：{item.fields.join('、')}。
                </Text>
              ))}
              {!allDefaults && result.defaults.length > 20 ? (
                <Action label={`顯示全部預設值明細（${result.defaults.length} 列）`} onPress={() => setAllDefaults(true)} secondary />
              ) : null}
            </View>
          ) : null}

          <View style={{ padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface, gap: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>帶走全部交易</Text>
            <Text style={{ color: colors.muted }}>匯出成 UTF-8 CSV，包含全部日期的收入與支出，可再次匯入。</Text>
            <Action label="匯出全部交易 CSV" disabled={busy} onPress={exportCsv} secondary onCard />
          </View>

          <View style={{ padding: 16, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.surface, gap: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>匯出預算資料（付費）</Text>
            <Text style={{ color: colors.muted }}>把預算上限、各月月結、儲備餘額與貸款整理成一份 CSV 報表。要換手機或搬家請用「設定 → 備份」的備份檔，它永遠免費，也包含全部預算資料。</Text>
            <Action label="匯出預算資料 CSV" disabled={busy} onPress={exportBudget} secondary onCard />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Action({ label, onPress, disabled = false, secondary = false, onCard = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; onCard?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: 44, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
        // 次要按鈕：灰底頁面上用白底＋細框；白卡片內（onCard）改用 fill 底色。
        backgroundColor: secondary ? (onCard ? colors.fill : colors.surface) : colors.accent,
        borderWidth: secondary && !onCard ? 1 : 0, borderColor: colors.border, opacity: disabled ? 0.45 : 1 }}
    >
      <Text style={{ color: secondary ? colors.accent : '#ffffff', fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
