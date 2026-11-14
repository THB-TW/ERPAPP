import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Ledger } from '../ledger/index.ts';
import { openMobileLedger } from '../platform/openMobileLedger.ts';
import { startNotificationSync } from '../platform/notificationSync.ts';
import { startAppSubscription } from '../platform/appSubscription.ts';
import { colors } from './theme.ts';

const LedgerContext = createContext<Ledger | null>(null);

/** 開啟帳本（含遷移與預設資料）後才渲染子畫面；畫面只拿得到 Ledger，碰不到資料庫。 */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    openMobileLedger().then(
      (opened) => {
        if (!cancelled) setLedger(opened);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '無法開啟帳本。');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // App 啟動就監聽 App Store 交易更新（票 22）；權益判斷不依賴帳本。
  useEffect(() => startAppSubscription(), []);

  useEffect(() => {
    if (ledger) return startNotificationSync(ledger);
  }, [ledger]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.expense, fontSize: 16 }}>{error}</Text>
      </View>
    );
  }
  if (!ledger) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <LedgerContext.Provider value={ledger}>{children}</LedgerContext.Provider>;
}

export function useLedger(): Ledger {
  const ledger = useContext(LedgerContext);
  if (!ledger) throw new Error('useLedger 必須在 LedgerProvider 內使用');
  return ledger;
}
