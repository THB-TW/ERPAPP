// 原生能力只在這個轉接層使用；帳本服務仍只產生計畫。
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PlannedNotification } from '../ledger/index.ts';
import { managedNotificationIds, notificationIdsToCancel, notificationRequests } from './notificationSchedule.ts';

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

function permissionValue(settings: Notifications.NotificationPermissionsStatus): NotificationPermission {
  // iOS 的暫時／試用授權也能排本機通知，不能只看跨平台的 status。
  const status = settings.ios?.status;
  if (settings.granted || status === Notifications.IosAuthorizationStatus.AUTHORIZED
    || status === Notifications.IosAuthorizationStatus.PROVISIONAL
    || status === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'granted';
  if (settings.status === 'denied' || status === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
  return 'undetermined';
}

if (Platform.OS === 'ios') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
}

/** 首版只支援 iPhone 本機通知，不註冊遠端推播 token。 */
export const notificationPort: NotificationPort = {
  getPermission: async () => Platform.OS === 'ios'
    ? permissionValue(await Notifications.getPermissionsAsync()) : 'unsupported',
  requestPermission: async () => Platform.OS === 'ios'
    ? permissionValue(await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    })) : 'unsupported',
  async replacePending(plan) {
    const permission = await notificationPort.getPermission();
    if (permission === 'unsupported') return { permission, scheduled: 0 };
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const managed = managedNotificationIds(pending.map((request) => request.identifier));
    const requests = permission === 'granted'
      ? notificationRequests(plan, new Date(), pending.length - managed.length) : [];
    // 不使用 cancelAllScheduledNotificationsAsync，避免清掉其他用途的通知。
    // 同 identifier 由 iOS 更新；不先清掉仍有效的排程，減少中途失敗時漏提醒的範圍。
    for (const id of notificationIdsToCancel(pending.map((request) => request.identifier), requests)) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
    for (const request of requests) {
      await Notifications.scheduleNotificationAsync({
        identifier: request.identifier,
        content: request.content,
        trigger: request.date === null ? null
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: request.date },
      });
    }
    return { permission, scheduled: requests.length };
  },
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
