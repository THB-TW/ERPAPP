import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LedgerProvider } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

// 根導覽：底部分頁（(tabs)/）之上疊一層堆疊。從分頁點進去的畫面（記帳表單、之後各票的子頁面）
// 放在 src/app/ 底下、由這個堆疊推入，返回後回到原本的分頁。
export default function RootLayout() {
  return (
    <LedgerProvider>
      <StatusBar style="dark" />
      {/* iOS 26 起原生導覽列預設半透明、內容會跑到列底下；統一改回不透明，各頁不必自己避開。
          導覽列與畫面同為淺灰底、不畫底線，和分頁的大標題列一致。
          返回鍵一律寫「返回」，否則從分頁推入的畫面會顯示路由群組名稱「(tabs)」。 */}
      <Stack
        screenOptions={{
          headerTransparent: false,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.accent,
          contentStyle: { backgroundColor: colors.background },
          headerBackTitle: '返回',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* 記帳與轉帳表單從下方滑出（iOS 面板），往下拉或按左上角「取消」關閉；標題由畫面自己依新增／修改設定。 */}
        <Stack.Screen name="entry" options={{ title: '新增交易', presentation: 'modal' }} />
        <Stack.Screen name="transfer" options={{ title: '新增轉帳', presentation: 'modal' }} />
      </Stack>
    </LedgerProvider>
  );
}
