// 原生通知的替換邊界；加入 expo-notifications 後只替換 notificationPort 的實作。
import type { PlannedNotification } from '../ledger/index.ts';

export type NotificationPermission = 'undetermined' | 'granted' | 'denied' | 'unsupported';

export interface NotificationScheduleResult {
  permission: NotificationPermission;
  scheduled: number;
}

export interface NotificationPort {
  /** 純讀取，不可跳系統權限對話框。 */
  getPermission(): Promise<NotificationPermission>;
  /** 只在使用者明確要求啟用／套用時呼叫。拒絕或尚未支援都是正常結果。 */
  requestPermission(): Promise<NotificationPermission>;
  /**
   * 全量取代本 App 管理的待排通知；依穩定 id 去重，不可碰其他用途的通知。
   * 空清單代表取消這些通知，即使權限被拒絕仍須嘗試清除舊排程。
   */
  replacePending(notifications: readonly PlannedNotification[]): Promise<NotificationScheduleResult>;
}

/** 本分支沒有 expo-notifications，保留設定與查詢功能，不宣稱已排程。 */
export const notificationPort: NotificationPort = {
  getPermission: async () => 'unsupported',
  requestPermission: async () => 'unsupported',
  replacePending: async () => ({ permission: 'unsupported', scheduled: 0 }),
};

/**
 * 每次套用都取代完整清單，關閉提醒或失去權益時不會殘留舊通知。
 * 沒有待排項目時不要求權限；畫面掛載與預覽也不呼叫這個函式。
 */
export async function applyNotificationPlan(
  notifications: readonly PlannedNotification[],
  options: { requestPermission: boolean },
  port: NotificationPort = notificationPort,
): Promise<NotificationScheduleResult> {
  let permission = await port.getPermission();
  if (notifications.length > 0 && permission === 'undetermined' && options.requestPermission) {
    permission = await port.requestPermission();
  }
  if (permission !== 'granted') {
    await port.replacePending([]);
    return { permission, scheduled: 0 };
  }
  return port.replacePending(notifications);
}
