import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** 觸感只是操作回饋；裝置不支援或原生呼叫失敗都不影響原本操作。 */
function play(effect: () => Promise<void>): void {
  if (Platform.OS !== 'ios') return;
  try {
    void effect().catch(() => {});
  } catch {
    // 也涵蓋原生模組在回傳 Promise 前就失敗的情況。
  }
}

export function selection(): void {
  play(() => Haptics.selectionAsync());
}

export function success(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function warning(): void {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
