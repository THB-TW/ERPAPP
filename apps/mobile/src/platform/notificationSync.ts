// 所有自動重排共用這條序列；畫面只需在帳務成功後呼叫，不自行判斷通知規則。
import { AppState } from 'react-native';
import type { Ledger } from '../ledger/index.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { appSubscription } from './appSubscription.ts';
import { applyNotificationPlan, type NotificationScheduleResult } from './notificationPort.ts';
import { managedNotificationId, notificationPlanThrough, notificationRequests } from './notificationSchedule.ts';

let tail: Promise<unknown> = Promise.resolve();

/** 只有明確儲存提醒設定才傳 requestPermission；其他路徑預設不跳權限對話框。 */
export function syncNotifications(
  ledger: Ledger, options: { requestPermission?: boolean } = {},
): Promise<NotificationScheduleResult> {
  const run = tail.then(async () => {
    const now = new Date();
    const plan = await ledger.getNotificationPlan({
      now, through: notificationPlanThrough(now), hasEntitlement: hasMonthlyCloseEntitlement(),
    });
    const result = await applyNotificationPlan(plan, { requestPermission: options.requestPermission === true });
    // Port 以時間／id 排序、容量不足時保留最近項目；只記原生層已接受的部分。
    const accepted = new Set(notificationRequests(plan, now).slice(0, result.scheduled).map((row) => row.identifier));
    await ledger.recordNotificationDispatches(plan.filter((row) => accepted.has(managedNotificationId(row.id))));
    return result;
  });
  // 一次原生失敗不能讓後面的同步永遠失效；明確儲存的呼叫仍收到原錯誤以顯示重試。
  tail = run.catch(() => undefined);
  return run;
}

/** 掛在既有 LedgerProvider，啟動及回前景都重新查詢，卸載時移除監聽。 */
export function startNotificationSync(ledger: Ledger): () => void {
  const refresh = () => { void syncNotifications(ledger).catch(() => {}); };
  refresh();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  // 權益變動（購買、到期、退款）時重排：到期就取消月結、帳單與貸款提醒（票 22）。
  const stopEntitlement = appSubscription.subscribe(refresh);
  return () => { subscription.remove(); stopEntitlement(); };
}
