import { Stack } from 'expo-router';
import { colors } from './theme.ts';

// 每個分頁各自一層原生堆疊，才有 iOS 原生導覽列（含捲動收合的大標題）。
// 原生分頁列（expo-router/native-tabs）不畫標題，標題由這一層負責。
// 大標題要能收合，分頁畫面最外層必須直接是 ScrollView，且設 contentInsetAdjustmentBehavior="automatic"。
export function TabStack({ title }: { title: string }) {
  return (
    <Stack
      screenOptions={{
        // 與根堆疊一致：導覽列不透明，內容不跑到列底下。
        headerTransparent: false,
        headerShadowVisible: false,
        headerLargeTitleEnabled: true,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerLargeStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerLargeTitleStyle: { color: colors.text },
        headerTintColor: colors.accent,
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: '返回',
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
