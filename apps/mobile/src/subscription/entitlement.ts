// 訂閱權益的純規則（票 22）。不碰 StoreKit、不碰資料庫：輸入是「上次向 App Store 確認到的權益紀錄」，
// 輸出是畫面要用的狀態。帳本服務只吃 hasEntitlement 布林值，權益本身不進帳本（規格「權益不進帳本服務」）。

/** App Store Connect 的商品代號；月費與年費在同一個訂閱群組，兩者都掛 3 個月免費試用。 */
export const PRODUCT_IDS = { monthly: 'premium_monthly', yearly: 'premium_yearly' } as const;
export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];
export const SUBSCRIPTION_GROUP = 'premium';

export function isKnownProduct(id: string): id is ProductId {
  return id === PRODUCT_IDS.monthly || id === PRODUCT_IDS.yearly;
}

/** StoreKit 回報的一筆有效訂閱交易（Transaction.currentEntitlements 的一列，已由轉接層換成純資料）。 */
export interface StoreEntitlement {
  productId: string;
  /** 目前期間結束時間（ISO 8601）。 */
  expiresAt: string;
  /** 試用中（introductory offer, free trial）。 */
  isTrial: boolean;
  /** 帳單寬限期結束時間；不在寬限期為 null。寬限期間不得降級（Schedule 2 §3.8(c)）。 */
  graceUntil: string | null;
  /** 退款或撤銷時間；有值代表這筆權益已失效。 */
  revokedAt: string | null;
  /** RenewalInfo.willAutoRenew：使用者是否還開著自動續訂（設定頁說明要準確）。 */
  willAutoRenew: boolean;
}

/**
 * 存在手機上的「上次確認的權益」。離線時用它判斷（規格：離線用上次確認的到期時間）。
 * 只存在訂閱模組自己的小儲存區，不進帳本、不進備份檔：還原別人的備份不會帶來權益。
 */
export interface EntitlementRecord {
  productId: ProductId;
  /** 權益有效到這個時間（已含寬限期；被撤銷時是撤銷時間）。 */
  activeUntil: string;
  isTrial: boolean;
  inGrace: boolean;
  willAutoRenew: boolean;
  /** 最後一次成功向 App Store 確認的時間。 */
  confirmedAt: string;
}

export type SubscriptionStatus =
  /** 從沒訂閱過（或這台手機查不到紀錄）：碰付費功能時顯示付費牆。 */
  | { kind: 'never' }
  | { kind: 'active'; productId: ProductId; isTrial: boolean; inGrace: boolean; willAutoRenew: boolean; activeUntil: string }
  /** 訂閱到期：付費內容唯讀，碰付費寫入顯示重新訂閱。 */
  | { kind: 'expired'; productId: ProductId; endedAt: string }
  /** 建置時關掉內購的開發版（免費 Apple ID 自簽）。不綁任何 Apple ID，也無法上架散布。 */
  | { kind: 'dev_unlocked' };

/** 付費功能（規格「訂閱與權益」的付費清單）。 */
export type PaidFeature =
  | 'monthly_close' | 'reserves' | 'adjustments' | 'loans' | 'investment' | 'budget_export' | 'paid_reminders';

export const PAID_FEATURE_LABELS: Record<PaidFeature, string> = {
  monthly_close: '月結精靈',
  reserves: '儲備累積與可用餘額',
  adjustments: '挪用與調整',
  loans: '貸款／分期',
  investment: '投資',
  budget_export: '預算資料匯出',
  paid_reminders: '月結、信用卡帳單與貸款提醒',
};

