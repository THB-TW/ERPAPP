import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors } from '../../ui/theme.ts';

// 設定分頁：各票在 ROWS 加一列，指到自己放在 src/app/ 底下的子頁面（由根堆疊推入）。
const ROWS: { title: string; hint: string; href: Href }[] = [
  { title: '預算與分類', hint: '修改預算上限、預算組與交易分類歸屬', href: '/budget-settings' }, // 票 10
  { title: '帳戶管理與餘額', hint: '新增、改名、停用帳戶，開帳餘額與目前餘額', href: '/accounts' }, // 票 08
  { title: '貸款／分期', hint: '每月提撥、累積儲備與剩餘本金', href: '/loans' }, // 票 19
  { title: '備份與還原', hint: '匯出備份檔、匯入備份檔、上次備份日期', href: '/settings-backup' }, // 票 16
];

export default function SettingsScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      {ROWS.map((row) => (
        <Pressable
          key={row.title}
          onPress={() => router.push(row.href)}
          accessibilityRole="button"
          style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 16 }}>{row.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{row.hint}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
