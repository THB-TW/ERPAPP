import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AdjustmentPreview, AdjustmentRequest, BudgetAdjustmentView, BudgetMonthView, BudgetStatus } from '../ledger/index.ts';
import { useLedger } from './LedgerProvider.tsx';
import { hasMonthlyCloseEntitlement, useHasPaidAccess } from './closeEntitlement.ts';
import { warning, success } from './haptics.ts';
import { formatAmount, userMessage } from './format.ts';
import { Card, Chip, Footnote, Group, NavRow, PrimaryButton, SectionTitle, kit, text } from './kit.tsx';
import { colors } from './theme.ts';
import { useKeyboardHeight } from './useKeyboardHeight.ts';
import { PaidLock } from './PaidLock.tsx';
import { syncNotifications } from '../platform/notificationSync.ts';
import { newOperationId } from './operationId.ts';

type Source = { id: string; name: string; balance: number };
type Move = { from: Source; to: Source };
const WALLET = 'available-wallet';

export function VisualAdjustments() {
  const ledger = useLedger();
  const entitled = useHasPaidAccess();
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [latest, setLatest] = useState<BudgetMonthView | null>(null);
  const [history, setHistory] = useState<BudgetAdjustmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  const [preview, setPreview] = useState<{ request: AdjustmentRequest; result: AdjustmentPreview } | null>(null);
  const targets = useRef(new Map<string, ComponentRef<typeof View>>());
  const keyboardHeight = useKeyboardHeight();
  useFocusEffect(useCallback(() => {
    alive.current = true;
    let cancelled = false;
    setLoading(true); setError(null); setMove(null); setSource(null);
    Promise.all([ledger.getBudgetStatus(), ledger.listBudgetAdjustments()]).then(async ([next, rows]) => ({
      next, rows, snapshot: next.latestMonth ? await ledger.getBudgetMonth(next.latestMonth) : null,
    })).then(({ next, rows, snapshot }) => {
      if (cancelled) return;
      setStatus(next); setLatest(snapshot); setHistory(rows); setLoading(false);
    }, e => { if (!cancelled) { setError(userMessage(e, '讀取失敗，請重試。')); setLoading(false); setStatus(null); } });
    return () => { cancelled = true; alive.current = false; };
  }, [ledger, retry]));
  const jars: Source[] = (status?.categories ?? []).filter(c => c.active && c.kind === 'reserve')
    .map(c => ({ id: c.id, name: c.name, balance: latest?.reserves.find(r => r.categoryId === c.id)?.balance ?? 0 }));
  const wallet = { id: WALLET, name: '可用餘額', balance: latest?.spare ?? 0 };
  const disabled = loading || busy || !entitled || !latest;
  function openMove(from: Source, to: Source) {
    if (disabled || from.id === to.id || from.balance <= 0) return;
    setMove({ from, to }); setSource(null); setAmount(String(from.balance)); setReason(''); setPreview(null); setError(null);
  }
  function tap(item: Source) {
    if (disabled) return;
    if (source && item.id !== WALLET && source.id !== item.id) { openMove(source, item); return; }
    if (item.balance <= 0) { warning(); return; }
    setSource(source?.id === item.id ? null : item);
  }
  async function drop(from: Source, x: number, y: number) {
    setDragging(false);
    if (disabled) return;
    const hit = await Promise.all(jars.filter(j => j.id !== from.id).map(j => new Promise<Source | null>(resolve => {
      const target = targets.current.get(j.id);
      if (!target) { resolve(null); return; }
      target.measureInWindow((left, top, width, height) => resolve(x >= left && x <= left + width && y >= top && y <= top + height ? j : null));
    })));
    const to = hit.find(Boolean);
    if (alive.current && to) openMove(from, to);
  }
  const numeric = Number(amount);
  const validAmount = Number.isSafeInteger(numeric) && numeric > 0 && !!move && numeric <= move.from.balance;
  const canPreview = validAmount && reason.trim().length > 0 && reason.trim().length <= 300;
  async function prepare() {
    if (!move || !status?.latestMonth || !canPreview || working.current) return;
    working.current = true; setBusy(true); setError(null);
    const request: AdjustmentRequest = { hasEntitlement: hasMonthlyCloseEntitlement(), command: {
      action: move.from.id === WALLET ? 'fund' : 'transfer', operationId: newOperationId(), version: status.version,
      month: status.latestMonth, reason, amount: numeric, to: move.to.id,
      ...(move.from.id === WALLET ? {} : { from: move.from.id }),
    } };
    try { setPreview({ request, result: await ledger.previewAdjustment(request) }); }
    catch (e) { setError(userMessage(e, '預覽失敗，請重新讀取。')); }
    finally { working.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!preview || working.current || !entitled || !validAmount) return;
    working.current = true; setBusy(true); setError(null);
    try {
      await ledger.confirmAdjustment({ ...preview.request, previewToken: preview.result.previewToken, hasEntitlement: hasMonthlyCloseEntitlement() });
      success(); void syncNotifications(ledger).catch(() => {});
      setMove(null); setPreview(null); setRetry(n => n + 1);
    } catch (e) { setPreview(null); setError(userMessage(e, '搬錢失敗，請重新讀取。')); }
    finally { working.current = false; setBusy(false); }
  }
  function close() { if (!working.current) { setMove(null); setPreview(null); setError(null); } }
  function changed(action: () => void) { setPreview(null); setError(null); action(); }
  const maxBalance = Math.max(1, ...jars.map(j => j.balance));
  const recent = history.filter(row => ['transfer', 'fund'].includes(row.kind)).slice(-10).reverse();
  const nameOf = (id: string | null) => status?.categories.find(c => c.id === id)?.name ?? '可用餘額';
  return <GestureHandlerRootView style={kit.screen}>
    <Stack.Screen options={{ title: '挪用與調整' }} />
    <ScrollView style={kit.screen} contentContainerStyle={kit.content} scrollEnabled={!dragging}>
      {loading ? <ActivityIndicator accessibilityLabel="讀取儲備中" /> : null}
      {error && !move ? <Text style={text.error}>{error}</Text> : null}
      <NavRow title="重新讀取" onPress={() => setRetry(n => n + 1)} disabled={busy || dragging} />
      {!entitled ? <PaidLock feature="adjustments" note="目前僅供查看；有效付費權益才能搬錢。" /> : null}
      {!loading && !latest ? <Footnote>完成開帳與月結後，才能搬錢。</Footnote> : null}
      <MoneyTile item={wallet} wallet disabled={disabled} selected={source?.id === WALLET} level={1}
        onTap={() => tap(wallet)} onStart={() => setDragging(true)} onCancel={() => setDragging(false)} onDrop={drop} />
      <Footnote>{source ? `已選 ${source.name}，請點選要存入的罐子。` : '按住錢包或罐子，拖到另一個罐子後放開。也可先點來源、再點目標。'}</Footnote>
      <View style={styles.jars}>
        {jars.map(jar => <View key={jar.id} style={[styles.jarSlot, activeId === jar.id && { zIndex: 100 }]} collapsable={false}
          ref={view => { if (view) targets.current.set(jar.id, view); else targets.current.delete(jar.id); }}>
          <MoneyTile item={jar} disabled={disabled} selected={source?.id === jar.id} level={Math.max(0, jar.balance) / maxBalance}
            onTap={() => tap(jar)} onStart={() => { setActiveId(jar.id); setDragging(true); }} onCancel={() => { setActiveId(null); setDragging(false); }} onDrop={drop} />
        </View>)}
      </View>
      {jars.length === 0 && !loading ? <Footnote>尚無使用中的儲備分類。</Footnote> : null}
      <Footnote>水位依各罐的累積儲備比例顯示；負儲備仍列出，可從其他罐子補入。</Footnote>
      <SectionTitle>最近搬錢紀錄</SectionTitle>
      {recent.length === 0 ? <Footnote>還沒有搬錢紀錄。</Footnote> : null}
      {<Group>{recent.map(row => <View key={row.id} style={kit.cardPadding}>
        <Text style={text.headline}>{row.kind === 'fund' ? row.amount < 0 ? '退回錢包' : '存進罐子' : '搬錢'} {formatAmount(Math.abs(row.amount))} 元</Text>
        <Text style={text.body}>{row.kind === 'fund' && row.amount < 0 ? `${nameOf(row.to)} → 可用餘額` : `${nameOf(row.from)} → ${nameOf(row.to)}`}</Text>
        <Text style={text.footnote}>{row.kind === 'fund' ? '補入' : '挪用'}・{row.month}・{row.reverses ? '沖銷紀錄・' : row.reversed ? '已沖銷・' : ''}{row.pending ? '待重結' : '已生效'}</Text>
        <Text style={text.body}>{row.reason}</Text>
      </View>)}</Group>}
    </ScrollView>
    <Modal visible={move !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={kit.screen}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[kit.content, { paddingBottom: keyboardHeight + 24 }]}>
          <NavRow title="取消" onPress={close} disabled={busy} />
          <SectionTitle>{move?.from.id === WALLET ? '存進罐子' : '搬錢'}</SectionTitle>
          <Footnote>{move?.from.name} → {move?.to.name}</Footnote>
          <Card>
            <Text style={text.body}>金額</Text>
            <TextInput style={kit.input} value={amount} accessibilityLabel="搬錢金額" keyboardType="number-pad" editable={!busy}
              onChangeText={value => changed(() => setAmount(value.replace(/\D/g, '')))} />
            <View style={styles.increments}>{[100, 1000].map(increment => <Chip key={increment} active={false} label={`+${formatAmount(increment)}`}
              disabled={busy} onPress={() => changed(() => setAmount(String(numeric + increment)))} />)}</View>
            <Text style={validAmount ? text.footnote : text.error}>最多可搬 {formatAmount(move?.from.balance ?? 0)} 元</Text>
            <Text style={text.body}>原因（必填）</Text>
            <TextInput style={kit.input} value={reason} multiline maxLength={300} accessibilityLabel="搬錢原因" editable={!busy}
              onChangeText={value => changed(() => setReason(value))} />
          </Card>
          {error ? <Text style={text.error} accessibilityRole="alert">{error}</Text> : null}
          {preview && move ? <Card>
            <Text style={text.headline}>確認前後金額</Text>
            <Text style={text.body}>{move.from.name}：{formatAmount(move.from.balance)} → {formatAmount(move.from.id === WALLET ? preview.result.latestAfter?.spare ?? 0 : preview.result.latestAfter?.reserves.find(r => r.categoryId === move.from.id)?.balance ?? 0)}</Text>
            <Text style={text.body}>{move.to.name}：{formatAmount(move.to.balance)} → {formatAmount(preview.result.latestAfter?.reserves.find(r => r.categoryId === move.to.id)?.balance ?? 0)}</Text>
            <Footnote>{move.from.id === WALLET ? '補入儲備' : '儲備挪用'}・{reason}</Footnote>
          </Card> : null}
          <PrimaryButton title={busy ? '處理中…' : preview ? '確認搬錢' : '預覽前後金額'} disabled={busy || !entitled || !canPreview}
            onPress={() => void (preview ? confirm() : prepare())} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </GestureHandlerRootView>;
}

