import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { monthGrid } from '../calc/calendarGrid.ts';
import { monthOf, shiftMonth, taipeiDate } from '../calc/dates.ts';
import type { CalendarDay, DayTransaction } from '../ledger/index.ts';
import { formatAmount, dayTitle, monthTitle, userMessage } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function HomeScreen() {
  const ledger = useLedger();
  const [today, setToday] = useState(() => taipeiDate(new Date()));
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [days, setDays] = useState<Record<string, CalendarDay>>({});
  const [list, setList] = useState<DayTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 每次回到首頁（含從記帳表單返回）都重新查，月曆與當日列表才會包含剛存的那筆。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([ledger.getMonthCalendar(month), ledger.getDayTransactions(selected)]).then(
        ([calendar, transactions]) => {
          if (cancelled) return;
          setDays(Object.fromEntries(calendar.days.map((d) => [d.date, d])));
          setList(transactions);
          setError(null);
        },
        (e: unknown) => {
          if (!cancelled) setError(userMessage(e, '讀取失敗，請再試一次。'));
        },
      );
      return () => {
        cancelled = true;
      };
    }, [ledger, month, selected]),
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
        <Pressable onPress={() => changeMonth(-1)} hitSlop={12} accessibilityLabel="上個月">
          <Text style={{ fontSize: 22, color: colors.accent }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{monthTitle(month)}</Text>
        <Pressable onPress={() => changeMonth(1)} hitSlop={12} accessibilityLabel="下個月">
          <Text style={{ fontSize: 22, color: colors.accent }}>›</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ paddingHorizontal: 8 }}>
        {monthGrid(month).map((week, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
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
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{dayTitle(selected)}</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/entry', params: { date: selected } })}
          style={{ backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>新增</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {error ? <Text style={{ color: colors.expense, padding: 12 }}>{error}</Text> : null}
        {list.length === 0 && !error ? (
          <Text style={{ color: colors.muted, padding: 12 }}>這天還沒有帳目</Text>
        ) : null}
        {list.map((t) => (
          <View
            key={t.id}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16 }}>{t.categoryName}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {t.accountName}
                {t.note ? `・${t.note}` : ''}
              </Text>
            </View>
            <Text style={{ color: t.flow === 'expense' ? colors.expense : colors.income, fontSize: 16 }}>
              {t.flow === 'expense' ? '-' : '+'}
              {formatAmount(t.amount)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
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
  if (!date) return <View style={{ flex: 1, height: 52 }} />;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 52,
        alignItems: 'center',
        paddingTop: 4,
        borderRadius: 8,
        backgroundColor: selected ? colors.surface : 'transparent',
        borderWidth: isToday ? 1 : 0,
        borderColor: colors.accent,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: selected ? '700' : '400' }}>{Number(date.slice(8))}</Text>
      {day && day.expenseTotal > 0 ? (
        <Text style={{ color: colors.expense, fontSize: 10 }}>{formatAmount(day.expenseTotal)}</Text>
      ) : null}
      {day && day.incomeTotal > 0 ? (
        <Text style={{ color: colors.income, fontSize: 10 }}>{formatAmount(day.incomeTotal)}</Text>
      ) : null}
    </Pressable>
  );
}
