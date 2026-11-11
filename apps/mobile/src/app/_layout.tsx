import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LedgerProvider } from '../ui/LedgerProvider.tsx';

// 根導覽：底部分頁（(tabs)/）之上疊一層堆疊。從分頁點進去的畫面（記帳表單、之後各票的子頁面）
// 放在 src/app/ 底下、由這個堆疊推入，返回後回到原本的分頁。
export default function RootLayout() {
  return (
    <LedgerProvider>
      <StatusBar style="auto" />
      {/* iOS 26 起原生導覽列預設半透明、內容會跑到列底下；統一改回不透明，各頁不必自己避開。
          返回鍵一律寫「返回」，否則從分頁推入的畫面會顯示路由群組名稱「(tabs)」。 */}
      <Stack screenOptions={{ headerTransparent: false, headerBackTitle: '返回' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="entry" options={{ title: '新增交易', headerBackTitle: '返回' }} />
      </Stack>
    </LedgerProvider>
  );
}
