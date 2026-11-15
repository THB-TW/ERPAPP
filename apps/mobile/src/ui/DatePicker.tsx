import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { taipeiDate } from '../calc/dates.ts';
import { Card, NavRow, PrimaryButton, kit, text } from './kit.tsx';

// 固定台北日曆日，避免裝置時區把日期往前／後移一天；中午避開午夜邊界。
const calendarDate = (value: string) => new Date(`${value}T12:00:00+08:00`);
export function DatePicker({ label, value, onChange, minimum = '0001-01-01', maximum = '9999-12-31', disabled = false, unavailableMonths = [] }: {
  label: string; value: string; onChange: (date: string) => void; minimum?: string; maximum?: string; disabled?: boolean; unavailableMonths?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const unavailable = unavailableMonths.includes(draft.slice(0, 7));
  return <View style={kit.section}>
    <NavRow title={label} value={value} disabled={disabled} onPress={() => { setDraft(value); setOpen(!open); }} />
    {open && !disabled ? <Card>
      <DateTimePicker value={calendarDate(draft)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        locale="zh-TW" timeZoneName="Asia/Taipei" themeVariant="light"
        minimumDate={calendarDate(minimum)} maximumDate={calendarDate(maximum)}
        onChange={(event, date) => {
          if (event.type === 'dismissed') { setOpen(false); return; }
          if (!date) return;
          const chosen = taipeiDate(date);
          setDraft(chosen);
          if (Platform.OS !== 'ios' && !unavailableMonths.includes(chosen.slice(0, 7))) { setOpen(false); onChange(chosen); }
        }} />
      {unavailable ? <Text style={text.error}>這個月份已結，請選擇開放的日期。</Text> : null}
      {Platform.OS === 'ios' ? <PrimaryButton disabled={unavailable} title="套用日期" onPress={() => { setOpen(false); onChange(draft); }} /> : null}
    </Card> : null}
  </View>;
}
