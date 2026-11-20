import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { monthOf, shiftMonth, taipeiDate } from '../../../calc/dates.ts';
import type { DayTransaction, Flow, MonthBreakdown } from '../../../ledger/index.ts';
import { HorizontalPager, usePagerTap } from '../../../ui/HorizontalPager.tsx';
import { Donut } from '../../../ui/Donut.tsx';
import { formatAmount, formatPermille, monthTitle, userMessage } from '../../../ui/format.ts';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { Footnote, Group, MonthBar, SectionTitle, kit, text } from '../../../ui/kit.tsx';
import { TabScrollView } from '../../../ui/LargeTitle.tsx';
import { reportCategoryColor, reportOtherColor, colors, typeScale } from '../../../ui/theme.ts';

// 明細（票 09）：選定月份的圓餅圖＋類別列表。支出／收入用上方切換或在圓餅圖上左右滑；
// 點類別展開該類別當月的交易，點交易進記帳表單（可改可刪，已結月份為唯讀）。
const FLOW_NAME: Record<Flow, string> = { expense: '支出', income: '收入' };
const otherFlow = (flow: Flow): Flow => (flow === 'expense' ? 'income' : 'expense');
const FLOW_OPTIONS = (['expense', 'income'] as const).map((f) => ({ key: f, label: FLOW_NAME[f] }));

export default function ReportScreen() {
  const [thisMonth, setThisMonth] = useState(() => monthOf(taipeiDate(new Date())));
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { setThisMonth(monthOf(taipeiDate(new Date()))); }, []));
  function chooseMonth(next: string) {
    setMonth(next);
    setOpenKey(null);
  }
  function choosePage(next: number) {
    if (next === selected) return;
    setSelected(next);
    setOpenKey(null);
  }
  return (
    <TabScrollView title="明細">
      <MonthBar title={monthTitle(month)} onPrev={() => chooseMonth(shiftMonth(month, -1))}
        onNext={() => chooseMonth(shiftMonth(month, 1))} nextDisabled={month >= thisMonth}
        hint={month === thisMonth ? '本月' : '回到本月'}
        onHintPress={month === thisMonth ? undefined : () => chooseMonth(thisMonth)} />
      <HorizontalPager options={FLOW_OPTIONS} onChange={choosePage}>
        {(['expense', 'income'] as const).map((flow, index) => (
          <ReportPage key={`${month}-${flow}`} month={month} flow={flow}
            openKey={selected === index ? openKey : null} onOpen={setOpenKey} />
        ))}
      </HorizontalPager>
    </TabScrollView>
  );
}

function ReportPage({ month, flow, openKey, onOpen }: {
  month: string; flow: Flow; openKey: string | null; onOpen: (key: string | null) => void;
}) {
  const tap = usePagerTap();
  const ledger = useLedger();
  const [breakdown, setBreakdown] = useState<MonthBreakdown | null>(null);
  // 展開的類別的交易，連同它屬於哪個月份、哪個類別一起存；對不上目前展開的那一列就不顯示。
  const [openList, setOpenList] = useState<{ month: string; key: string; rows: DayTransaction[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 每次回到這一頁（含從記帳表單返回）都重新查，剛記或剛改的帳才會反映在圖上。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
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

  // 展開某個類別時查它當月的交易。
  useFocusEffect(
    useCallback(() => {
      if (openKey === null) return;
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

  // 查詢結果還是上一個月份或收支別的時候不畫，避免標題和圖對不上。
  const current = breakdown && breakdown.month === month && breakdown.flow === flow ? breakdown : null;
  let colorIndex = 0;
  const rows = (current?.categories ?? []).map(category => {
    const other = flow === 'expense' && (!category.budgetCategory || category.budgetCategory.name === '其他');
    return { ...category, key: String(category.categoryId), name: category.categoryName,
      other, color: other ? reportOtherColor : reportCategoryColor(colorIndex++) };
  });
  const otherAmount = rows.filter(row => row.other).reduce((sum, row) => sum + row.amount, 0);
  const slices = [ ...rows.filter(row => !row.other),
    ...(otherAmount > 0 ? [{ key: 'budget-other', amount: otherAmount, color: reportOtherColor }] : []) ];
  const kind = FLOW_NAME[flow];
  return (
    <View style={styles.page}>
      <View style={styles.chartBlock}>
        {/* kit 的 Card 不收手勢與無障礙屬性，所以這裡直接用 kit.card 樣式的 View。 */}
        <View
          style={[kit.card, styles.donutCard]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${monthTitle(month)}${kind}分類圓餅圖，合計 ${formatAmount(current?.total ?? 0)} 元。左右滑可切換支出與收入。`}
        >
          <Donut slices={slices}>
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
          {rows.map((slice) => {
            const open = openKey === slice.key;
            return (
              <View key={slice.key}>
                <Pressable
                  onPress={tap(() => onOpen(open ? null : slice.key))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={({ pressed }) => [kit.row, pressed && kit.pressed]}
                >
                  <View style={[styles.colorDot, { backgroundColor: slice.color }]} />
                  <Text style={[text.body, styles.name]} numberOfLines={1}>
                    {slice.name}
                  </Text>
                  <Text style={[text.footnote, styles.tabular]}>{formatPermille(slice.permille)}</Text>
                  <Text style={[text.value, styles.amountBold]}>{formatAmount(slice.amount)}</Text>
                </Pressable>
                {open && openList?.key === slice.key && openList.month === month
                  ? openList.rows.map((t) => (
                      <SubRow
                        key={t.id}
                        label={`${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))}・${t.accountName}${t.note ? `・${t.note}` : ''}`}
                        amount={t.amount}
                        onPress={tap(() => router.push({ pathname: '/entry', params: { id: String(t.id) } }))}
                      />
                    ))
                  : null}
                {open ? <View style={styles.subEnd} /> : null}
              </View>
            );
          })}
        </Group>
      </View>
    </View>
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
  page: { gap: 24 },
  chartBlock: { gap: 10 },
  donutCard: { alignItems: 'center', padding: 20 },
  // 甜甜圈中空只有約 126pt 寬，金額太長時縮字而不是換行。
  donutTotal: { ...typeScale.title2, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'], maxWidth: 116 },
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
