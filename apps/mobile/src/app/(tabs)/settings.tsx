import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Placeholder } from '../../ui/Placeholder.tsx';
import { colors } from '../../ui/theme.ts';

// 佔位畫面：由票 14、15、16 等換掉整個檔案。
export default function Screen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable onPress={() => router.push('/accounts')} accessibilityRole="button" style={{ padding: 16 }}>
        <Text style={{ color: colors.accent, fontSize: 17 }}>帳戶管理與餘額 ›</Text>
      </Pressable>
      <Placeholder title="設定" ticket="票 14、15、16 等" />
    </View>
  );
}
