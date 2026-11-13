import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { monthOf, shiftMonth, taipeiDate } from '../../../calc/dates.ts';
import type { BudgetMonthView, BudgetProgress, BudgetProgressRow, LoanView } from '../../../ledger/index.ts';
import { formatAmount, monthTitle, userMessage } from '../../../ui/format.ts';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { groupColors, grouped, typeScale } from '../../../ui/theme.ts';
import { jumpOffset, reachedTarget, sectionAt } from '../../../ui/sectionNav.ts';
import { MonthlyCloseSummary } from '../../../ui/MonthlyCloseSummary.tsx';
import { LoanCards } from '../../../ui/LoanCards.tsx';

// 預算頁（UI 質感試做版）：iOS 原生大標題「預算」由 budget/_layout.tsx 的堆疊負責，
// 本頁最外層必須直接是 ScrollView，大標題才會隨捲動收合。
// 版面採 Apple「分組清單」做法：淺灰底、白色圓角卡片、卡片外放小字說明。

const SECTIONS = [
  { id: 'overview', label: '總覽', color: groupColors.overview },
  { id: 'reserve', label: '儲備類', color: groupColors.reserve },
  { id: 'fixed', label: '固定支出', color: groupColors.fixed },
  { id: 'actual', label: '照實支', color: groupColors.actual },
  { id: 'loan', label: '貸款', color: groupColors.loan },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_ORDER = SECTIONS.map((section) => section.id);
const GROUP_NOTES = {
  reserve: '月結時，上限減實支累積為分類儲備。',
  fixed: '月結時，結餘回到當月盈餘。',
  actual: '花多少算多少，不設定上限。',
};
// ScrollView 的子節點順序：0 月份列、1 頁籤列（吸頂）、之後是內容。
const RAIL_INDEX = 1;

export default function BudgetScreen() {
  const ledger = useLedger();
  const [month, setMonth] = useState(() => monthOf(taipeiDate(new Date())));
  const [progress, setProgress] = useState<BudgetProgress | null>(null);
  const [closed, setClosed] = useState<BudgetMonthView | null>(null);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const scroll = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Partial<Record<SectionId, number>>>({});
  const viewport = useRef(0);
  const contentHeight = useRef(0);
  const railHeight = useRef(0);
  // 點頁籤後的程式捲動進行中：動畫途中經過的區段不要改亮頁籤，抵達或使用者自己拖動才恢復跟隨。
  const pendingJump = useRef<{ target: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const isCurrentMonth = month === monthOf(taipeiDate(new Date()));

  function clearPendingJump() {
    if (pendingJump.current) clearTimeout(pendingJump.current.timer);
    pendingJump.current = null;
  }

  // 返回預算分頁時重查，包含剛記的交易與設定頁儲存的新上限版本。
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveSection('overview');
    sectionY.current = {};
    clearPendingJump();
    Promise.all([ledger.getBudgetProgress(month), ledger.listBudgetMonths(), ledger.listLoans(month)]).then(async ([result, months, loanRows]) => {
      // 已結月份用自己快照；未結月份只顯示不晚於所選月份的最近已結結果。
      const latest = months.filter((item) => item.month <= month).at(-1);
      return { result, loanRows, snapshot: latest ? await ledger.getBudgetMonth(latest.month) : null };
    }).then(
      ({ result, snapshot, loanRows }) => {
        if (cancelled) return;
        setProgress(result);
        setClosed(snapshot);
        setLoans(loanRows);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setProgress(null);
        setClosed(null);
        setLoans([]);
        setError(userMessage(e, '讀取預算失敗，請再試一次。'));
        setLoading(false);
      },
    );
    return () => { cancelled = true; clearPendingJump(); };
  }, [ledger, month, retry]));

  function changeMonth(next: string) {
    setMonth(next);
    setProgress(null);
    setActiveSection('overview');
    clearPendingJump();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function jumpTo(section: SectionId) {
    const y = sectionY.current[section];
    if (y === undefined) return;
    // 扣掉吸頂頁籤列的高度；目標限制在可捲範圍內，後段短區段停在頁底且仍亮所點的頁籤。
    const target = jumpOffset(y, viewport.current, contentHeight.current, railHeight.current);
    clearPendingJump();
    // 保險：若沒收到抵達的捲動事件（例如本來就在目標位置），稍後自動解除。
    pendingJump.current = { target, timer: setTimeout(() => { pendingJump.current = null; }, 900) };
    setActiveSection(section);
    scroll.current?.scrollTo({ y: target, animated: true });
  }

  function syncSection(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    viewport.current = layoutMeasurement.height;
    contentHeight.current = contentSize.height;
    const pending = pendingJump.current;
    if (pending) {
      if (reachedTarget(contentOffset.y, pending.target)) clearPendingJump();
      return;
    }
    setActiveSection(sectionAt(SECTION_ORDER, sectionY.current, {
      offset: contentOffset.y,
      viewport: layoutMeasurement.height,
      content: contentSize.height,
      topInset: railHeight.current,
    }));
  }

  const ready = !loading && progress !== null;
  const measure = (id: SectionId) => (event: { nativeEvent: { layout: { y: number } } }) => { sectionY.current[id] = event.nativeEvent.layout.y; };

  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      stickyHeaderIndices={[RAIL_INDEX]}
      onScroll={syncSection}
      onScrollBeginDrag={clearPendingJump}
      onLayout={(event) => { viewport.current = event.nativeEvent.layout.height; }}
      onContentSizeChange={(_width, height) => { contentHeight.current = height; }}
      scrollEventThrottle={16}
    >
      {/* 0：月份切換 */}
      <View style={styles.monthPicker}>
        <Pressable onPress={() => changeMonth(shiftMonth(month, -1))} disabled={month <= '1900-01'} hitSlop={12} accessibilityLabel="上個月" style={styles.monthArrow}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
          {isCurrentMonth ? <Text style={styles.monthHint}>本月</Text> : (
            <Pressable onPress={() => changeMonth(monthOf(taipeiDate(new Date())))} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.monthLink}>回到本月</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => changeMonth(shiftMonth(month, 1))} disabled={month >= '9998-12'} hitSlop={12} accessibilityLabel="下個月" style={styles.monthArrow}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      {/* 1：區段頁籤列，捲動時吸在頂端（文字在色條上方，五格平分寬度、不可橫向捲動）。 */}
      <View style={styles.rail} onLayout={(event) => { railHeight.current = event.nativeEvent.layout.height; }}>
        {SECTIONS.map((section) => {
          const active = activeSection === section.id;
          return (
            <Pressable
              key={section.id}
              onPress={() => jumpTo(section.id)}
              hitSlop={{ top: 4, bottom: 4 }}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel={`跳到${section.label}`}
              accessibilityState={{ selected: active, disabled: !ready }}
              style={styles.railButton}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.railLabel, active && styles.railLabelActive]}>
                {section.label}
              </Text>
              <View style={[styles.railBar, { backgroundColor: section.color, opacity: active ? 1 : 0.25 }]} />
            </Pressable>
          );
        })}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 32 }} accessibilityLabel="讀取預算中" /> : null}
      {error ? (
        <View style={[styles.card, { gap: 12, marginHorizontal: 16, marginTop: 16 }]}>
          <Text style={{ ...typeScale.body, color: grouped.expense }} accessibilityRole="alert">{error}</Text>
          <Pressable onPress={() => setRetry((value) => value + 1)} accessibilityRole="button">
            <Text style={styles.link}>重新讀取</Text>
          </Pressable>
        </View>
      ) : null}

      {ready ? <>
        <View onLayout={measure('overview')} style={styles.section}>
          <View style={[styles.card, styles.summary]}>
            <View style={{ gap: 2 }}>
              <Text style={styles.label}>本月全部已花</Text>
              <Text style={styles.bigAmount}>NT$ {formatAmount(progress.totalSpent)}</Text>
            </View>
            <View style={styles.hairline} />
            <View style={styles.rowBetween}>
              <Text style={styles.body}>有上限分類合計</Text>
              <Text style={styles.value}>NT$ {formatAmount(progress.totalCap)}</Text>
            </View>
          </View>
          <Text style={styles.footnote}>上限合計不含照實支；本月已花包含照實支與尚未設定歸屬的支出。可編輯的開放月份：{monthTitle(progress.openMonth)}。已結月份沿用當時的上限快照。</Text>

          {progress.rows.length === 0 ? (
            <Text style={styles.footnote}>這個月還沒有預算上限設定，請到「設定 → 預算與分類」建立。</Text>
          ) : null}
          {progress.unmapped.length > 0 ? (
            <View style={[styles.card, styles.warning]}>
              <Text style={styles.headline}>以下支出尚未設定預算歸屬</Text>
              {progress.unmapped.map((category) => (
                <View key={category.categoryId} style={styles.rowBetween}>
                  <Text style={[styles.body, { flex: 1 }]}>{category.name}</Text>
                  <Text style={styles.value}>已花 {formatAmount(category.spent)}</Text>
                </View>
              ))}
              <Text style={styles.footnote}>請到設定指定歸屬，這些金額才會計入對應分類的進度。</Text>
            </View>
          ) : null}

          {closed ? <>
            <SectionTitle>{monthTitle(closed.month)}已結資產</SectionTitle>
            <MonthlyCloseSummary summary={closed} cardStyle={styles.card} />
            <Text style={styles.footnote}>以下累積儲備截至{monthTitle(closed.month)}，包含已生效調整；尚未包含未結月份的預估變動。</Text>
            <View style={[styles.card, styles.list]}>
              {closed.reserves.map((reserve, index) => (
                <View key={reserve.categoryId} style={[styles.listRow, index > 0 && styles.listDivider]}>
                  <Text style={[styles.body, { flex: 1 }]}>{reserve.name}累積儲備</Text>
                  <Text style={[styles.value, reserve.balance < 0 && { color: grouped.expense }]}>{formatAmount(reserve.balance)}</Text>
                </View>
              ))}
              <LinkRow first={closed.reserves.length === 0} label="挪用儲備" onPress={() => router.push({ pathname: '/adjustments', params: { action: 'transfer' } })} />
              <LinkRow label="可用餘額補入儲備" onPress={() => router.push({ pathname: '/adjustments', params: { action: 'fund' } })} />
              <LinkRow label="查看這個月的月結快照" onPress={() => router.push({ pathname: '/close-snapshot', params: { month: closed.month } })} />
            </View>
          </> : <Text style={styles.footnote}>這個月份尚無已結資產；完成月結後會顯示可用餘額、累積儲備與帳面總資產。</Text>}
        </View>

        {SECTIONS.filter((section) => section.id !== 'overview' && section.id !== 'loan').map((section) => {
          const kind = section.id as BudgetProgressRow['kind'];
          const rows = progress.rows.filter((row) => row.kind === kind);
          return (
            <View key={kind} style={styles.section} onLayout={measure(kind)}>
              <SectionTitle color={section.color}>{section.label}</SectionTitle>
              <Text style={styles.footnote}>{GROUP_NOTES[kind]}</Text>
              {rows.length === 0 ? <Text style={styles.footnote}>這一組還沒有分類。</Text> : (
                <View style={[styles.card, styles.list]}>
                  {rows.map((row, index) => <ProgressRow key={row.categoryId} row={row} color={section.color} divider={index > 0} />)}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.section} onLayout={measure('loan')}>
          <SectionTitle color={groupColors.loan}>貸款／分期</SectionTitle>
          <Text style={styles.footnote}>月結時提撥每月繳款；實際繳款選這筆貸款分類，月結後扣減儲備與剩餘本金。未結月份尚未計入新的提撥與繳款。</Text>
          <LoanCards loans={loans} cardStyle={styles.card} />
          <View style={[styles.card, styles.list]}>
            <LinkRow first label="到設定管理貸款／分期" onPress={() => router.push('/loans')} />
            <LinkRow label="到設定修改預算與分類" onPress={() => router.navigate('/(tabs)/settings')} />
          </View>
        </View>
      </> : null}
    </ScrollView>
  );
}

function SectionTitle({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <View style={styles.sectionTitle}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={styles.title} accessibilityRole="header">{children}</Text>
    </View>
  );
}

function LinkRow({ label, onPress, first = false }: { label: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listRow, !first && styles.listDivider, pressed && styles.pressed]}>
      <Text style={[styles.body, { flex: 1, color: grouped.accent }]}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/** 進度條：出現或數值改變時，用 0.5 秒緩出長到目前比例（系統「減少動態效果」開啟時直接到位）。 */
function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(ratio, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [ratio, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return <Animated.View style={[styles.progressFill, { backgroundColor: color }, fill]} />;
}

function ProgressRow({ row, color, divider }: { row: BudgetProgressRow; color: string; divider: boolean }) {
  const over = row.remaining !== null && row.remaining < 0;
  const ratio = row.cap === null ? 0 : row.cap > 0 ? Math.min(1, row.spent / row.cap) : row.spent > 0 ? 1 : 0;
  return (
    <View style={[styles.progressRow, divider && styles.listDivider]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.headline, { flex: 1 }]}>{row.name}</Text>
        {row.remaining === null ? null : (
          <Text style={[styles.value, over && { color: grouped.expense }]}>
            {over ? '超支' : '剩餘'} {formatAmount(Math.abs(row.remaining))}
          </Text>
        )}
      </View>
      {row.cap !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${row.name}本月預算進度`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100), text: `已花 ${formatAmount(row.spent)}，上限 ${formatAmount(row.cap)}` }}
          style={styles.progressTrack}
        >
          <ProgressBar ratio={ratio} color={over ? grouped.expense : color} />
        </View>
      ) : null}
      <Text style={styles.footnoteInCard}>已花 {formatAmount(row.spent)}{row.cap === null ? '・照實支' : ` ／ 上限 ${formatAmount(row.cap)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: grouped.background },
  content: { paddingBottom: 40 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  monthArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: grouped.accent, fontSize: 30, lineHeight: 34 },
  monthTitle: { ...typeScale.headline, color: grouped.text },
  monthHint: { ...typeScale.footnote, color: grouped.secondary },
  monthLink: { ...typeScale.footnote, color: grouped.accent },
  rail: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    backgroundColor: grouped.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: grouped.separator,
  },
  railButton: { flex: 1, minWidth: 0, gap: 6, paddingHorizontal: 2, paddingTop: 10, paddingBottom: 8 },
  railLabel: { ...typeScale.subhead, textAlign: 'center', color: grouped.secondary },
  railLabelActive: { color: grouped.text, fontWeight: '600' },
  railBar: { height: 3, borderRadius: 1.5 },
  section: { paddingHorizontal: 16, paddingTop: 24, gap: 8 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { ...typeScale.title3, color: grouped.text },
  card: { backgroundColor: grouped.card, borderRadius: 16, borderCurve: 'continuous', borderWidth: 0, padding: 16 },
  summary: { gap: 14 },
  list: { paddingVertical: 0, paddingHorizontal: 0 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 },
  listDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: grouped.separator },
  progressRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  pressed: { backgroundColor: grouped.track },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: grouped.separator },
  warning: { gap: 8, borderWidth: 1, borderColor: '#f5d0a9' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { ...typeScale.footnote, color: grouped.secondary },
  bigAmount: { ...typeScale.amount, color: grouped.text },
  body: { ...typeScale.body, color: grouped.text },
  headline: { ...typeScale.headline, color: grouped.text },
  value: { ...typeScale.body, color: grouped.text, fontVariant: ['tabular-nums'] },
  footnote: { ...typeScale.footnote, color: grouped.secondary, paddingHorizontal: 4 },
  footnoteInCard: { ...typeScale.footnote, color: grouped.secondary, fontVariant: ['tabular-nums'] },
  link: { ...typeScale.body, color: grouped.accent },
  chevron: { fontSize: 22, color: '#c7c7cc' },
  progressTrack: { height: 6, backgroundColor: grouped.track, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
});
