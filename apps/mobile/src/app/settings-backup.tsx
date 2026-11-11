// 設定 → 備份與還原（票 16）。由根堆疊推入的子頁面；設定分頁的入口等票 07 的分頁骨架合回後再接。
// 免費版與訂閱到期後都可用：這一頁不檢查付費權益。
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BackupStatus } from '../ledger/index.ts';
import { LedgerError } from '../ledger/index.ts';
import { discardBackupFile, newBackupPath, pickBackupFile, shareBackupFile } from '../platform/backupTransfer.ts';
import { BACKUP_REMINDER_DAYS, describeLastBackup, taipeiDateTime } from '../ui/backupText.ts';
import { userMessage } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

type Busy = 'export' | 'import' | 'undo' | null;

/** 用系統對話框問一個是非題；關掉對話框等於選「否」。 */
function ask(title: string, message: string, yes: string, no: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: no, style: 'cancel', onPress: () => resolve(false) },
        { text: yes, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const confirm = (title: string, message: string, confirmLabel: string) => ask(title, message, confirmLabel, '取消', true);

export default function BackupScreen() {
  const ledger = useLedger();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await ledger.getBackupStatus());
    } catch (e) {
      setError(userMessage(e, '讀取備份狀態失敗，請返回後再試一次。'));
    }
  }, [ledger]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (e) {
      setError(userMessage(e, fallback));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const exportBackup = () =>
    run('export', async () => {
      const { path, exportedAt } = await ledger.exportBackup(newBackupPath(new Date()));
      try {
        if (!(await shareBackupFile(path))) {
          setError('這台裝置無法開啟分享面板，備份檔沒有送出。');
          return;
        }
        // 分享面板被取消或真的存好了，系統回報都一樣，所以直接問；答「已存好」才記上次備份日期。
        const saved = await ask('備份檔存好了嗎？', '已存到「檔案」、iCloud Drive 或用 AirDrop 傳到別的裝置，才算備份完成。', '已存好', '沒有存');
        if (saved) {
          await ledger.recordBackupDelivered(exportedAt);
          setMessage('已記下這次備份。');
        } else {
          setMessage('這次沒有記成備份。需要時請再按一次「匯出備份檔」。');
        }
      } finally {
        await discardBackupFile(path); // App 內的暫放檔不留
      }
    }, '匯出備份檔失敗，請再試一次。');

  /** 驗證後整本取代；比目前的帳舊時多問一次。 */
  async function restoreFrom(path: string, describe: string) {
    const info = await ledger.inspectBackup(path);
    const when = info.lastModifiedAt ? `最後修改於 ${taipeiDateTime(info.lastModifiedAt)}` : '沒有修改時間紀錄';
    const ok = await confirm(
      '整本取代目前的帳？',
      `${describe}（${when}）會取代手機上全部的帳，不會合併。取代前會自動把目前的帳另存一份，選錯可以在這一頁復原。`,
      '取代',
    );
    if (!ok) return false;
    if (info.olderThanCurrent) {
      const sure = await confirm(
        '這份備份比手機上的帳舊',
        '匯入後，備份之後才記的帳都會消失（仍可用「復原到匯入前」找回）。確定要用較舊的備份取代嗎？',
        '仍要取代',
      );
      if (!sure) return false;
    }
    try {
      await ledger.restoreBackup(path, { allowOlder: info.olderThanCurrent });
    } catch (e) {
      // 兩次確認之間帳本又有變動，備份變成較舊的：請使用者重來一次，不默默蓋掉
      if (e instanceof LedgerError && e.code === 'backup_older') throw new LedgerError(e.code, '手機上的帳剛剛有變動，請再按一次匯入並重新確認。');
      throw e;
    }
    return true;
  }

  const importBackup = () =>
    run('import', async () => {
      const path = await pickBackupFile();
      if (path === null) return;
      try {
        if (await restoreFrom(path, '這份備份')) setMessage('已匯入備份，整本帳已取代。原本的帳已另存，可用下方「復原到匯入前」找回。');
      } finally {
        await discardBackupFile(path); // 選檔器複製進暫存區的複本
      }
    }, '匯入備份檔失敗，手機上的帳沒有被更動。');

  const undoRestore = () =>
    run('undo', async () => {
      const path = status?.safetyCopyPath;
      if (!path) return;
      if (await restoreFrom(path, '匯入前另存的帳')) setMessage('已復原到匯入前的帳。');
    }, '復原失敗，手機上的帳沒有被更動。');

  const last = status ? describeLastBackup(status.lastBackupAt, new Date()) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: '備份與還原', headerBackTitle: '返回' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>上次備份日期</Text>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{last ? last.text : '讀取中…'}</Text>
          {last?.overdue ? (
            <Text style={{ color: colors.expense, fontSize: 13 }}>
              {status?.lastBackupAt ? `已經超過 ${BACKUP_REMINDER_DAYS} 天沒有備份，建議現在匯出一份。` : '帳只存在這支手機上，建議現在匯出一份備份。'}
            </Text>
          ) : null}
        </View>

        <ActionButton label="匯出備份檔" working={busy === 'export'} disabled={busy !== null} onPress={exportBackup} primary />
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          把整本帳存成一個檔案，可存到「檔案」、iCloud Drive 或用 AirDrop 傳到別的裝置。備份檔沒有加密，請放在只有你拿得到的地方。
        </Text>

        <ActionButton label="匯入備份檔" working={busy === 'import'} disabled={busy !== null} onPress={importBackup} />
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          用備份檔整本取代手機上的帳（不合併）。取代前會自動把目前的帳另存一份。
        </Text>

        {status?.safetyCopyPath ? (
          <>
            <ActionButton label="復原到匯入前" working={busy === 'undo'} disabled={busy !== null} onPress={undoRestore} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>上次匯入備份前的帳還留著一份（只留最近一次）。</Text>
          </>
        ) : null}

        {message ? <Text style={{ color: colors.income, fontSize: 14 }}>{message}</Text> : null}
        {error ? <Text style={{ color: colors.expense, fontSize: 14 }}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton(props: { label: string; working: boolean; disabled: boolean; primary?: boolean; onPress: () => void }) {
  const { label, working, disabled, primary, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: working }}
      style={{
        backgroundColor: primary ? colors.accent : colors.surface,
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: disabled && !working ? 0.5 : 1,
      }}
    >
      {working ? (
        <ActivityIndicator color={primary ? '#fff' : colors.accent} />
      ) : (
        <Text style={{ color: primary ? '#fff' : colors.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      )}
    </Pressable>
  );
}
