// 不依賴原生模組的排程轉換，讓時間、容量與識別碼規則可直接測試。
import type { PlannedNotification } from '../ledger/index.ts';

const PREFIX = 'erpapp:ledger-reminder:';
const IOS_PENDING_LIMIT = 64;

/** 備份完成後就排入 35 天提醒，避免只查 30 天而要求使用者中途再開 App。 */
export function notificationPlanThrough(now: Date): Date {
  return new Date(now.getTime() + 36 * 86_400_000);
}

export function managedNotificationId(id: string): string {
  if (!id) throw new Error('通知識別碼不可空白。');
  return `${PREFIX}${id}`;
}

/** 只取消這個模組管理的排程，不碰其他用途。 */
export function managedNotificationIds(identifiers: readonly string[]): string[] {
  return [...new Set(identifiers.filter((id) => id.startsWith(PREFIX) && id.length > PREFIX.length))];
}

export interface NotificationRequest {
  identifier: string;
  date: Date | null;
  content: { title: string; body: string; sound: 'default' };
}

export function notificationIdsToCancel(pendingIds: readonly string[], requests: readonly NotificationRequest[]): string[] {
  const desired = new Set(requests.map((request) => request.identifier));
  return managedNotificationIds(pendingIds).filter((id) => !desired.has(id));
}

/** iOS 待排上限包含其他用途；依最近的時間優先，剩餘項目在下次回前景時補排。 */
export function notificationRequests(
  plan: readonly PlannedNotification[], now: Date, unmanagedCount = 0,
): NotificationRequest[] {
  if (!Number.isFinite(now.getTime())) throw new Error('通知排程時間不正確。');
  const unique = new Map<string, PlannedNotification>();
  for (const notification of plan) {
    managedNotificationId(notification.id);
    if (!Number.isFinite(new Date(notification.fireAt).getTime())) throw new Error('通知觸發時間不正確。');
    if (!unique.has(notification.id)) unique.set(notification.id, notification);
  }
  return [...unique.values()]
    .sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime() || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, IOS_PENDING_LIMIT - unmanagedCount))
    .map((notification) => ({
      identifier: managedNotificationId(notification.id),
      // null 是立即通知；避免傳過去日期，也不留一秒延遲讓下一次同步提前取消它。
      date: new Date(notification.fireAt) <= now ? null : new Date(notification.fireAt),
      content: { title: notification.title, body: notification.body, sound: 'default' },
    }));
}
