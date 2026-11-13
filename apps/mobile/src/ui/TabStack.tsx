import { Stack } from 'expo-router';
import { colors } from './theme.ts';

// 每個分頁各自一層原生堆疊，負責上方的導覽列（原生分頁列 expo-router/native-tabs 不畫標題）。
// 導覽列不透明、與畫面同為淺灰底。大標題不是原生的：由分頁畫面用 src/ui/LargeTitle.tsx 畫在捲動內容最上方，
// 捲過之後才在導覽列中央淡入小標題（原因寫在該檔）。所以這裡的 headerTitle 先留空，title 只給無障礙與返回鍵用。
export function TabStack({ title }: { title: string }) {
  return (
    <Stack
      screenOptions={{
        headerTransparent: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerTitle: () => null,
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: '返回',
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
