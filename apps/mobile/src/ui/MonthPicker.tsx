import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { monthOf, taipeiDate } from '../calc/dates.ts';
import { monthTitle } from './format.ts';
import { Card, MonthBar, NavRow, kit, text } from './kit.tsx';
import { colors } from './theme.ts';

export function MonthPicker({ label, value, onChange, allowUnknown = false, disabled = false }: {
  label: string; value: string; onChange: (month: string) => void; allowUnknown?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number((value || monthOf(taipeiDate(new Date()))).slice(0, 4)));
  function choose(month: string) { onChange(month); setOpen(false); }
  return <View style={kit.section}>
    <NavRow title={label} value={value ? monthTitle(value) : '未定'} disabled={disabled}
      onPress={() => { setYear(Number((value || monthOf(taipeiDate(new Date()))).slice(0, 4))); setOpen(!open); }} />
    {open && !disabled ? <Card>
      <MonthBar title={`${year} 年`} onPrev={() => setYear(Math.max(1, year - 1))}
        onNext={() => setYear(Math.min(9999, year + 1))} prevDisabled={year === 1} nextDisabled={year === 9999}
        prevLabel="上一年" nextLabel="下一年" />
      <View style={styles.grid}>
        {Array.from({ length: 12 }, (_, index) => {
          const month = `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`;
          return <Pressable key={month} accessibilityRole="button" accessibilityLabel={`${year} 年 ${index + 1} 月`}
            accessibilityState={{ selected: value === month }} onPress={() => choose(month)}
            style={[styles.month, value === month && styles.selected]}>
            <Text style={text.body}>{index + 1} 月</Text>
          </Pressable>;
        })}
      </View>
      {allowUnknown ? <NavRow title="未定" onPress={() => choose('')} /> : null}
    </Card> : null}
  </View>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  month: { width: '25%', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accentSoft },
});
