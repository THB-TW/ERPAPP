import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';
import { colors } from '../../ui/theme.ts';

// 底部五個分頁（依原型第五版）：記帳、明細、預算、月結、設定。
// 各分頁的畫面檔在本資料夾：index（記帳，票 07）、report（明細，票 09）、budget（預算，票 10）、
// close（月結精靈，票 11）、settings（設定）。其他票只換掉自己的畫面檔，不必改這裡。
const TABS = [
  { name: 'index', title: '記帳', glyph: '✎' },
  { name: 'report', title: '明細', glyph: '◔' },
  { name: 'budget', title: '預算', glyph: '▤' },
  { name: 'close', title: '月結', glyph: '✓' },
  { name: 'settings', title: '設定', glyph: '⚙' },
] as const;

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{tab.glyph}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
