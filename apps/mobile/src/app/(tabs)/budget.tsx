import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { monthOf, shiftMonth, taipeiDate } from '../../calc/dates.ts';
import type { BudgetProgress, BudgetProgressRow } from '../../ledger/index.ts';
import { formatAmount, monthTitle, userMessage } from '../../ui/format.ts';
import { useLedger } from '../../ui/LedgerProvider.tsx';
import { colors } from '../../ui/theme.ts';

const SECTIONS = [
  { id: 'overview', label: '總覽', color: colors.muted },
  { id: 'reserve', label: '儲備類', color: colors.accent },
  { id: 'fixed', label: '固定支出', color: '#b45309' },
  { id: 'actual', label: '照實支', color: colors.income },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const GROUP_NOTES = {
  reserve: '月結時，上限減實支累積為分類儲備。',
  fixed: '月結時，結餘回到當月盈餘。',
  actual: '花多少算多少，不設定上限。',
};

export default function BudgetScreen() {
  const ledger = useLedger();
  const [month, setMonth] = useState(() => monthOf(taipeiDate(new Date())));
  const [progress, setProgress] = useState<BudgetProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const scroll = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Partial<Record<SectionId, number>>>({});

  // 返回預算分頁時重查，包含剛記的交易與設定頁儲存的新上限版本。
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveSection('overview');
    sectionY.current = {};
    ledger.getBudgetProgress(month).then(
      (result) => {
        if (cancelled) return;
        setProgress(result);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setProgress(null);
        setError(userMessage(e, '讀取預算失敗，請再試一次。'));
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [ledger, month, retry]));

  function changeMonth(next: string) {
    setMonth(next);
    setProgress(null);
    setActiveSection('overview');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function jumpTo(section: SectionId) {
    const y = sectionY.current[section];
    if (y === undefined) return;
    setActiveSection(section);
    scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }

  function syncSection(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    let current: SectionId = 'overview';
    for (const section of SECTIONS) {
      const y = sectionY.current[section.id];
      if (y !== undefined && y <= contentOffset.y + 16) current = section.id;
    }
    // 最後一區可能太短，標題無法捲到頂端；到頁底仍應標示照實支。
    if (contentSize.height > layoutMeasurement.height &&
        contentOffset.y + layoutMeasurement.height >= contentSize.height - 2) current = 'actual';
    setActiveSection(current);
  }

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      {/* 跳轉列放在垂直捲動區外，長頁面捲到底時仍固定於頂端。 */}
      <View style={styles.rail}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
          {SECTIONS.map((section) => (
            <Pressable
              key={section.id}
              onPress={() => jumpTo(section.id)}
              disabled={loading || progress === null}
              accessibilityRole="button"
              accessibilityLabel={`跳到${section.label}`}
              accessibilityState={{ selected: activeSection === section.id, disabled: loading || progress === null }}
              style={styles.railButton}
            >
              <Text style={{ color: activeSection === section.id ? colors.text : colors.muted, fontWeight: activeSection === section.id ? '700' : '400' }}>
                {section.label}
              </Text>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: section.color, opacity: activeSection === section.id ? 1 : 0.3 }} />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.monthPicker}>
        <Pressable onPress={() => changeMonth(shiftMonth(month, -1))} disabled={month <= '1900-01'} hitSlop={10} accessibilityLabel="上個月">
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={styles.title}>{monthTitle(month)}預算</Text>
          <Pressable onPress={() => changeMonth(monthOf(taipeiDate(new Date())))} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link}>回到本月</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => changeMonth(shiftMonth(month, 1))} disabled={month >= '9998-12'} hitSlop={10} accessibilityLabel="下個月">
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ margin: 24 }} accessibilityLabel="讀取預算中" /> : null}
      {error ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={{ color: colors.expense }} accessibilityRole="alert">{error}</Text>
          <Pressable onPress={() => setRetry((value) => value + 1)} accessibilityRole="button">
            <Text style={styles.link}>重新讀取</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && progress ? (
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          onScroll={syncSection}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
        >
          <View onLayout={(event) => { sectionY.current.overview = event.nativeEvent.layout.y; }} style={{ gap: 12 }}>
            <Text style={styles.heading}>總覽</Text>
            <View style={styles.summary}>
              <View style={{ gap: 4 }}>
                <Text style={styles.note}>有上限分類合計</Text>
                <Text style={styles.amount}>NT$ {formatAmount(progress.totalCap)}</Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={styles.note}>本月全部已花</Text>
                <Text style={styles.amount}>NT$ {formatAmount(progress.totalSpent)}</Text>
              </View>
            </View>
            <Text style={styles.note}>上限合計不含照實支；本月已花包含照實支與尚未設定歸屬的支出。</Text>
            <Text style={styles.note}>可編輯的開放月份：{monthTitle(progress.openMonth)}。已結月份沿用當時的上限快照。</Text>
            {progress.rows.length === 0 ? (
              <Text style={styles.note}>這個月還沒有預算上限設定，請到「設定 → 預算與分類」建立。</Text>
            ) : null}
            {progress.unmapped.length > 0 ? (
              <View style={styles.warning}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>以下支出尚未設定預算歸屬</Text>
                {progress.unmapped.map((category) => (
                  <View key={category.categoryId} style={styles.rowTitle}>
                    <Text style={{ color: colors.text, flex: 1 }}>{category.name}</Text>
                    <Text style={{ color: colors.text }}>已花 {formatAmount(category.spent)}</Text>
                  </View>
                ))}
                <Text style={styles.note}>請到設定指定歸屬，這些金額才會計入對應分類的進度。</Text>
              </View>
            ) : null}
          </View>

          {SECTIONS.filter((section) => section.id !== 'overview').map((section) => {
            const kind = section.id as BudgetProgressRow['kind'];
            const rows = progress.rows.filter((row) => row.kind === kind);
            return (
              <View key={kind} style={{ gap: 10 }} onLayout={(event) => { sectionY.current[kind] = event.nativeEvent.layout.y; }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: section.color }} />
                  <Text style={styles.heading}>{section.label}</Text>
                </View>
                <Text style={styles.note}>{GROUP_NOTES[kind]}</Text>
                {rows.length === 0 ? <Text style={styles.note}>這一組還沒有分類。</Text> : null}
                {rows.map((row) => <ProgressRow key={row.categoryId} row={row} color={section.color} />)}
              </View>
            );
          })}

          <Pressable onPress={() => router.navigate('/(tabs)/settings')} accessibilityRole="button" style={{ paddingVertical: 8 }}>
            <Text style={styles.link}>到設定修改預算與分類 ›</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function ProgressRow({ row, color }: { row: BudgetProgressRow; color: string }) {
  const over = row.remaining !== null && row.remaining < 0;
  const ratio = row.cap === null ? 0 : row.cap > 0 ? Math.min(1, row.spent / row.cap) : row.spent > 0 ? 1 : 0;
  return (
    <View style={styles.card}>
      <View style={styles.rowTitle}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16, flex: 1 }}>{row.name}</Text>
        {row.remaining === null ? null : (
          <Text style={{ color: over ? colors.expense : colors.text, fontWeight: '600' }}>
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
          <View style={{ height: 6, width: `${ratio * 100}%`, borderRadius: 3, backgroundColor: over ? colors.expense : color }} />
        </View>
      ) : null}
      <Text style={styles.note}>已花 {formatAmount(row.spent)}{row.cap === null ? '・照實支' : ` ／ 上限 ${formatAmount(row.cap)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  rail: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  railContent: { paddingHorizontal: 12, gap: 8, flexGrow: 1 },
  railButton: { minWidth: 72, flex: 1, gap: 8, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 8 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  arrow: { color: colors.accent, fontSize: 28 },
  content: { padding: 16, gap: 28, paddingBottom: 32 },
  heading: { color: colors.text, fontSize: 19, fontWeight: '700' },
  summary: { backgroundColor: colors.surface, padding: 16, borderRadius: 12, gap: 16 },
  amount: { color: colors.text, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  link: { color: colors.accent, fontSize: 14 },
  warning: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 10, gap: 8 },
  card: { backgroundColor: colors.surface, padding: 12, borderRadius: 12, gap: 8 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
});
