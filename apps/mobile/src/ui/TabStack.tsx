import { Stack } from 'expo-router';
import { colors, grouped } from './theme.ts';

// 每個分頁各自一層原生堆疊，才有 iOS 原生導覽列（含捲動收合的大標題）。
// 換成原生分頁列（expo-router/native-tabs）後，分頁本身不再畫標題，標題改由這一層負責。
// large：用 iOS 大標題（目前只有預算頁試做）；其餘分頁維持原本的一般標題外觀。
export function TabStack({ title, large = false }: { title: string; large?: boolean }) {
  return (
    <Stack
      screenOptions={{
        // 與根堆疊一致：導覽列不透明，內容不跑到列底下。
        headerTransparent: false,
        headerShadowVisible: !large,
        headerLargeTitleEnabled: large,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: large ? grouped.background : colors.background },
        headerLargeStyle: { backgroundColor: grouped.background },
        headerBackTitle: '返回',
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
