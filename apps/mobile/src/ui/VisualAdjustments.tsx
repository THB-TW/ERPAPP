import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AdjustmentRequest, BudgetAdjustmentView, BudgetMonthView, BudgetStatus } from '../ledger/index.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { hasMonthlyCloseEntitlement, useHasPaidAccess } from './closeEntitlement.ts';
import { formatAmount, userMessage } from './format.ts';
import { success, warning } from './haptics.ts';
import { Card, Chip, Footnote, Group, PrimaryButton, SectionTitle, kit, text } from './kit.tsx';
import { useLedger } from './LedgerProvider.tsx';
import { newOperationId } from './operationId.ts';
import { PaidLock } from './PaidLock.tsx';
import { colors } from './theme.ts';
import { useKeyboardHeight } from './useKeyboardHeight.ts';

type Source = { id: string; name: string; balance: number };
type Move = { from: Source; to: Source };
const WALLET = 'available-wallet';

function defaultAmount({ from, to }: Move): string {
  return String(to.balance < 0 ? Math.min(-to.balance, from.balance) : from.balance);
}

export function VisualAdjustments() {
  const ledger = useLedger();
  const entitled = useHasPaidAccess();
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [latest, setLatest] = useState<BudgetMonthView | null>(null);
  const [history, setHistory] = useState<BudgetAdjustmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const focus = useRef(0);
  const targets = useRef(new Map<string, ComponentRef<typeof View>>());
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const keyboardHeight = useKeyboardHeight();

  const refresh = useCallback(async (generation: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [next, rows] = await Promise.all([ledger.getBudgetStatus(), ledger.listBudgetAdjustments()]);
      const snapshot = next.latestMonth ? await ledger.getBudgetMonth(next.latestMonth) : null;
      if (generation !== focus.current) return;
      setStatus(next);
      setLatest(snapshot);
      setHistory(rows);
    } catch (error) {
      if (generation === focus.current) setLoadError(userMessage(error, '讀取失敗，請重試。'));
    } finally {
      if (generation === focus.current) setLoading(false);
    }
  }, [ledger]);

  useFocusEffect(useCallback(() => {
    const generation = ++focus.current;
    setMove(null);
    setSource(null);
    void refresh(generation);
    return () => { focus.current++; };
  }, [refresh]));

  const jars: Source[] = (status?.categories ?? []).filter(c => c.active && c.kind === 'reserve')
    .map(c => ({ id: c.id, name: c.name, balance: latest?.reserves.find(r => r.categoryId === c.id)?.balance ?? 0 }));
  const wallet = { id: WALLET, name: '可用餘額', balance: latest?.spare ?? 0 };
  const maxBalance = Math.max(1, wallet.balance, ...jars.map(jar => jar.balance));
  const columns = jars.length > 16 ? 5 : 4;
  const disabled = loading || busy || !entitled || !latest || !!loadError;
  const numeric = Number(amount);
  const over = !!move && numeric > move.from.balance;
  const fillAmount = move && move.to.balance < 0 ? Math.min(-move.to.balance, move.from.balance) : 0;
  const validAmount = !!move && Number.isSafeInteger(numeric) && numeric > 0 && !over
    && Number.isSafeInteger(move.to.balance + numeric);
  const canConfirm = validAmount && reason.trim().length > 0;
  const recent = history.filter(row => row.kind === 'transfer' || row.kind === 'fund').slice(-10).reverse();
  const nameOf = (id: string | null) => status?.categories.find(c => c.id === id)?.name ?? '可用餘額';

  function openMove(from: Source, to: Source) {
    if (disabled || from.id === to.id || from.balance <= 0 || to.id === WALLET) return;
    const next = { from, to };
    setMove(next);
    setSource(null);
    setAmount(defaultAmount(next));
    setReason('');
    setMoveError(null);
  }

  function tap(item: Source) {
    if (disabled) return;
    if (source?.id === item.id) setSource(null);
    else if (source && item.id !== WALLET) openMove(source, item);
    else if (item.balance > 0) setSource(item);
  }

  async function drop(from: Source, x: number, y: number) {
    if (disabled) return;
    const generation = focus.current;
    const hits = await Promise.all(jars.filter(jar => jar.id !== from.id).map(jar => new Promise<Source | null>(resolve => {
      const target = targets.current.get(jar.id);
      if (!target) { resolve(null); return; }
      target.measureInWindow((left, top, width, height) => {
        resolve(width > 0 && height > 0 && x >= left && x <= left + width && y >= top && y <= top + height ? jar : null);
      });
    })));
    const to = hits.find(Boolean);
    if (generation === focus.current && to) openMove(from, to);
  }

  function changeAmount(next: string) {
    setAmount(next);
    setMoveError(null);
  }

  function changeReason(next: string) {
    setReason(next);
    setMoveError(null);
  }

  function swap() {
    if (!move || move.from.id === WALLET || busy) return;
    if (move.to.balance <= 0) {
      warning();
      setMoveError('沒有正餘額的罐子無法作為搬出來源。');
      return;
    }
    setMove({ from: move.to, to: move.from });
    changeAmount(String(Math.min(numeric, move.to.balance)));
  }

  async function confirm() {
    if (!move || !status?.latestMonth || !canConfirm || disabled || working.current) return;
    working.current = true;
    setBusy(true);
    setMoveError(null);
    const generation = focus.current;
    const request: AdjustmentRequest = {
      hasEntitlement: hasMonthlyCloseEntitlement(),
      command: {
        action: move.from.id === WALLET ? 'fund' : 'transfer',
        operationId: newOperationId(),
        version: status.version,
        month: status.latestMonth,
        reason,
        amount: numeric,
        to: move.to.id,
        ...(move.from.id === WALLET ? {} : { from: move.from.id }),
      },
    };
    try {
      const preview = await ledger.previewAdjustment(request);
      await ledger.confirmAdjustment({ ...request, previewToken: preview.previewToken, hasEntitlement: hasMonthlyCloseEntitlement() });
      success();
      void syncNotifications(ledger).catch(() => {});
      if (generation === focus.current) {
        setMove(null);
        await refresh(generation);
      }
    } catch (error) {
      if (generation === focus.current) setMoveError(userMessage(error, '搬錢失敗，請關閉面板後重新讀取。'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function close() {
    if (!working.current) setMove(null);
  }

  const displayedAmount = validAmount ? numeric : 0;
  return (
    <GestureHandlerRootView style={kit.screen}>
      <Stack.Screen options={{ title: '挪用與調整' }} />
      <GestureDetector gesture={scrollGesture}>
        <ScrollView contentContainerStyle={[kit.content, styles.wall]}>
          {loading ? <ActivityIndicator accessibilityLabel="讀取儲備中" /> : null}
          {loadError ? <>
            <Text style={text.error} accessibilityRole="alert">{loadError}</Text>
            <PrimaryButton title="重新讀取" tone="secondary" onPress={() => void refresh(focus.current)} />
          </> : null}
          {!entitled ? <PaidLock feature="adjustments" note="目前僅供查看；有效付費權益才能搬錢。" /> : null}
          {!loading && !latest && !loadError ? <Footnote>完成開帳與月結後，才能搬錢。</Footnote> : null}
          <Footnote>先點搬出來源，再點要放進去的罐子。也可以按住來源拖拉。</Footnote>
          <View style={styles.lifted}>
            <MoneyTile item={wallet} level={Math.max(0, wallet.balance) / maxBalance}
              disabled={disabled || (!!source && source.id !== WALLET)} selected={source?.id === WALLET}
              scrollGesture={scrollGesture} onTap={() => tap(wallet)} onDrop={drop} />
          </View>
          <View style={styles.jars}>
            {jars.map(jar => (
              <View key={jar.id} style={[styles.jarSlot, { width: columns === 5 ? '20%' : '25%' }]}
                collapsable={false} ref={view => { if (view) targets.current.set(jar.id, view); else targets.current.delete(jar.id); }}>
                <MoneyTile item={jar} level={Math.max(0, jar.balance) / maxBalance} disabled={disabled}
                  selected={source?.id === jar.id} target={!!source && source.id !== jar.id}
                  scrollGesture={scrollGesture} onTap={() => tap(jar)} onDrop={drop} />
              </View>
            ))}
          </View>
          {jars.length === 0 && !loading ? <Footnote>尚無使用中的儲備分類。</Footnote> : null}
          <Footnote>水位代表累積儲備，紅框表示透支。</Footnote>
          <SectionTitle>最近搬錢紀錄</SectionTitle>
          {recent.length === 0 ? <Footnote>還沒有搬錢紀錄。</Footnote> : (
            <Group>{recent.map(row => (
              <View key={row.id} style={kit.cardPadding}>
                <Text style={text.headline}>{row.kind === 'fund' ? row.amount < 0 ? '退回錢包' : '存進罐子' : '搬錢'} {formatAmount(Math.abs(row.amount))} 元</Text>
                <Text style={text.body}>{row.kind === 'fund' && row.amount < 0 ? `${nameOf(row.to)} → 可用餘額` : `${nameOf(row.from)} → ${nameOf(row.to)}`}</Text>
                <Text style={text.footnote}>{row.kind === 'fund' ? '補入' : '挪用'}・{row.month}・{row.reverses ? '沖銷紀錄・' : row.reversed ? '已沖銷・' : ''}{row.pending ? '待重結' : '已生效'}</Text>
                <Text style={text.body}>{row.reason}</Text>
              </View>
            ))}</Group>
          )}
        </ScrollView>
      </GestureDetector>
      {source ? (
        <SafeAreaView edges={['bottom']} style={styles.selectionBar}>
          <Text style={[text.subhead, styles.grow]} accessibilityLiveRegion="polite">從 {source.name} 搬出 → 點要放進去的罐子</Text>
          <Chip label="取消" active={false} onPress={() => setSource(null)} />
        </SafeAreaView>
      ) : null}
      <Modal visible={move !== null} transparent animationType="slide" onRequestClose={close}>
        {move ? (
          <View style={[styles.modal, { paddingBottom: keyboardHeight }]} accessibilityViewIsModal>
            <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={close} accessible={false} />
            <SafeAreaView edges={keyboardHeight > 0 ? [] : ['bottom']} style={styles.sheet}>
              <View style={styles.sheetHeading}>
                <Text style={text.title}>{move.from.id === WALLET ? '存進罐子' : '搬錢'}</Text>
                <Chip label="取消" active={false} disabled={busy} onPress={close} />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.sheetContent}>
                <View style={styles.endpoints}>
                  <MoveEndpoint item={move.from} maxBalance={maxBalance} />
                  {move.from.id === WALLET ? <Text style={text.headline}>→</Text>
                    : <Chip label="⇄ 對調" active={false} disabled={busy} onPress={swap} />}
                  <MoveEndpoint item={move.to} maxBalance={maxBalance} />
                </View>
                <TextInput style={[kit.input, text.amount]} value={amount} accessibilityLabel="搬錢金額" keyboardType="number-pad"
                  placeholder="0" maxLength={16} editable={!busy} onChangeText={value => changeAmount(value.replace(/\D/g, ''))} />
                <View style={styles.chips}>
                  {fillAmount > 0 ? <Chip active={false} label={`補到 0（${formatAmount(fillAmount)}）`}
                    disabled={busy} onPress={() => changeAmount(String(fillAmount))} /> : null}
                  <Chip active={false} label={`全部 ${formatAmount(move.from.balance)}`} disabled={busy} onPress={() => changeAmount(String(move.from.balance))} />
                  {[100, 1000].map(value => <Chip key={value} active={false} label={`+${formatAmount(value)}`} disabled={busy}
                    onPress={() => changeAmount(String(Math.min(Number.MAX_SAFE_INTEGER, numeric + value)))} />)}
                  <Chip active={false} label="清除" disabled={busy} onPress={() => changeAmount('')} />
                </View>
                {over ? <Text style={text.error} accessibilityRole="alert">最多可搬 {formatAmount(move.from.balance)} 元</Text> : null}
                <Text style={text.subhead}>原因（必填）</Text>
                <TextInput style={kit.input} value={reason} maxLength={300} accessibilityLabel="搬錢原因" editable={!busy}
                  placeholder="例如：這個月聚餐比較多" onChangeText={changeReason} />
                <Card style={styles.preview}>
                  <Text style={text.headline}>搬完以後</Text>
                  <Text style={text.caption}>{move.from.id === WALLET ? '補入儲備' : '儲備挪用'}</Text>
                  <BalanceChange item={move.from} after={move.from.balance - displayedAmount} />
                  <BalanceChange item={move.to} after={move.to.balance + displayedAmount} />
                </Card>
                {moveError ? <Text style={text.error} accessibilityRole="alert">{moveError}</Text> : null}
              </ScrollView>
              <PrimaryButton style={styles.confirmButton} title={busy ? '處理中…' : `確認搬 ${formatAmount(Number.isSafeInteger(numeric) ? numeric : 0)} 元`}
                disabled={disabled || !canConfirm} onPress={() => void confirm()} />
            </SafeAreaView>
          </View>
        ) : null}
      </Modal>
    </GestureHandlerRootView>
  );
}

function BalanceChange({ item, after }: { item: Source; after: number }) {
  return <View style={styles.balanceChange}>
    <Text style={[text.subhead, styles.grow]}>{item.name}</Text>
    <Text style={[text.subhead, after < 0 && styles.negativeText]}>{formatAmount(item.balance)} → {formatAmount(after)}</Text>
  </View>;
}

function MoveEndpoint({ item, maxBalance }: { item: Source; maxBalance: number }) {
  return <View style={styles.endpoint}>
    <JarIcon level={Math.max(0, item.balance) / maxBalance} negative={item.balance < 0} wallet={item.id === WALLET} />
    <Text style={styles.caption} numberOfLines={1}>{item.name}</Text>
    <Text style={[styles.caption, item.balance < 0 && styles.negativeText]} numberOfLines={1}>{formatAmount(item.balance)}</Text>
  </View>;
}

function JarIcon({ level, negative, wallet }: { level: number; negative: boolean; wallet: boolean }) {
  const water = useSharedValue(level);
  useEffect(() => {
    water.set(withTiming(level, { duration: 360, reduceMotion: ReduceMotion.System }));
  }, [level, water]);
  const fill = useAnimatedStyle(() => ({ height: `${water.get() * 100}%` }));
  return (
    <View accessible={false} style={[styles.jarIcon, wallet && styles.walletIcon, negative && styles.negativeBorder]}>
      <Animated.View style={[styles.water, fill]} />
      <View style={[styles.rim, negative && styles.negativeRim]} />
    </View>
  );
}

function MoneyTile({ item, level, disabled, selected, target = false, scrollGesture, onTap, onDrop }: {
  item: Source;
  level: number;
  disabled: boolean;
  selected: boolean;
  target?: boolean;
  scrollGesture: ReturnType<typeof Gesture.Native>;
  onTap: () => void;
  onDrop: (source: Source, x: number, y: number) => void;
}) {
  const wallet = item.id === WALLET;
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const held = useSharedValue(false);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() - (selected ? 3 : 0) }, { scale: held.get() ? 1.06 : 1 }],
  }));
  function shake() {
    'worklet';
    x.set(withSequence(withTiming(-5, { duration: 65 }), withTiming(5, { duration: 65 }), withTiming(0, { duration: 65 })));
    runOnJS(warning)();
  }
  // 由手勢仲裁暫停捲動。拖到一半切換 scrollEnabled 會取消 iOS 的觸碰。
  const pan = Gesture.Pan().enabled(!disabled).activateAfterLongPress(300).blocksExternalGesture(scrollGesture)
    .onStart(() => {
      if (item.balance <= 0) { shake(); return; }
      held.set(true);
    })
    .onUpdate(event => {
      if (!held.get()) return;
      x.set(event.translationX);
      y.set(event.translationY);
    })
    .onEnd((event, completed) => {
      if (completed && held.get()) runOnJS(onDrop)(item, event.absoluteX, event.absoluteY);
    })
    .onFinalize(() => {
      if (!held.get()) return;
      held.set(false);
      x.set(withTiming(0));
      y.set(withTiming(0));
    });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[animated, selected && styles.selectionShadow]}>
        <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }}
          accessibilityLabel={`${wallet ? '錢包・' : ''}${item.name}，${formatAmount(item.balance)} 元`}
          accessibilityHint={target ? '點選作為搬入目標' : selected ? '點選取消來源' : '點選或長按作為搬出來源'}
          onPress={() => {
            if (item.balance <= 0 && !target) shake();
            else onTap();
          }}
          style={({ pressed }) => [kit.card, styles.tile, wallet && styles.wallet,
            target && styles.target, item.balance < 0 && styles.negativeBorder, selected && styles.selected,
            pressed && kit.pressed]}>
          <JarIcon level={level} negative={item.balance < 0} wallet={wallet} />
          <View style={wallet ? styles.grow : styles.tileText}>
            <Text style={wallet ? text.subhead : styles.caption} numberOfLines={1}>{wallet ? '錢包・可用餘額' : item.name}</Text>
            <Text style={[wallet ? text.headline : styles.caption, styles.amount, item.balance < 0 && styles.negativeText]}
              numberOfLines={1} adjustsFontSizeToFit>{formatAmount(item.balance)}</Text>
          </View>
          {wallet ? <Text style={text.caption}>只能存進罐子</Text> : null}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wall: { gap: 12 },
  jars: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, rowGap: 6 },
  jarSlot: { paddingHorizontal: 3 },
  tile: { alignItems: 'center', paddingHorizontal: 4, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, gap: 3 },
  wallet: { flexDirection: 'row', paddingHorizontal: 12, gap: 10 },
  tileText: { alignSelf: 'stretch', alignItems: 'center' },
  caption: { ...text.caption, color: colors.text },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  jarIcon: { width: 30, height: 36, backgroundColor: colors.fill, borderRadius: 7, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  walletIcon: { width: 30, height: 27, borderRadius: 6 },
  water: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.accentSoft, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
  rim: { position: 'absolute', top: 4, left: 0, right: 0, borderTopWidth: 1, borderColor: colors.chevron },
  negativeRim: { borderColor: colors.expense },
  negativeBorder: { borderColor: colors.expense },
  negativeText: { color: colors.expense },
  selected: { borderColor: colors.accent },
  selectionShadow: { backgroundColor: colors.surface, borderRadius: 16, shadowColor: colors.accent, shadowOpacity: 0.2, shadowRadius: 7 },
  lifted: { zIndex: 10 },
  target: { backgroundColor: colors.accentSoft },
  grow: { flex: 1 },
  selectionBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.accentSoft },
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.text, opacity: 0.35 },
  sheet: { maxHeight: '80%', flexShrink: 1, backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetHeading: { ...kit.rowBetween, paddingHorizontal: 16, paddingVertical: 8 },
  sheetContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  confirmButton: { marginHorizontal: 16, marginBottom: 8 },
  endpoints: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  endpoint: { flex: 1, alignItems: 'center', gap: 2, padding: 6, backgroundColor: colors.surface, borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preview: { gap: 4 },
  balanceChange: { flexDirection: 'row', gap: 8 },
});