function later(a: string, b: string | null): string {
  if (b === null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** 從 App Store 的有效交易挑出權益最長的一筆；沒有本 App 的商品就回 null。 */
export function recordFromStore(rows: readonly StoreEntitlement[], now: Date): EntitlementRecord | null {
  let best: EntitlementRecord | null = null;
  for (const row of rows) {
    if (!isKnownProduct(row.productId)) continue;
    const activeUntil = row.revokedAt ?? later(row.expiresAt, row.graceUntil);
    const inGrace = row.revokedAt === null && row.graceUntil !== null && Date.parse(row.expiresAt) <= now.getTime();
    const candidate: EntitlementRecord = {
      productId: row.productId, activeUntil, isTrial: row.isTrial, inGrace,
      willAutoRenew: row.revokedAt === null && row.willAutoRenew, confirmedAt: now.toISOString(),
    };
    if (!best || Date.parse(candidate.activeUntil) > Date.parse(best.activeUntil)) best = candidate;
  }
  return best;
}

/**
 * 向 App Store 查詢成功後要存的新紀錄。
 * - 查到有效權益：用它。
 * - 查詢成功但沒有有效權益：以前訂過就記成「到期」（若還沒到期代表被退款／撤銷，到期時間改為現在）；沒訂過維持 null。
 */
export function reconcileRecord(
  previous: EntitlementRecord | null, rows: readonly StoreEntitlement[], now: Date,
): EntitlementRecord | null {
  const current = recordFromStore(rows, now);
  if (current) return current;
  if (!previous) return null;
  const ended = Date.parse(previous.activeUntil) > now.getTime() ? now.toISOString() : previous.activeUntil;
  return { ...previous, activeUntil: ended, inGrace: false, willAutoRenew: false, confirmedAt: now.toISOString() };
}

/** 依上次確認的紀錄判斷現在的狀態；App 不自己計試用時間，到期時間全部來自 App Store。 */
export function evaluateStatus(record: EntitlementRecord | null, now: Date, options: { devUnlocked?: boolean } = {}): SubscriptionStatus {
  if (options.devUnlocked === true) return { kind: 'dev_unlocked' };
  if (!record) return { kind: 'never' };
  // 時鐘被調回上次確認之前：以上次確認時間為準，避免把手機時間往回調就延長離線權益。
  const effectiveNow = Math.max(now.getTime(), Date.parse(record.confirmedAt));
  if (Date.parse(record.activeUntil) > effectiveNow) {
    return { kind: 'active', productId: record.productId, isTrial: record.isTrial, inGrace: record.inGrace, willAutoRenew: record.willAutoRenew, activeUntil: record.activeUntil };
  }
  return { kind: 'expired', productId: record.productId, endedAt: record.activeUntil };
}

/** 付費功能可不可以寫入；帳本服務指令的 hasEntitlement 一律從這裡來。 */
export function hasPaidAccess(status: SubscriptionStatus): boolean {
  return status.kind === 'active' || status.kind === 'dev_unlocked';
}

/**
 * 使用者按了某個付費功能時畫面該怎麼做：
 * - allow：直接進行。
 * - paywall：第一次碰付費功能，顯示付費牆（試用由 Apple 在使用者按下訂閱後起算）。
 * - resubscribe：訂閱已到期，付費內容唯讀，顯示重新訂閱的付費牆。
 */
export function gateAction(status: SubscriptionStatus): 'allow' | 'paywall' | 'resubscribe' {
  if (hasPaidAccess(status)) return 'allow';
  return status.kind === 'expired' ? 'resubscribe' : 'paywall';
}

/** 寫入紀錄用的檢查：壞掉或被竄改的資料一律當作沒有紀錄。 */
export function parseRecord(text: string | null): EntitlementRecord | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<EntitlementRecord>;
    if (typeof value.productId !== 'string' || !isKnownProduct(value.productId)) return null;
    if (typeof value.activeUntil !== 'string' || Number.isNaN(Date.parse(value.activeUntil))) return null;
    if (typeof value.confirmedAt !== 'string' || Number.isNaN(Date.parse(value.confirmedAt))) return null;
    return {
      productId: value.productId, activeUntil: value.activeUntil, confirmedAt: value.confirmedAt,
      isTrial: value.isTrial === true, inGrace: value.inGrace === true, willAutoRenew: value.willAutoRenew === true,
    };
  } catch {
    return null;
  }
}
