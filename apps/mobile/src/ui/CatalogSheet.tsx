import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EntryCategory, Member } from '../ledger/index.ts';
import { syncNotifications } from '../platform/notificationSync.ts';
import { userMessage } from './format.ts';
import { success, warning } from './haptics.ts';
import { useLedger } from './LedgerProvider.tsx';
import { Card, PrimaryButton, text } from './kit.tsx';
import { colors, typeScale } from './theme.ts';
import { useKeyboardHeight } from './useKeyboardHeight.ts';

// 記帳畫面的「新增／修改」視窗（2026-11-24）：成員、收入分類、支出分類共用。
// 每一列可直接改圖示與名稱；最下面一列新增。成員另有「使用中」開關（自己不能關）。
// 分類的停用、換預算組、改上限仍在「預算與分類」。圖示用手機的表情鍵盤輸入，名稱不含圖示。
export type CatalogKind = 'member' | 'income' | 'expense';

interface Item { id: number; name: string; icon: string | null; active?: boolean; isSelf?: boolean }

const TITLES: Record<CatalogKind, string> = { member: '成員', income: '收入分類', expense: '支出分類' };

export function CatalogSheet({ kind, visible, onClose, onChanged }: {
  kind: CatalogKind;
  visible: boolean;
  onClose: () => void;
  /** 有新增或修改後通知記帳畫面重讀清單；selectedId 是新增的、或改名後的那一項。 */
  onChanged: (change: { kind: CatalogKind; previousId?: number; selectedId: number }) => void;
}) {
  const ledger = useLedger();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { name: string; icon: string }>>({});
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const rows: Item[] = kind === 'member'
      ? (await ledger.listMembers({ includeInactive: true })).map((m: Member) => ({ id: m.id, name: m.name, icon: m.icon, active: m.active, isSelf: m.isSelf }))
      : (await ledger.listCategories()).filter((c) => c.flow === kind).map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
    setItems(rows);
    setDrafts(Object.fromEntries(rows.map((r) => [r.id, { name: r.name, icon: r.icon ?? '' }])));
  }, [ledger, kind]);

  useEffect(() => {
    if (!visible) return;
    setError(null); setNewName(''); setNewIcon('');
    load().catch((e: unknown) => setError(userMessage(e, '讀取失敗，請關閉後再試一次。')));
  }, [visible, load]);

  async function run(work: () => Promise<{ previousId?: number; selectedId: number } | void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const change = await work();
      success();
      await load();
      if (change) onChanged({ kind, ...change });
      if (kind !== 'member') void syncNotifications(ledger).catch(() => {});
    } catch (e) {
      warning();
      setError(userMessage(e, '儲存失敗，請再試一次。'));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  const add = () => run(async () => {
    const icon = newIcon.trim() === '' ? null : newIcon;
    const created = kind === 'member'
      ? await ledger.addMember({ name: newName, icon })
      : await ledger.addEntryCategory({ flow: kind, name: newName, icon });
    setNewName(''); setNewIcon('');
    return { selectedId: created.id };
  });

  const save = (item: Item) => run(async () => {
    const draft = drafts[item.id];
    const icon = draft.icon.trim() === '' ? null : draft.icon;
    const changes = { name: draft.name, icon };
    const updated = kind === 'member' ? await ledger.updateMember(item.id, changes) : await ledger.updateEntryCategory(item.id, changes);
    return { previousId: item.id, selectedId: updated.id };
  });

  const toggleActive = (item: Item, active: boolean) => run(async () => { await ledger.setMemberActive(item.id, active); });

  const changed = (item: Item) => {
    const d = drafts[item.id];
    return d !== undefined && (d.name !== item.name || (d.icon.trim() === '' ? null : d.icon) !== item.icon);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom }}>
        <View style={styles.header}>
          <Text style={text.title}>{TITLES[kind]}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button"><Text style={text.link}>完成</Text></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={text.footnote}>
            直接改名稱或圖示，按「儲存」。圖示用手機的表情符號鍵盤輸入，選填。
            {kind === 'expense' ? '新增的支出分類會放在「照實支」、上限 0，之後可到「預算與分類」調整。' : ''}
          </Text>
          <Card padded={false}>
            {items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.row}>
                  <TextInput
                    value={drafts[item.id]?.icon ?? ''}
                    onChangeText={(icon) => setDrafts((d) => ({ ...d, [item.id]: { ...d[item.id], icon } }))}
                    placeholder="🙂" placeholderTextColor={colors.chevron} maxLength={8} editable={!busy}
                    style={[styles.iconInput]} accessibilityLabel={`${item.name}的圖示`}
                  />
                  <TextInput
                    value={drafts[item.id]?.name ?? ''}
                    onChangeText={(name) => setDrafts((d) => ({ ...d, [item.id]: { ...d[item.id], name } }))}
                    maxLength={30} editable={!busy} style={styles.nameInput} accessibilityLabel={`${item.name}的名稱`}
                  />
                  {changed(item) ? (
                    <Pressable onPress={() => void save(item)} disabled={busy} hitSlop={8} accessibilityRole="button">
                      <Text style={text.link}>儲存</Text>
                    </Pressable>
                  ) : kind === 'member' ? (
                    <View style={styles.switchWrap}>
                      <Text style={text.footnote}>{item.isSelf ? '本人' : item.active ? '使用中' : '已停用'}</Text>
                      {item.isSelf ? null : (
                        <Switch value={item.active === true} disabled={busy} onValueChange={(value) => void toggleActive(item, value)} />
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>

          <Text style={text.footnote}>新增{TITLES[kind]}</Text>
          <Card padded={false}>
            <View style={styles.row}>
              <TextInput value={newIcon} onChangeText={setNewIcon} placeholder="🙂" placeholderTextColor={colors.chevron}
                maxLength={8} editable={!busy} style={styles.iconInput} accessibilityLabel="新增項目的圖示" />
              <TextInput value={newName} onChangeText={setNewName} placeholder="名稱" placeholderTextColor={colors.chevron}
                maxLength={30} editable={!busy} style={styles.nameInput} accessibilityLabel="新增項目的名稱" returnKeyType="done" onSubmitEditing={() => { if (newName.trim()) void add(); }} />
            </View>
          </Card>
          {error ? <Text style={text.error}>{error}</Text> : null}
          <PrimaryButton title="新增" onPress={() => void add()} disabled={busy || newName.trim() === ''} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 6 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 },
  iconInput: { ...typeScale.title3, width: 44, height: 40, textAlign: 'center', backgroundColor: colors.fill, borderRadius: 10, padding: 0, color: colors.text },
  nameInput: { ...typeScale.body, flex: 1, color: colors.text, minHeight: 44, padding: 0 },
  switchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
