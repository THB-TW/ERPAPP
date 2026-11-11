import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LedgerProvider } from '../ui/LedgerProvider.tsx';

// 根導覽：底部分頁（(tabs)/）之上疊一層堆疊。從分頁點進去的畫面（記帳表單、之後各票的子頁面）
// 放在 src/app/ 底下、由這個堆疊推入，返回後回到原本的分頁。
export default function RootLayout() {
  return (
    <LedgerProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="entry" options={{ title: '新增帳目', headerBackTitle: '返回' }} />
      </Stack>
    </LedgerProvider>
  );
}
