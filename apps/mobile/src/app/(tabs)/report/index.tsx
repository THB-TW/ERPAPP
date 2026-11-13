import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { monthOf, shiftMonth, taipeiDate } from '../../../calc/dates.ts';
import { REST_SLICE_KEY, pieSlices, type PieSlice } from '../../../calc/shares.ts';
import type { DayTransaction, Flow, MonthBreakdown } from '../../../ledger/index.ts';
import { Donut } from '../../../ui/Donut.tsx';
import { formatAmount, formatPermille, monthTitle, userMessage } from '../../../ui/format.ts';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { Footnote, Group, MonthBar, SectionTitle, Segmented, kit, text } from '../../../ui/kit.tsx';
import { chartColors, colors, typeScale } from '../../../ui/theme.ts';

// 明細（票 09）：選定月份的圓餅圖＋類別列表。支出／收入用上方切換或在圓餅圖上左右滑；
// 點類別展開該類別當月的交易，點交易進記帳表單（可改可刪，已結月份為唯讀）。
const MAX_SLICES = chartColors.length - 1; // 最後一色留給合併的「其他分類」
const FLOW_NAME: Record<Flow, string> = { expense: '支出', income: '收入' };
const otherFlow = (flow: Flow): Flow => (flow === 'expense' ? 'income' : 'expense');
const FLOW_OPTIONS = (['expense', 'income'] as const).map((f) => ({ key: f, label: FLOW_NAME[f] }));

