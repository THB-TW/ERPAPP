import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LedgerProvider } from '../ui/LedgerProvider.tsx';

export default function RootLayout() {
  return (
    <LedgerProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: '記帳' }} />
        <Stack.Screen name="entry" options={{ title: '新增帳目', headerBackTitle: '返回' }} />
      </Stack>
    </LedgerProvider>
  );
}
