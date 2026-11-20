// 訂閱服務：把購買介面、上次確認的權益紀錄與時鐘組起來，畫面只拿 getStatus() 與 subscribe()。
// 不依賴 React Native，可在 Node 測試裡用假的 StorePort 與記憶體儲存跑完整流程。
import {
  evaluateStatus, hasPaidAccess, parseRecord, reconcileRecord, type EntitlementRecord, type ProductId, type SubscriptionStatus,
} from './entitlement.ts';
import type { PurchaseOutcome, StoreOffer, StorePort } from './storePort.ts';

/** 權益紀錄的同步小儲存區（App 用 expo-sqlite/kv-store 的獨立資料庫，不在帳本與備份檔內）。 */
export interface RecordStorage {
  read(): string | null;
  write(value: string | null): void;
}

export interface SubscriptionService {
  getStatus(): SubscriptionStatus;
  subscribe(listener: () => void): () => void;
  /** App 啟動時呼叫：開始監聽交易更新並查一次；回傳停止監聽。 */
  start(): () => void;
  /** 向 App Store 重新確認；查不到（離線、沒有內購）就沿用上次確認的紀錄，回 false。 */
  refresh(): Promise<boolean>;
  loadOffer(): Promise<StoreOffer>;
  purchase(productId: ProductId): Promise<PurchaseOutcome>;
  restore(): Promise<void>;
  readonly storeAvailable: boolean;
}

export interface SubscriptionServiceOptions {
  store: StorePort;
  storage: RecordStorage;
  now?: () => Date;
  /** 關掉內購的開發版付費功能全開（翰陞決定前的建議做法；見 docs/subscription.md）。 */
  devUnlocked?: boolean;
}

function sameStatus(a: SubscriptionStatus, b: SubscriptionStatus): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createSubscriptionService(options: SubscriptionServiceOptions): SubscriptionService {
  const now = options.now ?? (() => new Date());
  const devUnlocked = options.devUnlocked === true;
  const listeners = new Set<() => void>();
  let record: EntitlementRecord | null = parseRecord(options.storage.read());
  let status = evaluateStatus(record, now(), { devUnlocked });
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emitIfChanged() {
    const next = evaluateStatus(record, now(), { devUnlocked });
    if (sameStatus(next, status)) return;
    status = next;
    for (const listener of [...listeners]) listener();
  }

  /** 讀取時重新判斷：手機休眠時計時器不會跑，回前景後第一次讀就要降級。通知延到下一個 microtask，避免在畫面渲染中觸發更新。 */
  function currentStatus(): SubscriptionStatus {
    const next = evaluateStatus(record, now(), { devUnlocked });
    if (!sameStatus(next, status)) {
      status = next;
      queueMicrotask(() => { for (const listener of [...listeners]) listener(); });
    }
    return status;
  }

  /** 有效權益到期那一刻自動轉成到期狀態（App 一直開著也會降級、取消付費提醒）。 */
  function scheduleExpiry() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!record || devUnlocked) return;
    const wait = Date.parse(record.activeUntil) - now().getTime();
    if (wait <= 0) return;
    // setTimeout 上限約 24.8 天；更久就分段再排。
    timer = setTimeout(() => { emitIfChanged(); scheduleExpiry(); }, Math.min(wait + 1000, 2_000_000_000));
    (timer as { unref?: () => void }).unref?.();
  }

  function save(next: EntitlementRecord | null) {
    record = next;
    options.storage.write(next ? JSON.stringify(next) : null);
    emitIfChanged();
    scheduleExpiry();
  }

  async function refresh(): Promise<boolean> {
    if (!options.store.available) { emitIfChanged(); return false; }
    try {
      let rows = await options.store.currentEntitlements();
      // 本來有效卻查到空的：再確認一次才降級，避免同步中的暫時空結果把付費使用者誤鎖。
      if (rows.length === 0 && hasPaidAccess(evaluateStatus(record, now()))) rows = await options.store.currentEntitlements();
      save(reconcileRecord(record, rows, now()));
      return true;
    } catch {
      emitIfChanged();
      return false;
    }
  }

  return {
    storeAvailable: options.store.available,
    getStatus: currentStatus,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start() {
      scheduleExpiry();
      const stop = options.store.onUpdate(() => { void refresh(); });
      void refresh();
      return () => { stop(); if (timer) { clearTimeout(timer); timer = null; } };
    },
    refresh,
    loadOffer: () => options.store.loadOffer(),
    async purchase(productId) {
      const outcome = await options.store.purchase(productId);
      if (outcome === 'purchased') await refresh();
      return outcome;
    },
    async restore() {
      await options.store.restore();
      await refresh();
    },
  };
}
