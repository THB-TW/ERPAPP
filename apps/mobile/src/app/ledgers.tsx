// 帳本（ADR 0008，2026-11-25 翰陞定案）：切換、新增、改名、排序、刪除。
// 從記帳頁大標旁的帳本名稱或「設定 → 帳本」進來。每本帳完全獨立；新帳本建立後直接切過去並走開帳流程。
// 第一本免費，第二本起屬進階；訂閱總開關關著時不鎖（上架前交 marketing-pricing 審）。
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_LEDGERS, type LedgerEntry } from '../ledger/library.ts';
import { SUBSCRIPTION_ENABLED } from '../subscription/featureFlag.ts';
import { useHasPaidAccess } from '../ui/closeEntitlement.ts';
import { userMessage } from '../ui/format.ts';
import { Footnote, Group, PrimaryButton, kit, text } from '../ui/kit.tsx';
import { useLedgerLibrary } from '../ui/LedgerProvider.tsx';
import { colors, typeScale } from '../ui/theme.ts';

export default function LedgersScreen() {
  const { library, ledgers, currentId, switchLedger, refresh } = useLedgerLibrary();
  const paid = useHasPaidAccess();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = ledgers.length >= MAX_LEDGERS;
  const locked = SUBSCRIPTION_ENABLED && ledgers.length >= 1 && !paid;

  async function run(task: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(userMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  const choose = (entry: LedgerEntry) => {
    if (editing !== null || entry.id === currentId) return;
    // 切換後整個畫面以新帳本重新開始，回到記帳首頁。
    void run(() => switchLedger(entry.id), '切換帳本失敗，請再試一次。');
  };

  const add = () => {
    if (locked) {
      router.push('/paywall');
      return;
    }
    void run(async () => {
      const created = await library.addLedger(newName);
      setNewName('');
      await switchLedger(created.id); // 新帳本還沒開帳：回到首頁會先進開帳流程
    }, '新增帳本失敗，請再試一次。');
  };

  const rename = (entry: LedgerEntry) => void run(async () => {
    await library.renameLedger(entry.id, draft);
    setEditing(null);
    await refresh();
  }, '改名失敗，請再試一次。');

  const move = (index: number, delta: number) => void run(async () => {
    const ids = ledgers.map((l) => l.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    await library.reorderLedgers(ids);
    await refresh();
  }, '排序失敗，請再試一次。');

  const remove = (entry: LedgerEntry) => {
    if (ledgers.length === 1) {
      setError('至少要留一個帳本，最後一個帳本不能刪除。');
      return;
    }
    Alert.alert(
      `刪除「${entry.name}」？`,
      '這本帳的交易、預算、月結與投資紀錄會全部刪除，無法復原。建議先到「備份與還原」匯出備份檔。',
      [
        { text: '取消', style: 'cancel' },
        { text: '先去備份', onPress: () => router.push('/settings-backup') },
        {
          text: '刪除', style: 'destructive', onPress: () => void run(async () => {
            await library.deleteLedger(entry.id);
            setEditing(null);
            await refresh();
          }, '刪除失敗，請再試一次。'),
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: '帳本', headerBackTitle: '返回' }} />
      <ScrollView contentContainerStyle={kit.content} keyboardShouldPersistTaps="handled">
        <View style={kit.section}>
          <Footnote>點一下切換帳本。每本帳完全獨立：帳戶、分類、成員、預算、月結各自分開，不會合計。</Footnote>
          <Group>
            {ledgers.map((entry, index) => {
              const current = entry.id === currentId;
              if (editing === entry.id) {
                return (
                  <View key={entry.id} style={[kit.row, styles.editRow]}>
                    <TextInput style={[kit.input, styles.nameInput]} value={draft} onChangeText={setDraft} maxLength={20}
                      autoFocus accessibilityLabel="帳本名稱" placeholder="帳本名稱" placeholderTextColor={colors.muted} />
                    <View style={styles.editActions}>
                      <SmallButton label="↑" hint="往上移" disabled={busy || index === 0} onPress={() => move(index, -1)} />
                      <SmallButton label="↓" hint="往下移" disabled={busy || index === ledgers.length - 1} onPress={() => move(index, 1)} />
                      <SmallButton label="儲存" disabled={busy || !draft.trim()} onPress={() => rename(entry)} />
                      <SmallButton label="刪除" danger disabled={busy} onPress={() => remove(entry)} />
                      <SmallButton label="完成" disabled={busy} onPress={() => setEditing(null)} />
                    </View>
                  </View>
                );
              }
              return (
                <Pressable key={entry.id} onPress={() => choose(entry)} disabled={busy} accessibilityRole="button"
                  accessibilityState={{ selected: current }} accessibilityHint={current ? '目前使用中的帳本' : '切換到這本帳'}
                  style={({ pressed }) => [kit.row, pressed && kit.pressed]}>
                  <Text style={[styles.check, { opacity: current ? 1 : 0 }]}>✓</Text>
                  <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>{entry.name}</Text>
                  <Pressable onPress={() => { setEditing(entry.id); setDraft(entry.name); setError(null); }} hitSlop={10}
                    accessibilityRole="button" accessibilityLabel={`編輯「${entry.name}」`} disabled={busy}>
                    <Text style={styles.link}>編輯</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </Group>
        </View>

        <View style={kit.section}>
          <Footnote>新增帳本</Footnote>
          <TextInput style={kit.input} value={newName} onChangeText={setNewName} maxLength={20} editable={!busy && !full}
            accessibilityLabel="新帳本名稱" placeholder="例如：家庭、旅行、公司" placeholderTextColor={colors.muted} />
          <PrimaryButton title={locked ? '第二本起是進階功能' : '新增並開帳'} disabled={busy || full || (!locked && !newName.trim())} onPress={add} />
          <Footnote>
            {full ? `最多 ${MAX_LEDGERS} 個帳本。` : '新帳本會帶入預設的分類與帳戶，成員只有「自己」，接著走開帳流程。'}
          </Footnote>
        </View>

        {error ? <Text style={[text.error, kit.outsideText]} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SmallButton(props: { label: string; hint?: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled} accessibilityRole="button" accessibilityLabel={props.hint ?? props.label}
      style={({ pressed }) => [styles.small, pressed && kit.pressed, props.disabled && { opacity: 0.4 }]}>
      <Text style={[styles.smallText, props.danger && { color: colors.expense }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: { ...typeScale.headline, color: colors.accent, width: 20 },
  link: { ...typeScale.body, color: colors.accent },
  editRow: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  nameInput: { alignSelf: 'stretch' },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  smallText: { ...typeScale.body, color: colors.accent },
});
