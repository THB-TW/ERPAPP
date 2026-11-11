// 購買介面的邊界（票 22）。畫面與訂閱服務只認這個介面；真正的 StoreKit 2 轉接層等有付費開發者帳號、
// 並經翰陞同意加入內購套件後再補上（見 docs/subscription.md）。在那之前 App 用 unavailableStore。
import type { ProductId, StoreEntitlement } from './entitlement.ts';

export interface StoreProduct {
  id: ProductId;
  period: 'month' | 'year';
  /** App Store 依店面回傳的價格字串（例如「NT$90」）。付費牆不得寫死金額。 */
  displayPrice: string;
}

export interface StoreOffer {
  products: StoreProduct[];
  /** StoreKit isEligibleForIntroOffer（群組層級）：決定付費牆用版本 A（有試用）或 B。 */
  trialEligible: boolean;
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending';

export interface StorePort {
  /** false 代表這個版本沒有內購（未接轉接層，或免費 Apple ID 自簽建置）。 */
  readonly available: boolean;
  loadOffer(): Promise<StoreOffer>;
  /**
   * 目前有效（含試用、寬限期）的訂閱。轉接層的約定：
   * - 以 Transaction.currentEntitlements 取有效交易，只收 VerificationResult 驗證過的；家人共享（familyShared）略過。
   * - graceUntil 由 Product.SubscriptionInfo.status 的 renewalInfo.gracePeriodExpirationDate 組出；willAutoRenew 取 renewalInfo。
   * - isTrial：offerType 為 introductory 且 paymentMode 為 freeTrial。
   * - 只有 StoreKit 確定沒有有效權益時才回空陣列；查不到、未驗證、同步中一律丟錯（訂閱服務會沿用上次紀錄）。
   */
  currentEntitlements(): Promise<StoreEntitlement[]>;
  purchase(productId: ProductId): Promise<PurchaseOutcome>;
  /** 還原購買（AppStore.sync）。 */
  restore(): Promise<void>;
  /** Transaction.updates：App 啟動就監聽；在別處續訂、退款、到期時通知。回傳取消監聽。 */
  onUpdate(listener: () => void): () => void;
}

export class StoreUnavailableError extends Error {
  constructor() {
    super('這個版本沒有接上 App Store 內購，無法訂閱或還原購買。');
    this.name = 'StoreUnavailableError';
  }
}

/** 沒有內購的版本：查詢回空、購買與還原丟錯，畫面據此顯示說明而不是當機。 */
export const unavailableStore: StorePort = {
  available: false,
  loadOffer: async () => { throw new StoreUnavailableError(); },
  currentEntitlements: async () => { throw new StoreUnavailableError(); },
  purchase: async () => { throw new StoreUnavailableError(); },
  restore: async () => { throw new StoreUnavailableError(); },
  onUpdate: () => () => {},
};

/** Apple 的訂閱管理頁；使用者在這裡自行取消。 */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
