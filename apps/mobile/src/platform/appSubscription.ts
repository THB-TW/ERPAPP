// 手機端的訂閱接線：購買介面 × 權益紀錄儲存區 × 訂閱服務，整個 App 共用一個實例。
// 權益紀錄放在 expo-sqlite/kv-store 的獨立資料庫（不是 ledger.db），所以不會進匯出的備份檔；
// 還原別人的備份不會帶來權益。
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';
import { createSubscriptionService, type SubscriptionService } from '../subscription/subscriptionService.ts';
import { unavailableStore, type StorePort } from '../subscription/storePort.ts';

const RECORD_KEY = 'subscription.entitlement.v1';

/**
 * 建置開關：EXPO_PUBLIC_IAP=off 時不接內購（免費 Apple ID 自簽的 iPhone 版本不能帶內購能力），並開放進階功能，
 * 畫面標示「開發版・未接內購」。必須明確設定才會開放：沒設定而內購又不可用時（例如還沒有轉接層、原生模組載入失敗），
 * 一律當作免費版鎖住，不會誤把進階功能送給所有人。正式建置不得設定這個值（tools 測試會檢查 eas.json）。
 * 目前還沒有 StoreKit 轉接層（要加內購套件，需翰陞同意）。
 */
const IAP_DISABLED_BY_BUILD = process.env.EXPO_PUBLIC_IAP === 'off';
const storeKitAdapter: StorePort | null = null;

const store: StorePort = !IAP_DISABLED_BY_BUILD && storeKitAdapter ? storeKitAdapter : unavailableStore;

export const appSubscription: SubscriptionService = createSubscriptionService({
  store,
  storage: {
    read: () => Storage.getItemSync(RECORD_KEY),
    write: (value) => { if (value === null) Storage.removeItemSync(RECORD_KEY); else Storage.setItemSync(RECORD_KEY, value); },
  },
  devUnlocked: IAP_DISABLED_BY_BUILD,
});

/** App 啟動時呼叫：監聽交易更新，回前景時再向 App Store 確認一次（休眠期間到期或退款會在這時降級）。 */
export function startAppSubscription(): () => void {
  const stop = appSubscription.start();
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') void appSubscription.refresh();
  });
  return () => { stop(); foreground.remove(); };
}
