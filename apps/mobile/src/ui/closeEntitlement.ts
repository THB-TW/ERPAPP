// 所有畫面從這裡取得同一個權益判斷（票 22 接上訂閱服務）；帳本指令的 hasEntitlement 一律用它。
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { appSubscription } from '../platform/appSubscription.ts';
import { gateAction, hasPaidAccess, type PaidFeature, type SubscriptionStatus } from '../subscription/entitlement.ts';

export function hasMonthlyCloseEntitlement(): boolean {
  return hasPaidAccess(appSubscription.getStatus());
}

export function useSubscriptionStatus(): SubscriptionStatus {
  return useSyncExternalStore(appSubscription.subscribe, appSubscription.getStatus);
}

/**
 * 使用者按了付費功能：有權益回 true；沒有就推入付費牆（第一次碰付費功能才出現，到期則顯示重新訂閱）並回 false。
 * 試用由 Apple 在使用者按下訂閱後起算，App 不自己計時。
 */
export function requirePaidFeature(feature: PaidFeature): boolean {
  if (gateAction(appSubscription.getStatus()) === 'allow') return true;
  router.push({ pathname: '/paywall', params: { feature } });
  return false;
}

/** 畫面用：權益變動（購買、到期、退款）時自動重新渲染。 */
export function useHasPaidAccess(): boolean {
  return hasPaidAccess(useSubscriptionStatus());
}