function MoneyTile({ item, wallet = false, level, disabled, selected, onTap, onStart, onCancel, onDrop }: {
  item: Source; wallet?: boolean; level: number; disabled: boolean; selected: boolean;
  onTap: () => void; onStart: () => void; onCancel: () => void; onDrop: (source: Source, x: number, y: number) => void;
}) {
  const x = useSharedValue(0); const y = useSharedValue(0); const held = useSharedValue(false);
  const style = useAnimatedStyle(() => ({ zIndex: held.value ? 100 : 0, transform: [{ translateX: x.value }, { translateY: y.value }, { scale: held.value ? 1.04 : 1 }] }));
  const shake = () => { 'worklet'; x.value = withSequence(withTiming(-6, { duration: 60 }), withTiming(6, { duration: 60 }), withTiming(0, { duration: 60 })); runOnJS(warning)(); };
  const pan = Gesture.Pan().enabled(!disabled).activateAfterLongPress(220)
    .onStart(() => {
      if (item.balance <= 0) { shake(); return; }
      held.value = true; runOnJS(onStart)();
    }).onUpdate(event => { if (held.value) { x.value = event.translationX; y.value = event.translationY; } })
    .onEnd(event => { if (held.value) runOnJS(onDrop)(item, event.absoluteX, event.absoluteY); })
    .onFinalize(() => { if (held.value) { held.value = false; x.value = withTiming(0); y.value = withTiming(0); } runOnJS(onCancel)(); });
  return <GestureDetector gesture={pan}>
    <Animated.View style={style}>
      <Pressable onPress={() => { if (item.balance <= 0 && !selected) { x.value = withSequence(withTiming(-6), withTiming(6), withTiming(0)); } onTap(); }}
        disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled, selected }} accessibilityLabel={`${item.name}，${formatAmount(item.balance)} 元`}
        accessibilityHint="按住拖到另一個罐子，或點選來源再點目標"
        style={[kit.card, kit.cardPadding, selected && styles.selected]}>
        {!wallet ? <View style={styles.jar}>
          <View style={[styles.water, { height: `${level * 100}%` }]} />
          <Text style={text.title}>存錢罐</Text>
        </View> : <Text style={text.title}>錢包</Text>}
        <Text style={text.headline}>{item.name}</Text>
        <Text style={[text.amount, item.balance < 0 && { color: colors.expense }]} adjustsFontSizeToFit numberOfLines={1}>{formatAmount(item.balance)}</Text>
      </Pressable>
    </Animated.View>
  </GestureDetector>;
}
const styles = StyleSheet.create({
  jars: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  jarSlot: { width: '48%' },
  jar: { height: 100, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 16 },
  water: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.accentSoft },
  selected: { borderWidth: 2, borderColor: colors.accent },
  increments: { flexDirection: 'row', gap: 12 },
});
