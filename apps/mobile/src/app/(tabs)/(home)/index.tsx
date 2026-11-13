import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { monthGrid } from '../../../calc/calendarGrid.ts';
import { monthOf, shiftMonth, taipeiDate } from '../../../calc/dates.ts';
import type { CalendarDay, DayTransaction, TransferDetail } from '../../../ledger/index.ts';
import { formatAmount, dayTitle, monthTitle, userMessage } from '../../../ui/format.ts';
import { useLedger } from '../../../ui/LedgerProvider.tsx';
import { Banner, Card, Group, kit, MonthBar, SectionTitle, text } from '../../../ui/kit.tsx';
import { colors, typeScale } from '../../../ui/theme.ts';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function HomeScreen() {
  const ledger = useLedger();
  const [today, setToday] = useState(() => taipeiDate(new Date()));
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [days, setDays] = useState<Record<string, CalendarDay>>({});
  const [list, setList] = useState<DayTransaction[]>([]);
  const [transfers, setTransfers] = useState<TransferDetail[]>([]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingChecked, setOpeningChecked] = useState(false);
  const [openingRetry, setOpeningRetry] = useState(0);

  // 每次回到首頁（含從記帳表單返回）都重新查，月曆與當日列表才會包含剛存的那筆。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // 開帳檢查通過後就不再把整個首頁換成讀取畫面：換日期、換月份或從記帳表單返回時，
      // 月曆與列表留在原地更新，不閃爍也不丟掉捲動位置。
      ledger.getOnboardingStatus().then(async (status) => {
        if (cancelled) return;
        if (!status.completed) {
          setOpeningChecked(false); // 例如還原了一本還沒開帳的帳本：先蓋住舊內容再導去開帳
          router.push('/onboarding');
          return;
        }
        return Promise.all([
          ledger.getMonthCalendar(month),
          ledger.getDayTransactions(selected),
          ledger.isMonthClosed(monthOf(selected)),
          ledger.listTransfers(selected, selected),
        ]);
      }).then(
        (result) => {
          if (!result) return;
          const [calendar, transactions, closed, dayTransfers] = result;
          if (cancelled) return;
          setDays(Object.fromEntries(calendar.days.map((d) => [d.date, d])));
          setList(transactions);
          setTransfers(dayTransfers);
          setLocked(closed);
          setError(null);
          setOpeningChecked(true);
        },
        (e: unknown) => {
          if (!cancelled) setError(userMessage(e, '讀取失敗，請再試一次。'));
        },
      );
      return () => {
        cancelled = true;
      };
    }, [ledger, month, selected, openingRetry]),
  );

  // App 放到隔天才回到前景時，「今天」要跟著換日。原本選在舊的今天就一起移到新的今天，
  // 才不會把今天的帳記到昨天；使用者正在看別天時不動。
  const latest = useRef({ today, selected });
  latest.current = { today, selected };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = taipeiDate(new Date());
      const { today: previous, selected: current } = latest.current;
      if (now === previous) return;
      setToday(now);
      if (current === previous) {
        setSelected(now);
        setMonth(monthOf(now));
      }
    });
    return () => subscription.remove();
  }, []);

  function changeMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(next === monthOf(today) ? today : `${next}-01`);
  }

  if (!openingChecked) return (
    <View style={styles.centered}>
      {error ? (
        <>
          <Text style={text.error}>{error}</Text>
          <Pressable onPress={() => { setError(null); setOpeningRetry((value) => value + 1); }} accessibilityRole="button" style={styles.retry}>
            <Text style={text.link}>重新讀取</Text>
          </Pressable>
        </>
      ) : <ActivityIndicator accessibilityLabel="正在讀取帳本" />}
    </View>
  );

  const thisMonth = month === monthOf(today);

  return (
    // 整頁就是一個 ScrollView，原生大標題「記帳」才會隨捲動收合。
    <ScrollView style={kit.screen} contentContainerStyle={kit.content} contentInsetAdjustmentBehavior="automatic">
      <View style={kit.section}>
        <MonthBar
          title={monthTitle(month)}
          onPrev={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
          hint={thisMonth ? '本月' : '回到今天'}
          onHintPress={thisMonth ? undefined : () => { setMonth(monthOf(today)); setSelected(today); }}
        />
        <Card padded={false} style={styles.calendar}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={[text.caption, styles.weekday]}>
                {w}
              </Text>
            ))}
          </View>
          {monthGrid(month).map((week, i) => (
            <View key={i} style={styles.weekRow}>
              {week.map((date, j) => (
                <DayCell
                  key={j}
                  date={date}
                  day={date ? days[date] : undefined}
                  selected={date === selected}
                  isToday={date === today}
                  onPress={() => date && setSelected(date)}
                />
              ))}
            </View>
          ))}
        </Card>
      </View>

      <View style={kit.section}>
        <SectionTitle
          right={
            <Pressable
              onPress={() => router.push({ pathname: '/entry', params: { date: selected } })}
              disabled={locked}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={[styles.addButton, { backgroundColor: locked ? colors.border : colors.accent }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: locked }}
            >
              <Text style={[styles.addText, { color: locked ? colors.muted : '#ffffff' }]}>新增</Text>
            </Pressable>
          }
        >
          {dayTitle(selected)}
        </SectionTitle>
        {locked ? (
          <Banner tone="locked">
            🔒 {monthTitle(monthOf(selected))}已月結，交易已鎖定，不能新增、修改或刪除。要更改請先撤銷月結，或做前期更正。
          </Banner>
        ) : null}
        {error ? <Text style={[text.error, kit.outsideText]}>{error}</Text> : null}
        {list.length === 0 && transfers.length === 0 && !error ? (
          <Card>
            <Text style={[text.subheadMuted, styles.empty]}>這天還沒有交易</Text>
          </Card>
        ) : null}
        <Group>
          {[
            ...list.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/entry', params: { id: String(t.id) } })}
                accessibilityRole="button"
                accessibilityHint={locked ? '已月結，只能檢視' : '修改或刪除這筆交易'}
                style={({ pressed }) => [kit.row, pressed && kit.pressed]}
              >
                <View style={styles.main}>
                  <Text style={text.body}>{t.categoryName}</Text>
                  <Text style={text.footnote}>
                    {locked ? '🔒 ' : ''}
                    {t.accountName}
                    {t.memberName ? `・${t.memberName}` : ''}
                    {t.note ? `・${t.note}` : ''}
                  </Text>
                </View>
                <Text style={[text.value, { color: t.flow === 'expense' ? colors.expense : colors.income }]}>
                  {t.flow === 'expense' ? '-' : '+'}
                  {formatAmount(t.amount)}
                </Text>
              </Pressable>
            )),
            ...transfers.map((t) => (
              <Pressable
                key={`transfer-${t.id}`}
                onPress={() => router.push({ pathname: '/transfer', params: { id: String(t.id) } })}
                accessibilityRole="button"
                accessibilityHint={locked ? '已月結，只能檢視轉帳' : '修改或刪除這筆轉帳'}
                style={({ pressed }) => [kit.row, pressed && kit.pressed]}
              >
                <View style={styles.main}>
                  <Text style={text.body}>{locked ? '🔒 ' : ''}轉帳</Text>
                  <Text style={text.footnote}>{t.fromAccountName} → {t.toAccountName}{t.note ? `・${t.note}` : ''}</Text>
                </View>
                <Text style={text.value}>{formatAmount(t.amount)}</Text>
              </Pressable>
            )),
          ]}
        </Group>
      </View>
    </ScrollView>
  );
}

