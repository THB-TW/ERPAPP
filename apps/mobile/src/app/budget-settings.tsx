import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AdjustmentPreview, BudgetCommand, BudgetMonthView, BudgetRevision, BudgetStatus } from '../ledger/index.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { hasMonthlyCloseEntitlement, useHasPaidAccess } from '../ui/closeEntitlement.ts';
import { formatAmount, monthTitle, userMessage } from '../ui/format.ts';
import { Banner, Card, Chip, Footnote, Group, NavRow, PrimaryButton, SectionTitle, Segmented, kit, text } from '../ui/kit.tsx';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { PaidLock } from '../ui/PaidLock.tsx';
import { budgetCategoryColor, colors, groupColors } from '../ui/theme.ts';
import { useKeyboardHeight } from '../ui/useKeyboardHeight.ts';

type Kind = 'reserve' | 'fixed' | 'actual';
type Category = BudgetStatus['categories'][number];
type Draft = {
  id: string | null;
  name: string;
  kind: Kind;
  amount: string;
  reason: string;
  additions: string[];
};
type Sheet = 'edit' | 'map' | 'retire';
const GROUPS = [
  { key: 'reserve', label: '儲備類', description: '沒花完的會存進罐子' },
  { key: 'fixed', label: '固定支出', description: '沒花完的回到當月盈餘' },
  { key: 'actual', label: '照實支', description: '花多少算多少' },
] as const;
const REASONS = ['薪水調整', '這類開銷變多', '這類開銷變少', '新的生活習慣'];
const MAX_LIMIT = 1_000_000;
const SLIDER_MAX = 20_000;
const SLIDER_STEP = 100;
const kindLabel = (kind: string) => GROUPS.find(group => group.key === kind)?.label ?? '未指定組別';
const knownKind = (kind: string): Kind => kind === 'reserve' || kind === 'fixed' ? kind : 'actual';
const capOf = (status: BudgetStatus, id: string) => status.currentRevision?.limits.find(limit => limit.categoryId === id)?.amount ?? 0;
const categoryName = (status: BudgetStatus, id: string | undefined | null) => status.categories.find(category => category.id === id)?.name ?? '未指定';
const assignedTo = (status: BudgetStatus, id: string) => Object.entries(status.currentRevision?.mapping ?? {})
  .filter(([, target]) => target === id).map(([source]) => source);

function operationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export default function BudgetSettingsScreen() {
  const ledger = useLedger();
  const entitled = useHasPaidAccess();
  const keyboardHeight = useKeyboardHeight();
  const inFlight = useRef(false);
  const focus = useRef(0);
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [latest, setLatest] = useState<BudgetMonthView | null>(null);
  const [sourceCategories, setSourceCategories] = useState<string[]>([]);
  const [revisions, setRevisions] = useState<BudgetRevision[]>([]);
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheet, setSheet] = useState<Sheet>('edit');
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const [retire, setRetire] = useState<{ command: BudgetCommand; result: AdjustmentPreview } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const refresh = useCallback(async (generation: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [next, categories, history, unmapped, loans] = await Promise.all([
        ledger.getBudgetStatus(), ledger.listCategories(), ledger.listBudgetRevisions(),
        ledger.getUnmappedExpenseCategories(), ledger.listLoans(),
      ]);
      const month = next.latestMonth ? await ledger.getBudgetMonth(next.latestMonth) : null;
      if (generation !== focus.current) return;
      const loanIds = new Set(loans.map(loan => loan.categoryId));
      const loanNames = new Set(categories.filter(category => loanIds.has(category.id)).map(category => category.name));
      setStatus(next);
      setLatest(month);
      // 停用分類的舊交易仍可指定歸屬，貸款／分期由自己的提撥管理。
      setSourceCategories([...new Set([
        ...categories.filter(category => category.flow === 'expense' && !loanIds.has(category.id)).map(category => category.name),
        ...Object.keys(next.currentRevision?.mapping ?? {}).filter(name => !loanNames.has(name)),
        ...unmapped.filter(name => !loanNames.has(name)),
      ])]);
      setRevisions(history);
    } catch (cause) {
      if (generation === focus.current) setLoadError(userMessage(cause, '讀取預算設定失敗，請重試。'));
    } finally {
      if (generation === focus.current) setLoading(false);
    }
  }, [ledger]);

  useFocusEffect(useCallback(() => {
    const generation = ++focus.current;
    void refresh(generation);
    return () => { focus.current++; };
  }, [refresh]));

  const active = status?.categories.filter(category => category.active) ?? [];
  const original = active.find(category => category.id === draft?.id);
  const locked = original?.name === '其他';
  const originalCap = status && original ? capOf(status, original.id) : 0;
  const amount = draft?.kind === 'actual' ? 0 : Number(draft?.amount ?? '');
  const validCap = Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_LIMIT;
  const balance = latest?.reserves.find(row => row.categoryId === original?.id)?.balance ?? 0;
  const assigned = status && original ? assignedTo(status, original.id) : [];
  const additions = draft?.additions.filter(name => !assigned.includes(name)) ?? [];
  const canWrite = !loading && !busy && !loadError;
  const canRetire = canWrite && entitled;
  const canSave = !!draft?.name.trim() && !!draft.reason.trim() && validCap
    && (!draft.id || !!original)
    && (!original || draft.name.trim() !== original.name || draft.kind !== original.kind || amount !== originalCap || additions.length > 0);
  const legend = status ? active.filter(category => category.kind !== 'actual').map((category, index) => ({
    id: category.id, name: category.name, cap: capOf(status, category.id), color: budgetCategoryColor(index),
  })) : [];
  const total = legend.reduce((sum, item) => sum + item.cap, 0);

  function openEditor(kind: Kind, category?: Category) {
    if (!status || busy) return;
    setDraft({
      id: category?.id ?? null,
      name: category?.name ?? '',
      kind,
      amount: String(category ? capOf(status, category.id) : 0),
      reason: '',
      additions: [],
    });
    setSheet('edit');
    setRetire(null);
    setSaved(null);
    setError(null);
  }

  function changeDraft(patch: Partial<Draft>) {
    setDraft(current => current ? { ...current, ...patch } : current);
    setRetire(null);
    setError(null);
  }

  function closeSheet() {
    if (inFlight.current) return;
    if (sheet !== 'edit') {
      setSheet('edit');
      setRetire(null);
      setError(null);
    } else setDraft(null);
  }

  async function save() {
    if (!status || !draft || !canSave || !canWrite || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    const generation = focus.current;
    let version = status.version;
    let committed = 0;
    let targetId = original?.id;
    let mappings = status.currentRevision?.mapping;
    const base = { month: status.openMonth, reason: draft.reason.trim() };

    async function run(command: BudgetCommand) {
      const preview = await ledger.previewBudgetCommand(command);
      const result = await ledger.runBudgetCommand(command);
      version = result.version;
      committed++;
      mappings = preview.after.currentRevision?.mapping;
    }

    try {
      const name = locked ? original.name : draft.name.trim();
      const kind = locked ? knownKind(original.kind) : draft.kind;
      if (!original || name !== original.name || kind !== original.kind || amount !== originalCap) {
        const id = operationId();
        await run({ ...base, version, operationId: id, action: original ? 'edit' : 'add', from: original?.id, name, kind, amount });
        // 新增或改組時帳本服務以操作識別碼建立新的分類 ID。
        if (!original || kind !== original.kind) targetId = id;
      }
      for (const source of additions) {
        if (locked || mappings?.[source] === targetId) continue;
        try {
          await run({ ...base, version, operationId: operationId(), action: 'map', sourceCategory: source, to: targetId });
        } catch (cause) {
          throw new Error(`「${source}」的歸屬未儲存。${userMessage(cause, '請重新確認分類與開放月份。')}`);
        }
      }
      if (generation === focus.current) {
        setDraft(null);
        setSaved('已儲存預算設定。');
      }
    } catch (cause) {
      if (generation === focus.current) {
        const savedId = targetId;
        if (savedId && savedId !== draft.id) setDraft(current => current ? { ...current, id: savedId } : current);
        const message = cause instanceof Error ? cause.message : '儲存失敗，請重試。';
        setError(committed > 0 ? `已儲存 ${committed} 筆變更，其餘已停止。${message}` : message);
      }
    } finally {
      if (committed > 0) void syncNotifications(ledger).catch(() => {});
      if (generation === focus.current) await refresh(generation);
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function retireCategory() {
    if (!status || !original || locked || !canRetire || !draft?.reason.trim() || balance < 0
        || (balance > 0 && !transferTo) || inFlight.current || !hasMonthlyCloseEntitlement()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    const generation = focus.current;
    try {
      if (retire) {
        await ledger.confirmAdjustment({ command: retire.command, previewToken: retire.result.previewToken, hasEntitlement: hasMonthlyCloseEntitlement() });
        void syncNotifications(ledger).catch(() => {});
        if (generation === focus.current) {
          setDraft(null);
          setSaved(`已停用「${original.name}」。`);
          await refresh(generation);
        }
      } else {
        const command: BudgetCommand = {
          action: 'retire', operationId: operationId(), version: status.version, month: status.openMonth,
          reason: draft.reason, from: original.id, to: transferTo,
        };
        const result = await ledger.previewAdjustment({ command, hasEntitlement: hasMonthlyCloseEntitlement() });
        if (generation === focus.current) setRetire({ command, result });
      }
    } catch (cause) {
      if (generation === focus.current) {
        setRetire(null);
        setError(userMessage(cause, '停用失敗，請重新確認。'));
        await refresh(generation);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={kit.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: '預算與分類' }} />
      <ScrollView contentContainerStyle={[kit.content, styles.pageContent]}>
        {loading && !status ? <ActivityIndicator accessibilityLabel="讀取預算設定中" /> : null}
        {saved ? <Banner>{saved}</Banner> : null}
        {loadError ? <>
          <Text style={text.error} accessibilityRole="alert">{loadError}</Text>
          <PrimaryButton title="重新讀取" tone="secondary" onPress={() => void refresh(focus.current)} />
        </> : null}
        {status ? <>
          <Card style={styles.summary}>
            <View style={kit.rowBetween}>
              <Text style={text.headline}>每月上限合計</Text>
              <Text style={text.title}>NT$ {formatAmount(total)}</Text>
            </View>
            <View style={[kit.progressTrack, styles.bar]} accessible accessibilityLabel={`每月上限合計 ${formatAmount(total)} 元`}>
              {legend.filter(item => item.cap > 0).map(item => <View key={item.id} style={{ flex: item.cap, backgroundColor: item.color }} />)}
            </View>
            {legend.length > 0 ? <View style={styles.chips}>{legend.map(item => (
              <View key={item.id} style={styles.legend}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text style={text.caption}>{item.name} {formatAmount(item.cap)}</Text>
              </View>
            ))}</View> : <Footnote>目前沒有設定每月上限。</Footnote>}
            <Text style={text.footnote}>從開放月份 {monthTitle(status.openMonth)} 開始，已結月份不變。</Text>
          </Card>
          {GROUPS.map(group => (
            <View style={kit.section} key={group.key}>
              <SectionTitle color={groupColors[group.key]} right={<Text style={text.caption}>{group.description}</Text>}>{group.label}</SectionTitle>
              <Group>
                {active.filter(category => category.kind === group.key).map(category => {
                  const assignments = assignedTo(status, category.id);
                  return (
                    <Pressable key={category.id} onPress={() => openEditor(group.key, category)} accessibilityRole="button"
                      style={({ pressed }) => [kit.row, pressed && kit.pressed]}>
                      <View style={[styles.dot, { backgroundColor: legend.find(item => item.id === category.id)?.color ?? groupColors[group.key] }]} />
                      <View style={styles.grow}>
                        <Text style={text.body}>{category.name}</Text>
                        <Text style={text.caption} numberOfLines={2}>包含：{assignments.join('、') || '尚未指定'}</Text>
                      </View>
                      <Text style={text.subhead}>{group.key === 'actual' ? '照實支' : formatAmount(capOf(status, category.id))}</Text>
                      <Text style={[text.title, styles.chevron]}>›</Text>
                    </Pressable>
                  );
                })}
                <NavRow title={`＋ 新增${group.label}分類`} tone="accent" disabled={!canWrite} onPress={() => openEditor(group.key)} />
              </Group>
            </View>
          ))}
          <View style={kit.section}>
            <SectionTitle>上限版本紀錄</SectionTitle>
            {revisions.length === 0 ? <Footnote>還沒有儲存過上限版本。</Footnote> : (
              <Group>{[...revisions].reverse().map((revision, index) => (
                <View key={revision.id}>
                  <Pressable style={kit.row} accessibilityRole="button" accessibilityState={{ expanded: expandedRevision === revision.id }}
                    onPress={() => setExpandedRevision(expandedRevision === revision.id ? null : revision.id)}>
                    <View style={styles.grow}>
                      <Text style={text.body}>{monthTitle(revision.month)}・第 {revisions.length - index} 版</Text>
                      <Text style={text.caption}>{revision.reason}{revision.time ? `・${revision.time.slice(0, 10)}` : ''}</Text>
                    </View>
                    <Text style={text.subhead}>{expandedRevision === revision.id ? '⌃' : '⌄'}</Text>
                  </Pressable>
                  {expandedRevision === revision.id ? <RevisionDetails revision={revision} status={status} /> : null}
                </View>
              ))}</Group>
            )}
          </View>
        </> : null}
      </ScrollView>

      <Modal visible={draft !== null} presentationStyle="formSheet" animationType="slide" onRequestClose={closeSheet} allowSwipeDismissal={sheet === 'edit' && !busy}>
        {status && draft ? (
          <SafeAreaView style={kit.screen}>
            <View style={styles.sheetHeader}>
              <Text style={[text.title, styles.grow]}>{sheet === 'map' ? '加入交易分類' : sheet === 'retire' ? '停用分類' : original?.name ?? '新增分類'}</Text>
              <Chip label={sheet === 'edit' ? '取消' : '返回'} active={false} disabled={busy} onPress={closeSheet} />
            </View>
            <ScrollView key={sheet} keyboardShouldPersistTaps="handled" contentContainerStyle={[kit.content, styles.sheetContent, { paddingBottom: keyboardHeight + 24 }]}>
              {sheet === 'map' ? (
                <Group>
                  {sourceCategories.filter(name => !assigned.includes(name) && name !== draft.name.trim()).map(name => {
                    const selected = draft.additions.includes(name);
                    const target = status.currentRevision?.mapping[name];
                    return <Pressable key={name} style={kit.row} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
                      onPress={() => changeDraft({ additions: selected ? draft.additions.filter(value => value !== name) : [...draft.additions, name] })}>
                      <View style={styles.grow}>
                        <Text style={text.body}>{name}</Text>
                        <Text style={text.caption}>{target ? `目前歸屬 ${categoryName(status, target)}` : '尚未指定歸屬'}</Text>
                      </View>
                      <Text style={text.link}>{selected ? '✓' : '＋'}</Text>
                    </Pressable>;
                  })}
                  {!sourceCategories.some(name => !assigned.includes(name) && name !== draft.name.trim()) ? <Text style={[text.footnote, kit.cardPadding]}>沒有可加入的支出交易分類。</Text> : null}
                </Group>
              ) : sheet === 'retire' ? (
                <>
                  {!entitled ? <PaidLock feature="adjustments" note="停用分類需要有效的付費權益。" /> : null}
                  <Footnote>停用「{original?.name}」從 {monthTitle(status.openMonth)} 開始。歷史交易與已結月份仍會保留。</Footnote>
                  {original?.kind === 'reserve' ? <Card>
                    <Text style={text.headline}>剩餘儲備 {formatAmount(balance)} 元</Text>
                    {balance < 0 ? <Text style={text.error}>請先補足負儲備。</Text> : balance === 0 ? <Footnote>餘額為 0，不需要轉入其他分類。</Footnote> : <>
                      <Text style={text.subhead}>剩餘儲備轉入</Text>
                      <View style={styles.chips}>{active.filter(category => category.kind === 'reserve' && category.id !== original.id).map(category => (
                        <Chip key={category.id} label={category.name} active={transferTo === category.id} disabled={!canRetire}
                          onPress={() => { setTransferTo(category.id); setRetire(null); setError(null); }} />
                      ))}</View>
                    </>}
                  </Card> : null}
                  <Reasons value={draft.reason} disabled={!canRetire} onChange={reason => changeDraft({ reason })} />
                  {retire ? <Card>
                    <Text style={text.headline}>停用後</Text>
                    <Text style={text.subhead}>「{original?.name}」將從開放月份停用。</Text>
                    {retire.result.changes.map((change, index) => (
                      <Text style={text.subhead} key={index}>
                        {change.field === 'reserve' ? categoryName(status, change.categoryId) : change.field === 'spare' ? '可用餘額' : '帳面總資產'} {formatAmount(change.before)} → {formatAmount(change.after)}
                      </Text>
                    ))}
                  </Card> : null}
                  <PrimaryButton title={retire ? '確認停用' : '預覽停用'} tone={retire ? 'destructive' : 'accent'}
                    disabled={!canRetire || !draft.reason.trim() || balance < 0 || (balance > 0 && !transferTo)}
                    onPress={() => void retireCategory()} />
                </>
              ) : (
                <>
                  <Card>
                    <Text style={text.headline}>名稱</Text>
                    <TextInput style={kit.input} value={draft.name} editable={!!canWrite && !locked}
                      maxLength={30} accessibilityLabel="分類名稱" placeholder="例如：寵物" onChangeText={name => changeDraft({ name })} />
                    <Text style={text.headline}>組別</Text>
                    <Segmented options={GROUPS} value={draft.kind} disabled={!canWrite || locked} onChange={kind => changeDraft({ kind })} />
                    {locked ? <Text style={text.footnote}>「其他」是固定分類，只能調整每月上限。</Text> : null}
                    {draft.kind !== 'actual' ? <>
                      <Text style={text.headline}>每月上限</Text>
                      <View style={styles.stepper}>
                        <Chip label="−500" active={false} disabled={!canWrite || amount === 0}
                          onPress={() => changeDraft({ amount: String(Math.max(0, amount - 500)) })} />
                        <TextInput style={[kit.input, styles.grow, styles.capInput]} value={draft.amount} editable={!!canWrite}
                          keyboardType="number-pad" maxLength={7} accessibilityLabel="每月上限"
                          onChangeText={value => changeDraft({ amount: value.replace(/\D/g, '') })} />
                        <Chip label="+500" active={false} disabled={!canWrite || amount >= MAX_LIMIT}
                          onPress={() => changeDraft({ amount: String(Math.min(MAX_LIMIT, amount + 500)) })} />
                      </View>
                      <LimitSlider value={amount} disabled={!canWrite} onChange={value => changeDraft({ amount: String(value) })} />
                      {!validCap ? <Text style={text.error}>每月上限須介於 0 到 1,000,000 元。</Text> : null}
                    </> : <Text style={text.footnote}>照實支不設上限，花多少算多少。</Text>}
                    {original && draft.kind !== original.kind && balance !== 0 ? (
                      <Text style={text.error}>請先移轉或補足儲備至 0，再更改組別。</Text>
                    ) : null}
                  </Card>
                  <Card>
                    <Text style={text.headline}>記帳時這些分類算在這裡</Text>
                    <View style={styles.chips}>
                      {[...new Set([...assigned, ...additions])].map(name => (
                        <View style={styles.tag} key={name}><Text style={text.caption}>{name}</Text></View>
                      ))}
                      {!locked ? <Chip label="＋ 加入" active={false} disabled={!canWrite}
                        onPress={() => { Keyboard.dismiss(); setSheet('map'); setError(null); }} /> : null}
                    </View>
                    {!original ? <Text style={text.footnote}>儲存後，同名的記帳分類會自動歸屬到這裡。</Text> : null}
                  </Card>
                  <Reasons value={draft.reason} disabled={!canWrite} onChange={reason => changeDraft({ reason })} />
                  <Card>
                    <Text style={text.headline}>存了以後</Text>
                    <Text style={text.caption}>從 {monthTitle(status.openMonth)} 起，已結月份不變。</Text>
                    {original && original.name !== draft.name.trim() ? <Text style={text.subhead}>名稱 {original.name} → {draft.name.trim() || '（未命名）'}</Text> : null}
                    {!original ? <Text style={text.subhead}>新增「{draft.name.trim() || '未命名'}」</Text> : null}
                    <Text style={text.subhead}>
                      組別 {original && original.kind !== draft.kind ? `${kindLabel(original.kind)} → ` : ''}{kindLabel(draft.kind)}
                    </Text>
                    <Text style={text.subhead}>
                      上限 {original ? `${original.kind === 'actual' ? '照實支' : formatAmount(originalCap)} → ` : ''}{draft.kind === 'actual' ? '照實支' : formatAmount(amount)}
                    </Text>
                    {additions.map(name => <Text key={name} style={text.subhead}>{name}：{categoryName(status, status.currentRevision?.mapping[name])} → {draft.name.trim() || '新分類'}</Text>)}
                  </Card>
                  {error ? <Text style={text.error} accessibilityRole="alert">{error}</Text> : null}
                  {loadError ? <>
                    <Text style={text.error} accessibilityRole="alert">{loadError}</Text>
                    <PrimaryButton title="重新讀取" tone="secondary" disabled={busy} onPress={() => void refresh(focus.current)} />
                  </> : null}
                  <PrimaryButton title={busy ? '處理中…' : '儲存'} disabled={!canWrite || !canSave || (!!original && draft.kind !== original.kind && balance !== 0)}
                    onPress={() => void save()} />
                  {original && !locked ? <PrimaryButton title="停用這個分類…" tone="destructive" disabled={!canWrite}
                    onPress={() => { Keyboard.dismiss(); setTransferTo(null); setRetire(null); setError(null); setSheet('retire'); }} /> : null}
                </>
              )}
              {sheet === 'retire' && error ? <Text style={text.error} accessibilityRole="alert">{error}</Text> : null}
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

function Reasons({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <Card>
    <Text style={text.headline}>原因（必填）</Text>
    <View style={styles.chips}>{REASONS.map(reason => (
      <Chip key={reason} label={reason} active={value === reason} disabled={disabled} onPress={() => onChange(reason)} />
    ))}</View>
    <TextInput style={kit.input} value={value} editable={!disabled} maxLength={300} multiline
      accessibilityLabel="修改原因" placeholder="或自己寫" onChangeText={onChange} />
  </Card>;
}

function LimitSlider({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [width, setWidth] = useState(0);
  const start = useRef({ page: 0, local: 0 });
  const displayed = Math.min(SLIDER_MAX, value);
  function update(position: number) {
    if (disabled || width <= 0) return;
    const fraction = Math.max(0, Math.min(1, position / width));
    onChange(Math.round(fraction * SLIDER_MAX / SLIDER_STEP) * SLIDER_STEP);
  }
  return <View style={kit.section}>
    <View style={styles.slider} onLayout={event => setWidth(event.nativeEvent.layout.width)}
      accessible accessibilityRole="adjustable" accessibilityLabel="每月上限滑桿" accessibilityState={{ disabled }}
      accessibilityValue={{ min: 0, max: SLIDER_MAX, now: displayed }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        if (disabled) return;
        const step = event.nativeEvent.actionName === 'increment' ? SLIDER_STEP : -SLIDER_STEP;
        onChange(Math.max(0, Math.min(SLIDER_MAX, Math.round(displayed / SLIDER_STEP) * SLIDER_STEP + step)));
      }}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={event => {
        start.current = { page: event.nativeEvent.pageX, local: event.nativeEvent.locationX };
        update(start.current.local);
      }}
      onResponderMove={event => update(start.current.local + event.nativeEvent.pageX - start.current.page)}
      onResponderTerminationRequest={() => false}>
      <View style={kit.progressTrack} pointerEvents="none">
        <View style={[styles.sliderFill, { width: `${displayed / SLIDER_MAX * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: Math.max(0, Math.min(width - 18, width * displayed / SLIDER_MAX - 9)) }]} />
    </View>
    <View style={kit.rowBetween}><Text style={text.caption}>0</Text><Text style={text.caption}>20,000</Text></View>
  </View>;
}

function RevisionDetails({ revision, status }: { revision: BudgetRevision; status: BudgetStatus }) {
  return <View style={kit.cardPadding}>
    {revision.limits.map(limit => {
      const category = status.categories.find(candidate => candidate.id === limit.categoryId);
      return <Text key={limit.categoryId} style={text.footnote}>
        {category?.name ?? '歷史分類'}・{kindLabel(category?.kind ?? '')}{category?.kind === 'actual' ? '' : ` 上限 ${formatAmount(limit.amount)}`}
      </Text>;
    })}
    {revision.tuition !== 0 ? <Text style={text.footnote}>學費每月提撥（沿用）：{formatAmount(revision.tuition)}</Text> : null}
    <Text style={text.subhead}>交易分類歸屬</Text>
    {Object.entries(revision.mapping).map(([source, target]) => <Text key={source} style={text.footnote}>{source} → {categoryName(status, target)}</Text>)}
    {Object.keys(revision.mapping).length === 0 ? <Text style={text.footnote}>尚未指定交易分類歸屬。</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  pageContent: { gap: 16 },
  sheetContent: { gap: 12 },
  summary: { gap: 10 },
  grow: { flex: 1 },
  bar: { flexDirection: 'row', height: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chevron: { color: colors.chevron },
  sheetHeader: { ...kit.rowBetween, paddingHorizontal: 16, paddingVertical: 8 },
  stepper: { ...kit.rowBetween, gap: 8 },
  capInput: { textAlign: 'center', minWidth: 80 },
  slider: { minHeight: 44, justifyContent: 'center' },
  sliderFill: { height: '100%', backgroundColor: colors.accent },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent },
  tag: { borderRadius: 10, backgroundColor: colors.fill, paddingHorizontal: 10, paddingVertical: 8 },
});
