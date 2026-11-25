// 明細第三頁「財產」（2026-11-25 翰陞定案）：已月結月份的財產折線。一次只畫一條（總財產／帳面總資產／投資），
// 所以只有一條 y 軸、不用圖例；點圖上任一處看那個月的數字，下方列表就是表格版。
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { AssetTrendPoint } from '../ledger/index.ts';
import { formatAmount, monthTitle, userMessage } from './format.ts';
import { useLedger } from './LedgerProvider.tsx';
import { Footnote, Group, SectionTitle, Segmented, kit, text } from './kit.tsx';
import { usePagerTap } from './HorizontalPager.tsx';
import { colors, typeScale } from './theme.ts';
import { nearestIndex, trendLayout } from './trendGeometry.ts';

type Series = 'total' | 'book' | 'investment';
type Range = 'year' | 'all';
const SERIES: readonly { key: Series; label: string }[] = [
  { key: 'total', label: '總財產' }, { key: 'book', label: '帳面總資產' }, { key: 'investment', label: '投資' },
];
const RANGES: readonly { key: Range; label: string }[] = [{ key: 'year', label: '近 12 個月' }, { key: 'all', label: '全部' }];
const CHART_HEIGHT = 160;
const AXIS_WIDTH = 44;

/** 刻度用「萬」：1,600,000 → 160萬。 */
function compact(value: number): string {
  if (Math.abs(value) < 10_000) return formatAmount(Math.round(value));
  const wan = value / 10_000;
  return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}萬`;
}

export function AssetTrendPage({ dots }: { dots: ReactNode }) {
  const ledger = useLedger();
  const tap = usePagerTap();
  const [trend, setTrend] = useState<AssetTrendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Series>('total');
  const [range, setRange] = useState<Range>('year');
  const [picked, setPicked] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    ledger.getAssetTrend().then(
      (result) => { if (!cancelled) { setTrend(result); setError(null); } },
      (e: unknown) => { if (!cancelled) setError(userMessage(e, '讀取失敗，請再試一次。')); },
    );
    return () => { cancelled = true; };
  }, [ledger]));

  const shown = (trend ?? []).slice(range === 'year' ? -12 : 0);
  const values = shown.map((p) => p[series]);
  const layout = trendLayout(values, Math.max(0, width - AXIS_WIDTH), CHART_HEIGHT);
  const index = picked !== null && picked < shown.length ? picked : shown.length - 1;
  const point = shown[index];
  const previous = index > 0 ? shown[index - 1] : null;
  const change = point && previous ? point[series] - previous[series] : null;
  const atCost = series !== 'book' && shown.some((p) => p.investmentAtCost);
  const label = SERIES.find((s) => s.key === series)!.label;

  function choose<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPicked(null); };
  }

  return (
    <View style={styles.page}>
      <View style={styles.chartBlock}>
        <View style={[kit.card, styles.card]}>
          <Text style={text.footnote}>{point ? `${monthTitle(point.month)}${label}` : label}</Text>
          <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>{point ? formatAmount(point[series]) : '—'}</Text>
          {change !== null ? (
            <Text style={[text.footnote, { color: change >= 0 ? colors.income : colors.expense }]}>
              比上個月 {change >= 0 ? '+' : '−'}{formatAmount(Math.abs(change))}
            </Text>
          ) : <Text style={text.footnote}> </Text>}
          <Pressable
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onPress={(e) => { if (layout.points.length > 0) setPicked(nearestIndex(layout.points, e.nativeEvent.locationX - AXIS_WIDTH)); }}
            accessibilityRole="image"
            accessibilityLabel={shown.length > 0
              ? `${label}折線圖，${monthTitle(shown[0].month)}到${monthTitle(shown[shown.length - 1].month)}，最新 ${formatAmount(values[values.length - 1])} 元。下方列表有每個月的數字。`
              : `${label}折線圖，還沒有已月結的月份。`}
            style={styles.chart}
          >
            {width > 0 && layout.points.length > 0 ? (
              <Svg width={width} height={CHART_HEIGHT} pointerEvents="none">
                {layout.ticks.map((t) => (
                  <Line key={t.value} x1={AXIS_WIDTH} x2={width} y1={t.y} y2={t.y} stroke={colors.border} strokeWidth={1} />
                ))}
                <Path d={layout.path} transform={`translate(${AXIS_WIDTH} 0)`} stroke={colors.accent} strokeWidth={2} fill="none"
                  strokeLinejoin="round" strokeLinecap="round" />
                {point ? (
                  <>
                    <Line x1={AXIS_WIDTH + layout.points[index].x} x2={AXIS_WIDTH + layout.points[index].x} y1={0} y2={CHART_HEIGHT}
                      stroke={colors.chevron} strokeWidth={1} />
                    <Circle cx={AXIS_WIDTH + layout.points[index].x} cy={layout.points[index].y} r={5}
                      fill={colors.accent} stroke={colors.surface} strokeWidth={2} />
                  </>
                ) : null}
              </Svg>
            ) : null}
            {width > 0 ? layout.ticks.map((t) => (
              <Text key={t.value} style={[styles.tick, { top: t.y - 8 }]} numberOfLines={1}>{compact(t.value)}</Text>
            )) : null}
          </Pressable>
          {shown.length > 1 ? (
            <View style={[styles.axisX, { marginLeft: AXIS_WIDTH }]}>
              <Text style={styles.axisLabel}>{monthTitle(shown[0].month)}</Text>
              <Text style={styles.axisLabel}>{monthTitle(shown[shown.length - 1].month)}</Text>
            </View>
          ) : null}
        </View>
        {dots}
      </View>

      <Segmented options={SERIES} value={series} onChange={choose(setSeries)} />
      <Segmented options={RANGES} value={range} onChange={choose(setRange)} />

      {error ? <Text style={[text.error, kit.outsideText]}>{error}</Text> : null}
      {trend && trend.length === 0 && !error ? <Footnote>完成第一次月結後，這裡會畫出每個月的財產。</Footnote> : null}
      {atCost ? <Footnote>有投資標的在當時還沒填過市值，那些月份的投資以成本估算。</Footnote> : null}
      <Footnote>只畫已月結的月份。總財產＝帳面總資產－投入本金＋投資市值，和「財產分配」相同。</Footnote>

      {shown.length > 0 ? (
        <View style={kit.section}>
          <SectionTitle>每月{label}</SectionTitle>
          <Group>
            {[...shown].reverse().map((p) => {
              const i = shown.indexOf(p);
              return (
                <Pressable key={p.month} onPress={tap(() => setPicked(i))} accessibilityRole="button"
                  accessibilityState={{ selected: i === index }}
                  style={({ pressed }) => [kit.row, pressed && kit.pressed, i === index && styles.pickedRow]}>
                  <Text style={[text.body, styles.name]}>{monthTitle(p.month)}</Text>
                  {series !== 'book' && p.investmentAtCost ? <Text style={text.footnote}>以成本估算</Text> : null}
                  <Text style={[text.value, styles.amount]}>{formatAmount(p[series])}</Text>
                </Pressable>
              );
            })}
          </Group>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  chartBlock: { gap: 10 },
  card: { padding: 16, gap: 2 },
  hero: { ...typeScale.title2, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  chart: { height: CHART_HEIGHT, marginTop: 12 },
  tick: { position: 'absolute', left: 0, width: AXIS_WIDTH - 6, ...typeScale.caption, color: colors.muted, fontVariant: ['tabular-nums'] },
  axisX: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisLabel: { ...typeScale.caption, color: colors.muted },
  name: { flex: 1 },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  pickedRow: { backgroundColor: colors.accentSoft },
});
