import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BudgetRuleError, LedgerError } from '../ledger/index.ts';
import type { BudgetCommand, BudgetCommandPreview, BudgetRevision, BudgetStatus } from '../ledger/index.ts';
import { formatAmount, monthTitle } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

type Mode = 'edit' | 'add' | 'retire' | 'map';
type Kind = 'reserve' | 'fixed' | 'actual';
const MODES: { id: Mode; label: string }[] = [
  { id: 'edit', label: '改上限與組別' }, { id: 'add', label: '新增分類' },
  { id: 'retire', label: '停用分類' }, { id: 'map', label: '交易分類歸屬' },
];
const GROUPS: { id: Kind; label: string }[] = [
  { id: 'reserve', label: '儲備類' }, { id: 'fixed', label: '固定支出' }, { id: 'actual', label: '照實支' },
];
const kindLabel = (kind: string) => GROUPS.find((group) => group.id === kind)?.label ?? '未指定組別';
const knownKind = (kind: string): Kind => kind === 'reserve' || kind === 'fixed' ? kind : 'actual';
const categoryName = (status: BudgetStatus, id: string | undefined | null) => status.categories.find((category) => category.id === id)?.name ?? '未指定';

/** 只作重送識別碼，不作密碼或安全憑證。 */
function operationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof BudgetRuleError || error instanceof LedgerError ? error.message : '操作失敗，請稍後再試或重新讀取。';
}

