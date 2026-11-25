import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { monthOf, shiftMonth, taipeiDate } from '../../../calc/dates.ts';
import type { DayTransaction, Flow, ReportGrouping } from '../../../ledger/index.ts';
import { HorizontalPager, usePagerTap } from '../../../ui/HorizontalPager.tsx';
import { Donut } from '../../../ui/Donut.tsx';
import { formatAmount, formatPermille, monthTitle, userMessage } from '../../../ui/format.ts';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { Footnote, Group, MonthBar, SectionTitle, Segmented, kit, text } from '../../../ui/kit.tsx';
import { TabScrollView } from '../../../ui/LargeTitle.tsx';
import { AssetTrendPage } from '../../../ui/AssetTrend.tsx';
import { reportCategoryColor, reportOtherColor, colors, typeScale } from '../../../ui/theme.ts';

// 明細（票 09）：選定月份的圓餅圖＋類別列表。支出／收入用上方切換或在圓餅圖上左右滑；
// 點類別展開該類別當月的交易，點交易進記帳表單（可改可刪，已結月份為唯讀）。
const FLOW_NAME: Record<Flow, string> = { expense: '支出', income: '收入' };
const otherFlow = (flow: Flow): Flow => (flow === 'expense' ? 'income' : 'expense');
// 第三頁「財產」（2026-11-25）：從收入再左滑，沒有月份列。
const PAGE_OPTIONS = [...(['expense', 'income'] as const).map((f) => ({ key: f, label: FLOW_NAME[f] })), { key: 'assets', label: '財產' }];
const TREND_PAGE = 2;
// 圓餅下方的標籤（2026-11-25）：依分類、成員或帳戶看；圓餅與列表一起換。灰色「其他」合併只在分類。
type Grouping = 'category' | ReportGrouping;
const GROUP_OPTIONS: readonly { key: Grouping; label: string }[] = [
  { key: 'category', label: '分類' }, { key: 'member', label: '成員' }, { key: 'account', label: '帳戶' },
];
const GROUP_NAME: Record<Grouping, string> = { category: '分類', member: '成員', account: '帳戶' };
interface ViewRow { key: string; id: number; name: string; amount: number; permille: number; other: boolean }
interface ReportView { month: string; flow: Flow; by: Grouping; total: number; otherFlowTotal: number; rows: ViewRow[] }
const withIcon = (icon: string | null, name: string) => (icon ? `${icon} ${name}` : name);

export default function ReportScreen() {
  const [thisMonth, setThisMonth] = useState(() => monthOf(taipeiDate(new Date())));
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<Grouping>('category');
  function chooseGroup(next: Grouping) {
    setGroupBy(next);
    setOpenKey(null);
  }
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
      {selected === TREND_PAGE ? null : <MonthBar title={monthTitle(month)} onPrev={() => chooseMonth(shiftMonth(month, -1))}
        onNext={() => chooseMonth(shiftMonth(month, 1))} nextDisabled={month >= thisMonth}
        hint={month === thisMonth ? '本月' : '回到本月'}
        onHintPress={month === thisMonth ? undefined : () => chooseMonth(thisMonth)} />}
      <HorizontalPager options={PAGE_OPTIONS} onChange={choosePage}>
        {(['expense', 'income'] as const).map((flow, index) => (
          <ReportPage key={`${month}-${flow}`} month={month} flow={flow} groupBy={groupBy} onGroupBy={chooseGroup}
            openKey={selected === index ? openKey : null} onOpen={setOpenKey} />
        ))}
        <AssetTrendPage dots={<PageDots index={TREND_PAGE} />} />
      </HorizontalPager>
    </TabScrollView>
  );
}