export default function ReportScreen() {
  const ledger = useLedger();
  const [thisMonth, setThisMonth] = useState(() => monthOf(taipeiDate(new Date())));
  const [month, setMonth] = useState(thisMonth);
  const [flow, setFlow] = useState<Flow>('expense');
  const [breakdown, setBreakdown] = useState<MonthBreakdown | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // 展開的類別的交易，連同它屬於哪個月份、哪個類別一起存；對不上目前展開的那一列就不顯示。
  const [openList, setOpenList] = useState<{ month: string; key: string; rows: DayTransaction[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 每次回到這一頁（含從記帳表單返回）都重新查，剛記或剛改的帳才會反映在圖上。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setThisMonth(monthOf(taipeiDate(new Date())));
      ledger.getMonthBreakdown(month, flow).then(
        (result) => {
          if (cancelled) return;
          setBreakdown(result);
          setError(null);
        },
        (e: unknown) => {
          if (!cancelled) setError(userMessage(e, '讀取失敗，請再試一次。'));
        },
      );
      return () => {
        cancelled = true;
      };
    }, [ledger, month, flow]),
  );

  // 展開某個類別時查它當月的交易（合併的「其他分類」只列分類，不用查）。
  useFocusEffect(
    useCallback(() => {
      if (openKey === null || openKey === REST_SLICE_KEY) return;
      let cancelled = false;
      ledger.getCategoryMonthTransactions(month, Number(openKey)).then(
        (rows) => {
          if (!cancelled) setOpenList({ month, key: openKey, rows });
        },
        (e: unknown) => {
          if (!cancelled) setError(userMessage(e, '讀取失敗，請再試一次。'));
        },
      );
      return () => {
        cancelled = true;
      };
    }, [ledger, month, openKey]),
  );

  function changeMonth(delta: number) {
    setMonth(shiftMonth(month, delta));
    setOpenKey(null);
  }

  function chooseFlow(next: Flow) {
    if (next === flow) return;
    setFlow(next);
    setOpenKey(null);
  }

  // 在圓餅圖上左右滑：切換支出／收入。只有橫向位移明顯大於縱向時才接手，上下捲動不受影響。
  const swipeTo = useRef<() => void>(() => undefined);
  swipeTo.current = () => chooseFlow(otherFlow(flow));
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy)) swipeTo.current();
        },
      }),
    [],
  );

  // 查詢結果還是上一個月份或收支別的時候不畫，避免標題和圖對不上。
  const current = breakdown && breakdown.month === month && breakdown.flow === flow ? breakdown : null;
  const slices = current ? pieSlices(current.categories, MAX_SLICES) : [];
  const colorOf = (index: number, slice: PieSlice) =>
    slice.key === REST_SLICE_KEY ? chartColors[chartColors.length - 1] : chartColors[index % chartColors.length];
  const kind = FLOW_NAME[flow];
  const isLatestMonth = month >= thisMonth;

  return (
    <ScrollView style={kit.screen} contentContainerStyle={kit.content} contentInsetAdjustmentBehavior="automatic">
      <MonthBar
        title={monthTitle(month)}
        onPrev={() => changeMonth(-1)}
        onNext={() => changeMonth(1)}
        nextDisabled={isLatestMonth}
        hint={month === thisMonth ? '本月' : '回到本月'}
        onHintPress={
          month === thisMonth
            ? undefined
            : () => {
                setMonth(thisMonth);
                setOpenKey(null);
              }
        }
      />

      <Segmented options={FLOW_OPTIONS} value={flow} onChange={chooseFlow} />

      <View style={styles.chartBlock}>
        {/* kit 的 Card 不收手勢與無障礙屬性，所以這裡直接用 kit.card 樣式的 View。 */}
        <View
          style={[kit.card, styles.donutCard]}
          {...swipe.panHandlers}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${monthTitle(month)}${kind}分類圓餅圖，合計 ${formatAmount(current?.total ?? 0)} 元。左右滑可切換支出與收入。`}
        >
          <Donut slices={slices.map((s, i) => ({ key: s.key, amount: s.amount, color: colorOf(i, s) }))}>
            <Text style={text.footnote}>本月{kind}</Text>
            <Text style={styles.donutTotal} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(current?.total ?? 0)}
            </Text>
          </Donut>
        </View>

        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {(['expense', 'income'] as const).map((f) => (
            <View key={f} style={[styles.pageDot, { backgroundColor: flow === f ? colors.accent : colors.chevron }]} />
          ))}
        </View>
      </View>

      <View style={kit.section}>
        <SectionTitle
          right={
            <Text style={styles.otherTotal}>
              {FLOW_NAME[otherFlow(flow)]} {formatAmount(current?.otherFlowTotal ?? 0)}
            </Text>
          }
        >
          {kind}分類
        </SectionTitle>

        {error ? <Text style={[text.error, kit.outsideText]}>{error}</Text> : null}
        {current && slices.length === 0 && !error ? <Footnote>這個月沒有{kind}。</Footnote> : null}

        <Group>
          {slices.map((slice, i) => {
            const open = openKey === slice.key;
            return (
              <View key={slice.key}>
                <Pressable
                  onPress={() => setOpenKey(open ? null : slice.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={({ pressed }) => [kit.row, pressed && kit.pressed]}
                >
                  <View style={[styles.colorDot, { backgroundColor: colorOf(i, slice) }]} />
                  <Text style={[text.body, styles.name]} numberOfLines={1}>
                    {slice.name}
                  </Text>
                  <Text style={[text.footnote, styles.tabular]}>{formatPermille(slice.permille)}</Text>
                  <Text style={[text.value, styles.amountBold]}>{formatAmount(slice.amount)}</Text>
                </Pressable>
                {open && slice.key === REST_SLICE_KEY
                  ? current?.categories
                      .filter((c) => slice.categoryIds.includes(c.categoryId))
                      .map((c) => (
                        <SubRow key={c.categoryId} label={`${c.categoryName}・${formatPermille(c.permille)}`} amount={c.amount} />
                      ))
                  : null}
                {open && slice.key !== REST_SLICE_KEY && openList?.key === slice.key && openList.month === month
                  ? openList.rows.map((t) => (
                      <SubRow
                        key={t.id}
                        label={`${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))}・${t.accountName}${t.note ? `・${t.note}` : ''}`}
                        amount={t.amount}
                        onPress={() => router.push({ pathname: '/entry', params: { id: String(t.id) } })}
                      />
                    ))
                  : null}
                {open ? <View style={styles.subEnd} /> : null}
              </View>
            );
          })}
        </Group>
      </View>
    </ScrollView>
  );
}

// 展開後的子列：縮排到和類別名稱對齊；可點的（交易）按下時變淺灰。
function SubRow(props: { label: string; amount: number; onPress?: () => void }) {
  const content = (
    <>
      <Text style={[text.subheadMuted, styles.name]} numberOfLines={1}>
        {props.label}
      </Text>
      <Text style={styles.subAmount}>{formatAmount(props.amount)}</Text>
    </>
  );
  return props.onPress ? (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityHint="檢視或修改這筆交易"
      style={({ pressed }) => [styles.subRow, styles.subRowPressable, pressed && kit.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.subRow}>{content}</View>
  );
}

const styles = StyleSheet.create({
  chartBlock: { gap: 10 },
  donutCard: { alignItems: 'center', padding: 20 },
  // 甜甜圈中空只有約 126pt 寬，金額太長時縮字而不是換行。
  donutTotal: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'], maxWidth: 116 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3 },
  otherTotal: { ...typeScale.footnote, color: colors.muted, fontVariant: ['tabular-nums'] },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  amountBold: { fontWeight: '600' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 40, paddingRight: 16 },
  // 可點的交易子列至少 44pt 高（純顯示的類別子列維持緊湊）。
  subRowPressable: { minHeight: 44 },
  subAmount: { ...typeScale.subhead, color: colors.text, fontVariant: ['tabular-nums'] },
  subEnd: { height: 6 },
});