function DayCell(props: {
  date: string | null;
  day?: CalendarDay;
  selected: boolean;
  isToday: boolean;
  onPress: () => void;
}) {
  const { date, day, selected, isToday, onPress } = props;
  if (!date) return <View style={styles.cell} />;
  const hasExpense = !!day && day.expenseTotal > 0;
  const hasIncome = !!day && day.incomeTotal > 0;
  const label = `${dayTitle(date)}${hasExpense ? `，支出 ${formatAmount(day.expenseTotal)}` : ''}${hasIncome ? `，收入 ${formatAmount(day.incomeTotal)}` : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.cell,
        styles.cellFace,
        selected && { backgroundColor: colors.accentSoft },
        pressed && !selected && { backgroundColor: colors.fill },
      ]}
    >
      <Text
        style={[
          styles.dayNumber,
          selected && { fontWeight: '600' },
          isToday && { color: colors.accent, fontWeight: '700' },
        ]}
      >
        {Number(date.slice(8))}
      </Text>
      {hasExpense ? (
        <Text numberOfLines={1} style={[styles.dayTotal, { color: colors.expense }]}>{formatAmount(day.expenseTotal)}</Text>
      ) : null}
      {hasIncome ? (
        <Text numberOfLines={1} style={[styles.dayTotal, { color: colors.income }]}>{formatAmount(day.incomeTotal)}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  retry: { padding: 12 },
  calendar: { paddingHorizontal: 8, paddingVertical: 10 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingBottom: 4 },
  cell: { flex: 1, height: 52 },
  // 日期數字靠上對齊：有沒有小額合計，同一列的數字都在同一條線上。
  cellFace: { alignItems: 'center', paddingTop: 5, borderRadius: 12, borderCurve: 'continuous' },
  dayNumber: { ...typeScale.subhead, color: colors.text, fontVariant: ['tabular-nums'] },
  // 日曆格子裡的小額合計：格子太窄，刻意用比字級表更小的 10。
  dayTotal: { fontSize: 10, lineHeight: 12, fontVariant: ['tabular-nums'] },
  addButton: { minHeight: 36, borderRadius: 18, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 15, fontWeight: '600' },
  empty: { textAlign: 'center' },
  main: { flex: 1, gap: 2 },
});