function ReportPage({ month, flow, groupBy, onGroupBy, openKey, onOpen }: {
  month: string; flow: Flow; groupBy: Grouping; onGroupBy: (next: Grouping) => void;
  openKey: string | null; onOpen: (key: string | null) => void;
}) {
  const tap = usePagerTap();
  const ledger = useLedger();
  const [breakdown, setBreakdown] = useState<ReportView | null>(null);
  // 展開的類別的交易，連同它屬於哪個月份、哪個類別一起存；對不上目前展開的那一列就不顯示。
  const [openList, setOpenList] = useState<{ month: string; by: Grouping; key: string; rows: DayTransaction[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 每次回到這一頁（含從記帳表單返回）都重新查，剛記或剛改的帳才會反映在圖上。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load: Promise<ReportView> = groupBy === 'category'
        ? ledger.getMonthBreakdown(month, flow).then((b) => ({
            month, flow, by: groupBy, total: b.total, otherFlowTotal: b.otherFlowTotal,
            rows: b.categories.map((c) => ({ key: String(c.categoryId), id: c.categoryId, name: withIcon(c.categoryIcon, c.categoryName),
              amount: c.amount, permille: c.permille,
              other: flow === 'expense' && (!c.budgetCategory || c.budgetCategory.name === '其他') })),
          }))
        : ledger.getMonthGroupBreakdown(month, flow, groupBy).then((b) => ({
            month, flow, by: groupBy, total: b.total, otherFlowTotal: b.otherFlowTotal,
            rows: b.groups.map((g) => ({ key: String(g.id), id: g.id, name: `${withIcon(g.icon, g.name)}${g.active ? '' : '（已停用）'}`,
              amount: g.amount, permille: g.permille, other: false })),
          }));
      load.then(
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
    }, [ledger, month, flow, groupBy]),
  );

  // 展開某個類別時查它當月的交易。
  useFocusEffect(
    useCallback(() => {
      if (openKey === null) return;
      let cancelled = false;
      const by = groupBy;
      (by === 'category'
        ? ledger.getCategoryMonthTransactions(month, Number(openKey))
        : ledger.getGroupMonthTransactions(month, flow, by, Number(openKey))).then(
        (rows) => {
          if (!cancelled) setOpenList({ month, by, key: openKey, rows });
        },
        (e: unknown) => {
          if (!cancelled) setError(userMessage(e, '讀取失敗，請再試一次。'));
        },
      );
      return () => {
        cancelled = true;
      };
    }, [ledger, month, flow, groupBy, openKey]),
  );

  // 查詢結果還是上一個月份或收支別的時候不畫，避免標題和圖對不上。
  const current = breakdown && breakdown.month === month && breakdown.flow === flow && breakdown.by === groupBy ? breakdown : null;
  let colorIndex = 0;
  const rows = (current?.rows ?? []).map(row => ({ ...row, color: row.other ? reportOtherColor : reportCategoryColor(colorIndex++) }));
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
          accessibilityLabel={`${monthTitle(month)}${kind}依${GROUP_NAME[groupBy]}的圓餅圖，合計 ${formatAmount(current?.total ?? 0)} 元。左右滑可切換支出、收入與財產。`}
        >
          <Donut slices={slices}>
            <Text style={text.footnote}>本月{kind}</Text>
            <Text style={styles.donutTotal} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(current?.total ?? 0)}
            </Text>
          </Donut>
        </View>

        <PageDots index={flow === 'expense' ? 0 : 1} />
      </View>

      <Segmented options={GROUP_OPTIONS} value={groupBy} onChange={onGroupBy} />

      <View style={kit.section}>
        <SectionTitle
          right={
            <Text style={styles.otherTotal}>
              {FLOW_NAME[otherFlow(flow)]} {formatAmount(current?.otherFlowTotal ?? 0)}
            </Text>
          }
        >
          {kind}依{GROUP_NAME[groupBy]}
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
                {open && openList?.key === slice.key && openList.month === month && openList.by === groupBy
                  ? openList.rows.map((t) => (
                      <SubRow
                        key={t.id}
                        label={`${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))}・${groupBy === 'category' ? t.accountName : t.categoryName}${t.note ? `・${t.note}` : ''}`}
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

function PageDots({ index }: { index: number }) {
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PAGE_OPTIONS.map((option, i) => (
        <View key={option.key} style={[styles.pageDot, { backgroundColor: i === index ? colors.accent : colors.chevron }]} />
      ))}
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
