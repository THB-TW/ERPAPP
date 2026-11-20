import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { monthOf, shiftMonth, taipeiDate } from '../../../calc/dates.ts';
import type { BudgetMonthView, BudgetProgress, BudgetProgressRow, LoanView } from '../../../ledger/index.ts';
import { formatAmount, monthTitle, userMessage } from '../../../ui/format.ts';
import { HorizontalPager, usePagerTap } from '../../../ui/HorizontalPager.tsx';
import { Card, Footnote, Group, MonthBar, NavRow, Row, SectionTitle, kit, text } from '../../../ui/kit.tsx';
import { useLargeTitle } from '../../../ui/LargeTitle.tsx';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { LoanCards } from '../../../ui/LoanCards.tsx';
import { MonthlyCloseSummary } from '../../../ui/MonthlyCloseSummary.tsx';
import { colors, groupColors, typeScale } from '../../../ui/theme.ts';

const SECTIONS = [
  { key: 'overview', label: '總覽', color: groupColors.overview },
  { key: 'reserve', label: '儲備類', color: groupColors.reserve },
  { key: 'fixed', label: '固定支出', color: groupColors.fixed },
  { key: 'actual', label: '照實支', color: groupColors.actual },
  { key: 'loan', label: '貸款', color: groupColors.loan },
] as const;
type Section = (typeof SECTIONS)[number];
const GROUP_NOTES = {
  reserve: '月結時，上限減實支累積為分類儲備。',
  fixed: '月結時，結餘回到當月盈餘。',
  actual: '花多少算多少，不設定上限。',
};

export default function BudgetScreen() {
  const ledger = useLedger();
  const [month, setMonth] = useState(() => monthOf(taipeiDate(new Date())));
  const [progress, setProgress] = useState<BudgetProgress | null>(null);
  const [closed, setClosed] = useState<BudgetMonthView | null>(null);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const isCurrentMonth = month === monthOf(taipeiDate(new Date()));
  const largeTitle = useLargeTitle('預算');

  // 返回分頁時重查交易和上限，但不切走目前區段。
  const load = useCallback(() => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    Promise.all([ledger.getBudgetProgress(month), ledger.listBudgetMonths(), ledger.listLoans(month)])
      .then(async ([result, months, loanRows]) => {
        // 已結月份用自己的快照；未結月份只看不晚於所選月份的最近已結結果。
        const latest = months.filter(item => item.month <= month).at(-1);
        return { result, loanRows, snapshot: latest ? await ledger.getBudgetMonth(latest.month) : null };
      })
      .then(({ result, snapshot, loanRows }) => {
        if (version !== loadVersion.current) return;
        setProgress(result);
        setClosed(snapshot);
        setLoans(loanRows);
        setLoading(false);
      }, cause => {
        if (version !== loadVersion.current) return;
        setProgress(null);
        setClosed(null);
        setLoans([]);
        setError(userMessage(cause, '讀取預算失敗，請再試一次。'));
        setLoading(false);
      });
  }, [ledger, month]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { loadVersion.current++; };
  }, [load]));

  function changeMonth(next: string) {
    loadVersion.current++;
    setProgress(null);
    setLoading(true);
    setError(null);
    setMonth(next);
  }

  return (
    <View style={kit.screen}>
      <View style={styles.titleWrap}>{largeTitle.element}</View>
      <View style={styles.monthBarWrap}>
        <MonthBar
          title={monthTitle(month)}
          hint={isCurrentMonth ? '本月' : '回到本月'}
          onHintPress={isCurrentMonth ? undefined : () => changeMonth(monthOf(taipeiDate(new Date())))}
          onPrev={() => changeMonth(shiftMonth(month, -1))}
          onNext={() => changeMonth(shiftMonth(month, 1))}
          prevDisabled={month <= '1900-01'}
          nextDisabled={month >= '9998-12'}
        />
      </View>
      <HorizontalPager options={SECTIONS} variant="rail">
        {SECTIONS.map(section => (
          <ScrollView key={`${month}:${section.key}`} style={kit.screen} directionalLockEnabled
            contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
            {loading ? <ActivityIndicator accessibilityLabel="讀取預算中" style={styles.loading} /> : error ? (
              <BudgetLoadError message={error} onRetry={load} />
            ) : progress ? (
              <BudgetSection section={section} progress={progress} closed={closed} loans={loans} />
            ) : null}
          </ScrollView>
        ))}
      </HorizontalPager>
    </View>
  );
}

const NO_BUDGET = '這個月還沒有預算上限設定，請到「設定 → 預算與分類」建立。';

function BudgetLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tap = usePagerTap();
  return <Card>
    <Text style={text.error} accessibilityRole="alert">{message}</Text>
    <Pressable onPress={tap(onRetry)} accessibilityRole="button">
      <Text style={text.link}>重新讀取</Text>
    </Pressable>
  </Card>;
}