export default function BudgetSettingsScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const scroll = useRef<ScrollViewInstance>(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [sourceCategories, setSourceCategories] = useState<string[]>([]);
  const [revisions, setRevisions] = useState<BudgetRevision[]>([]);
  const [mode, setMode] = useState<Mode>('edit');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('actual');
  const [amount, setAmount] = useState('');
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [mapTo, setMapTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ command: BudgetCommand; result: BudgetCommandPreview } | null>(null);
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    Promise.all([ledger.getBudgetStatus(), ledger.listCategories(), ledger.listBudgetRevisions(), ledger.getUnmappedExpenseCategories()]).then(
      ([nextStatus, categories, history, unmapped]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        // 停用類別的舊交易仍須保留原分類；即使不再供記帳選用，也要能重新指定其歸屬。
        setSourceCategories([...new Set([...categories.filter((category) => category.flow === 'expense').map((category) => category.name), ...unmapped])]);
        setRevisions(history);
        const first = nextStatus.categories.find((category) => category.active);
        setMode(first ? 'edit' : 'add');
        setSelectedId(first?.id ?? null);
        setName(first?.name ?? '');
        setKind(first ? knownKind(first.kind) : 'actual');
        setAmount(String(nextStatus.currentRevision?.limits.find((limit) => limit.categoryId === first?.id)?.amount ?? 0));
        setSourceName(null);
        setMapTo(null);
        setTransferTo(null);
        setReason('');
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setStatus(null);
        setError(errorMessage(e));
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [ledger, reload]));

  function invalidatePreview() {
    setPreview(null);
    setError(null);
    setSuccess(null);
  }

  function chooseCategory(id: string) {
    invalidatePreview();
    const category = status?.categories.find((candidate) => candidate.id === id);
    setSelectedId(id);
    setName(category?.name ?? '');
    setKind(knownKind(category?.kind ?? 'actual'));
    setAmount(String(status?.currentRevision?.limits.find((limit) => limit.categoryId === id)?.amount ?? 0));
    setTransferTo(null);
  }

  function chooseMode(next: Mode) {
    invalidatePreview();
    setMode(next);
    setReason('');
    setTransferTo(null);
    if (next === 'add') {
      setName('');
      setKind('actual');
      setAmount('0');
    } else if (selectedId) {
      chooseCategory(selectedId);
    }
  }

  async function showPreview() {
    if (!status || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    invalidatePreview();
    Keyboard.dismiss();
    const command: BudgetCommand = {
      action: mode, operationId: operationId(), version: status.version, month: status.openMonth, reason,
      ...(mode === 'add' || mode === 'edit' ? { name, kind, amount: kind === 'actual' ? 0 : amount === '' ? 0 : Number(amount) } : {}),
      ...(mode === 'edit' || mode === 'retire' ? { from: selectedId } : {}),
      ...(mode === 'retire' ? { to: transferTo } : {}),
      ...(mode === 'map' ? { sourceCategory: sourceName, to: mapTo } : {}),
    };
    try {
      setPreview({ command, result: await ledger.previewBudgetCommand(command) });
    } catch (e) {
      setError(errorMessage(e));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function savePreview() {
    if (!preview || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      // 儲存與預覽使用完全相同的指令，帳本服務仍會重新確認版本與開放月份。
      await ledger.runBudgetCommand(preview.command);
      setPreview(null);
      setSuccess('已儲存，並保留這次修改的上限版本與原因。');
      scroll.current?.scrollTo({ y: 0, animated: true });
      setReload((value) => value + 1);
    } catch (e) {
      setPreview(null);
      setError(errorMessage(e));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const active = status?.categories.filter((category) => category.active) ?? [];
  const disabled = busy || loading;
  const canPreview = status && (mode === 'add' || (mode === 'map' ? sourceName && mapTo : selectedId));

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: '預算與分類' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {loading ? <ActivityIndicator accessibilityLabel="讀取預算設定中" /> : null}
          {success ? <Text style={{ color: colors.income }} accessibilityLiveRegion="polite">{success}</Text> : null}
          {error ? <Text style={{ color: colors.expense }} accessibilityRole="alert">{error}</Text> : null}
          <Pressable onPress={() => { setSuccess(null); setReload((value) => value + 1); }} disabled={disabled} accessibilityRole="button" style={styles.textButton}>
            <Text style={styles.link}>重新讀取</Text>
          </Pressable>

          {!loading && status ? (
            <>
              <View style={styles.card}>
                <Text style={styles.heading}>開放月份：{monthTitle(status.openMonth)}</Text>
                <Text style={styles.note}>上限、預算組與歸屬只從這個月開始生效。每次修改都要先預覽、填寫原因，再確認儲存。</Text>
                <Text style={styles.note}>預算上限與本月進度免費使用。</Text>
              </View>

              <View style={styles.chips}>
                {MODES.map((item) => <Chip key={item.id} label={item.label} selected={mode === item.id} disabled={disabled} onPress={() => chooseMode(item.id)} />)}
              </View>
              {mode !== 'add' && mode !== 'map' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>選擇預算分類</Text>
                  <View style={styles.chips}>
                    {active.map((category) => <Chip key={category.id} label={category.name} selected={selectedId === category.id} disabled={disabled} onPress={() => chooseCategory(category.id)} />)}
                  </View>
                  {active.length === 0 ? <Text style={styles.note}>還沒有使用中的預算分類，請先新增分類。</Text> : null}
                </View>
              ) : null}

              {mode === 'add' || mode === 'edit' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>分類名稱</Text>
                  <TextInput value={name} editable={!disabled} maxLength={30} onChangeText={(value) => { invalidatePreview(); setName(value); }} placeholder="1～30 字，不可重複" accessibilityLabel="分類名稱" style={styles.input} />
                  <Text style={styles.label}>預算組</Text>
                  <View style={styles.chips}>
                    {GROUPS.map((group) => <Chip key={group.id} label={group.label} selected={kind === group.id} disabled={disabled} onPress={() => { invalidatePreview(); setKind(group.id); }} />)}
                  </View>
                  {kind === 'actual' ? <Text style={styles.note}>照實支不設定上限。</Text> : (
                    <>
                      <Text style={styles.label}>每月上限（新台幣整數）</Text>
                      <TextInput value={amount} editable={!disabled} onChangeText={(value) => { invalidatePreview(); setAmount(value.replace(/\D/g, '')); }} keyboardType="number-pad" maxLength={7} accessibilityLabel="每月上限" placeholder="0～1,000,000" style={styles.input} />
                    </>
                  )}
                  {mode === 'edit' ? <Text style={styles.note}>若分類仍有儲備，請先移轉或補足至 0，才能更改預算組。</Text> : null}
                </View>
              ) : null}

              {mode === 'retire' ? (
                <View style={styles.field}>
                  <Text style={styles.note}>停用後不再提供新增交易選用，原本的交易與已結月份仍會保留。</Text>
                  <Text style={styles.label}>剩餘儲備轉入</Text>
                  <View style={styles.chips}>
                    <Chip label="沒有儲備，不轉入" selected={transferTo === null} disabled={disabled} onPress={() => { invalidatePreview(); setTransferTo(null); }} />
                    {active.filter((category) => category.id !== selectedId && category.kind === 'reserve').map((category) => (
                      <Chip key={category.id} label={category.name} selected={transferTo === category.id} disabled={disabled} onPress={() => { invalidatePreview(); setTransferTo(category.id); }} />
                    ))}
                  </View>
                  <Text style={styles.note}>仍有正儲備時，必須指定另一個儲備類別；負儲備須先補足。預覽會列出移轉前後金額。</Text>
                </View>
              ) : null}

              {mode === 'map' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>交易分類</Text>
                  <View style={styles.chips}>
                    {sourceCategories.map((category) => <Chip key={category} label={category} selected={sourceName === category} disabled={disabled} onPress={() => {
                      invalidatePreview(); setSourceName(category);
                      const current = status.currentRevision?.mapping[category];
                      setMapTo(active.some((target) => target.id === current) ? current! : null);
                    }} />)}
                  </View>
                  {sourceCategories.length === 0 ? <Text style={styles.note}>尚無支出交易分類，請先新增分類。</Text> : null}
                  <Text style={styles.label}>歸屬到預算分類</Text>
                  <View style={styles.chips}>
                    {active.map((category) => <Chip key={category.id} label={`${category.name}・${kindLabel(category.kind)}`} selected={mapTo === category.id} disabled={disabled} onPress={() => { invalidatePreview(); setMapTo(category.id); }} />)}
                  </View>
                  {active.length === 0 ? <Text style={styles.note}>請先新增預算分類，再指定歸屬。</Text> : null}
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>修改原因（必填，1～300 字）</Text>
                <TextInput value={reason} editable={!disabled} onChangeText={(value) => { invalidatePreview(); setReason(value); }} maxLength={300} multiline placeholder="例如：調整通勤方式，重新分配交通支出" accessibilityLabel="修改原因" style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]} />
                <Text style={styles.note}>{reason.length} / 300 字</Text>
              </View>
              <Button label={busy ? '處理中…' : '預覽變更'} disabled={disabled || !canPreview} onPress={showPreview} />

              {preview ? (
                <View style={styles.preview} onLayout={(event) => { scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true }); }}>
                  <Text style={styles.heading}>儲存前預覽</Text>
                  {previewSummary(preview.command, preview.result).map((line) => <Text key={line} style={{ color: colors.text, lineHeight: 22 }}>{line}</Text>)}
                  <Text style={styles.note}>原因：{preview.command.reason.trim()}</Text>
                  {preview.result.changes.length > 0 ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>儲備移轉前後</Text>
                      {preview.result.changes.map((change, index) => (
                        <Text key={index} style={styles.note}>
                          {monthTitle(change.month)}・{change.field === 'reserve' ? `${categoryName(preview.result.before, change.categoryId)}儲備` : change.field === 'spare' ? '可用餘額' : '帳面總資產'}：{formatAmount(change.before)} → {formatAmount(change.after)}
                        </Text>
                      ))}
                      <Text style={styles.note}>移轉只改變分類儲備的分配，總儲備金與帳面總資產不變。</Text>
                    </View>
                  ) : null}
                  <Text style={styles.label}>儲存後的完整上限與歸屬</Text>
                  {preview.result.after.currentRevision ? <RevisionDetails revision={preview.result.after.currentRevision} status={preview.result.after} /> : null}
                  <Button label="確認儲存" disabled={disabled} onPress={savePreview} />
                  <Button label="返回修改" secondary disabled={disabled} onPress={() => { setPreview(null); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.heading}>上限版本紀錄</Text>
                {revisions.length === 0 ? <Text style={styles.note}>還沒有儲存過上限版本。</Text> : null}
                {[...revisions].reverse().map((revision, index) => (
                  <View key={revision.id} style={styles.card}>
                    <Pressable onPress={() => setExpandedRevision(expandedRevision === revision.id ? null : revision.id)} accessibilityRole="button" accessibilityState={{ expanded: expandedRevision === revision.id }} style={styles.historyButton}>
                      <Text style={styles.label}>{monthTitle(revision.month)}・第 {revisions.length - index} 版 {expandedRevision === revision.id ? '⌃' : '⌄'}</Text>
                      <Text style={styles.note}>{revision.reason}</Text>
                      {revision.time ? <Text style={styles.note}>{revision.time.slice(0, 10)}</Text> : null}
                    </Pressable>
                    {expandedRevision === revision.id ? <RevisionDetails revision={revision} status={status} /> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function previewSummary(command: BudgetCommand, result: BudgetCommandPreview): string[] {
  const { before, after } = result;
  if (command.action === 'map') return [
    `${command.sourceCategory}：${categoryName(before, before.currentRevision?.mapping[command.sourceCategory!])} → ${categoryName(after, after.currentRevision?.mapping[command.sourceCategory!])}`,
  ];
  if (command.action === 'retire') return [`停用：${categoryName(before, command.from)}`, ...(command.to ? [`剩餘儲備轉入：${categoryName(after, command.to)}`] : [])];
  const oldCategory = before.categories.find((category) => category.id === command.from);
  const newCategory = after.categories.find((category) => category.active && (category.id === command.operationId || category.id === command.from));
  const oldCap = before.currentRevision?.limits.find((limit) => limit.categoryId === command.from)?.amount ?? 0;
  const capText = (group: string | undefined, cap: number) => group === 'actual' ? '照實支' : `上限 ${formatAmount(cap)}`;
  return command.action === 'add' ? [
    `新增：${newCategory?.name ?? command.name}・${kindLabel(newCategory?.kind ?? command.kind ?? 'actual')}・${capText(newCategory?.kind, command.amount ?? 0)}`,
  ] : [
    `名稱：${oldCategory?.name} → ${newCategory?.name}`,
    `預算組：${kindLabel(oldCategory?.kind ?? '')} → ${kindLabel(newCategory?.kind ?? '')}`,
    `${capText(oldCategory?.kind, oldCap)} → ${capText(newCategory?.kind, command.amount ?? 0)}`,
  ];
}

function RevisionDetails({ revision, status }: { revision: BudgetRevision; status: BudgetStatus }) {
  return (
    <View style={styles.field}>
      {revision.limits.map((limit) => {
        const category = status.categories.find((candidate) => candidate.id === limit.categoryId);
        return <Text key={limit.categoryId} style={styles.note}>{category?.name ?? '歷史分類'}・{kindLabel(category?.kind ?? '')} {category?.kind === 'actual' ? '' : `上限 ${formatAmount(limit.amount)}`}</Text>;
      })}
      {revision.tuition !== 0 ? <Text style={styles.note}>學費每月提撥（沿用）：{formatAmount(revision.tuition)}</Text> : null}
      <Text style={styles.label}>交易分類歸屬</Text>
      {Object.entries(revision.mapping).map(([source, target]) => <Text key={source} style={styles.note}>{source} → {categoryName(status, target)}</Text>)}
      {Object.keys(revision.mapping).length === 0 ? <Text style={styles.note}>尚未指定交易分類歸屬。</Text> : null}
    </View>
  );
}

function Chip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }} style={[styles.chip, { backgroundColor: selected ? colors.accent : colors.surface, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: selected ? '#fff' : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function Button({ label, disabled, onPress, secondary }: { label: string; disabled: boolean; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.button, { backgroundColor: secondary ? colors.surface : colors.accent, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: secondary ? colors.text : '#fff', fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  link: { color: colors.accent, fontSize: 15 },
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: 12, gap: 10 },
  field: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text, minHeight: 46 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10 },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
  preview: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 14, gap: 14 },
  historyButton: { minHeight: 44, gap: 6 },
});
