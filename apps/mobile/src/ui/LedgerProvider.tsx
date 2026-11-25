import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Ledger } from '../ledger/index.ts';
import type { LedgerEntry, LedgerLibrary } from '../ledger/library.ts';
import { openMobileLibrary } from '../platform/openMobileLedger.ts';
import { setNotificationGlobals, startNotificationSync } from '../platform/notificationSync.ts';
import { startAppSubscription } from '../platform/appSubscription.ts';
import { colors } from './theme.ts';

const LedgerContext = createContext<Ledger | null>(null);

export interface LibraryContextValue {
  library: LedgerLibrary;
  ledgers: LedgerEntry[];
  currentId: number;
  currentName: string;
  /** 切換帳本：整個畫面樹以新帳本重新開始（回到記帳首頁），通知依新帳本重排。 */
  switchLedger(id: number): Promise<void>;
  /** 新增、改名、排序、刪除或匯入備份之後呼叫，重新讀清單（刪掉或匯入時目前帳本可能換了）。 */
  refresh(): Promise<void>;
}
const LibraryContext = createContext<LibraryContextValue | null>(null);

/**
 * 開啟帳本清單與目前帳本（含遷移與預設資料）後才渲染子畫面；畫面只拿得到 Ledger 與帳本清單，碰不到資料庫。
 * 子畫面以「目前帳本＋版本」為 key：切換或匯入後整棵樹重建，不會殘留上一本的狀態。
 */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<LedgerLibrary | null>(null);
  const [ledgers, setLedgers] = useState<LedgerEntry[]>([]);
  const [current, setCurrent] = useState<{ id: number; ledger: Ledger; generation: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    openMobileLibrary().then(
      async (opened) => {
        const list = await opened.listLedgers();
        if (cancelled) return;
        setNotificationGlobals(() => opened.getNotificationGlobals());
        setLibrary(opened);
        setLedgers(list);
        setCurrent({ id: opened.currentLedgerId(), ledger: opened.current(), generation: 0 });
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '無法開啟帳本。');
      },
    );
    return () => {
      cancelled = true;
      setNotificationGlobals(null);
    };
  }, []);

  // App 啟動就監聽 App Store 交易更新（票 22）；權益判斷不依賴帳本。
  useEffect(() => startAppSubscription(), []);

  const ledger = current?.ledger ?? null;
  useEffect(() => {
    if (ledger) return startNotificationSync(ledger);
  }, [ledger]);

  const refresh = useCallback(async () => {
    if (!library) return;
    const list = await library.listLedgers();
    setLedgers(list);
    const id = library.currentLedgerId();
    const next = library.current();
    setCurrent((prev) => (prev && prev.id === id && prev.ledger === next ? prev : { id, ledger: next, generation: (prev?.generation ?? 0) + 1 }));
  }, [library]);

  const switchLedger = useCallback(async (id: number) => {
    if (!library) return;
    await library.switchLedger(id);
    await refresh();
  }, [library, refresh]);

  const value = useMemo<LibraryContextValue | null>(() => library && current ? {
    library, ledgers, currentId: current.id, switchLedger, refresh,
    currentName: ledgers.find((l) => l.id === current.id)?.name ?? '',
  } : null, [library, ledgers, current, switchLedger, refresh]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.expense, fontSize: 16 }}>{error}</Text>
      </View>
    );
  }
  if (!current || !value) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <LibraryContext.Provider value={value}>
      <LedgerContext.Provider key={`${current.id}-${current.generation}`} value={current.ledger}>{children}</LedgerContext.Provider>
    </LibraryContext.Provider>
  );
}

export function useLedger(): Ledger {
  const ledger = useContext(LedgerContext);
  if (!ledger) throw new Error('useLedger 必須在 LedgerProvider 內使用');
  return ledger;
}

export function useLedgerLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('useLedgerLibrary 必須在 LedgerProvider 內使用');
  return value;
}

/** 目前帳本名稱；在 LedgerProvider 外（或尚未開好）為 null。給各分頁大標題顯示用。 */
export function useCurrentLedgerName(): string | null {
  return useContext(LibraryContext)?.currentName ?? null;
}