function BudgetSection({ section, progress, closed, loans }: {
  section: Section; progress: BudgetProgress; closed: BudgetMonthView | null; loans: LoanView[];
}) {
  const tap = usePagerTap();
  const canAdjust = closed !== null && progress.month >= progress.openMonth;
  if (section.key === 'overview') {
    return (
      <>
        <Card style={styles.summary}>
          <View style={styles.amountStack}>
            <Text style={text.footnote}>本月全部已花</Text>
            <Text style={text.amount}>NT$ {formatAmount(progress.totalSpent)}</Text>
          </View>
          <View style={kit.hairline} />
          <View style={kit.rowBetween}>
            <Text style={text.body}>有上限分類合計</Text>
            <Text style={text.value}>NT$ {formatAmount(progress.totalCap)}</Text>
          </View>
        </Card>
        <Footnote>上限合計不含照實支；未設定歸屬的支出計入「其他」。可編輯的開放月份：{monthTitle(progress.openMonth)}。已結月份沿用當時的上限快照。</Footnote>
        {progress.rows.length === 0 ? <Footnote>{NO_BUDGET}</Footnote> : null}
        {canAdjust ? <AdjustmentLinks /> : null}
        {closed ? (
          <>
            <SectionHead>{monthTitle(closed.month)}已結資產</SectionHead>
            <MonthlyCloseSummary summary={closed} cardStyle={styles.card} />
            <Footnote>以下累積儲備截至{monthTitle(closed.month)}，包含已生效調整；尚未包含未結月份的預估變動。</Footnote>
            <Group>
              {closed.reserves.map(reserve => (
                <Row key={reserve.categoryId}>
                  <Text style={[text.body, styles.grow]}>{reserve.name}累積儲備</Text>
                  <Text style={[text.value, reserve.balance < 0 && styles.negative]}>{formatAmount(reserve.balance)}</Text>
                </Row>
              ))}
            </Group>
            <Group>
              <NavRow tone="accent" title="查看這個月的月結快照"
                onPress={tap(() => router.push({ pathname: '/close-snapshot', params: { month: closed.month } }))} />
            </Group>
          </>
        ) : <Footnote>這個月份尚無已結資產；完成月結後會顯示可用餘額、累積儲備與帳面總資產。</Footnote>}
      </>
    );
  }

  if (section.key === 'loan') {
    return (
      <>
        <SectionHead color={section.color}>貸款／分期</SectionHead>
        <Footnote>月結時提撥每月繳款；實際繳款選這筆貸款分類，月結後扣減儲備與剩餘本金。未結月份尚未計入新的提撥與繳款。</Footnote>
        <LoanCards loans={loans} cardStyle={styles.card} />
        <Group>
          <NavRow tone="accent" title="到設定管理貸款／分期" onPress={tap(() => router.push('/loans'))} />
          <NavRow tone="accent" title="到設定修改預算與分類" onPress={tap(() => router.navigate('/(tabs)/settings'))} />
        </Group>
      </>
    );
  }

  const rows = progress.rows.filter(row => row.kind === section.key);
  return (
    <>
      <SectionHead color={section.color}>{section.label}</SectionHead>
      <Footnote>{GROUP_NOTES[section.key]}</Footnote>
      {section.key === 'reserve' && canAdjust ? <AdjustmentLinks /> : null}
      {rows.length > 0 ? (
        <Group>{rows.map(row => <ProgressRow key={row.categoryId} row={row} color={section.color} />)}</Group>
      ) : <Footnote>{progress.rows.length === 0 ? NO_BUDGET : '這一組還沒有分類。'}</Footnote>}
    </>
  );
}

function AdjustmentLinks() {
  const tap = usePagerTap();
  return (
    <Group>
      <NavRow tone="accent" title="挪用儲備" onPress={tap(() => router.push({ pathname: '/adjustments', params: { action: 'transfer' } }))} />
      <NavRow tone="accent" title="可用餘額補入儲備" onPress={tap(() => router.push({ pathname: '/adjustments', params: { action: 'fund' } }))} />
    </Group>
  );
}

/** 區段標題：kit 的 SectionTitle 自帶左右 4 內距，這裡以 -4 外距抵銷，讓標題與卡片左緣對齊；上方再留 8。 */
function SectionHead({ children, color }: { children: ReactNode; color?: string }) {
  return <View style={styles.sectionHead}><SectionTitle color={color}>{children}</SectionTitle></View>;
}

/** 進度條：出現或數值改變時，用 0.5 秒緩出長到目前比例（系統「減少動態效果」開啟時直接到位）。 */
function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.set(withTiming(ratio, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [ratio, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  return <Animated.View style={[styles.progressFill, { backgroundColor: color }, fill]} />;
}

function ProgressRow({ row, color }: { row: BudgetProgressRow; color: string }) {
  const over = row.remaining !== null && row.remaining < 0;
  const ratio = row.cap === null ? 0 : row.cap > 0 ? Math.min(1, row.spent / row.cap) : row.spent > 0 ? 1 : 0;
  return (
    <View style={styles.progressRow}>
      <View style={kit.rowBetween}>
        <Text style={[text.headline, { flex: 1 }]}>{row.name}</Text>
        {row.remaining === null ? null : (
          <Text style={[text.value, over && { color: colors.expense }]}>
            {over ? '超支' : '剩餘'} {formatAmount(Math.abs(row.remaining))}
          </Text>
        )}
      </View>
      {row.cap !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${row.name}本月預算進度`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100), text: `已花 ${formatAmount(row.spent)}，上限 ${formatAmount(row.cap)}` }}
          style={kit.progressTrack}
        >
          <ProgressBar ratio={ratio} color={over ? colors.expense : color} />
        </View>
      ) : null}
      <Text style={styles.footnoteInCard}>已花 {formatAmount(row.spent)}{row.cap === null ? '・照實支' : ` ／ 上限 ${formatAmount(row.cap)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleWrap: { paddingHorizontal: 16, paddingTop: 8 },
  monthBarWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  page: { ...kit.content, paddingTop: 16, gap: 12 },
  sectionHead: { marginHorizontal: -4, marginTop: 4 },
  card: { ...kit.card, padding: 16 },
  loading: { marginTop: 24 },
  summary: { gap: 14 },
  amountStack: { gap: 2 },
  grow: { flex: 1 },
  negative: { color: colors.expense },
  progressRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  footnoteInCard: { ...typeScale.footnote, color: colors.muted, fontVariant: ['tabular-nums'] },
  progressFill: { height: 6, borderRadius: 3 },
});
