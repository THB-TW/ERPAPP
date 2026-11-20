// 設定 › 訂閱（票 22）：訂閱狀態、Apple 訂閱管理連結、還原購買。
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text } from 'react-native';
import { appSubscription } from '../platform/appSubscription.ts';
import { subscriptionSummary } from '../subscription/statusText.ts';
import { MANAGE_SUBSCRIPTIONS_URL } from '../subscription/storePort.ts';
import { useSubscriptionStatus } from '../ui/closeEntitlement.ts';
import { colors } from '../ui/theme.ts';

export default function SubscriptionScreen() {
  const status = useSubscriptionStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  async function restore() {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      await appSubscription.restore();
      if (mounted.current) setMessage('已向 App Store 確認購買紀錄。');
    } catch (e) {
      if (mounted.current) setMessage(e instanceof Error ? e.message : '無法連上 App Store，請稍後再試。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: '訂閱', headerBackTitle: '返回' }} />
      <Text style={{ color: colors.text, fontSize: 16, lineHeight: 23 }}>{subscriptionSummary(status)}</Text>
      {status.kind === 'never' || status.kind === 'expired' ? (
        <Row label={status.kind === 'expired' ? '重新訂閱進階版' : '查看進階版方案'} onPress={() => router.push('/paywall')} />
      ) : null}
      <Row label="管理訂閱（Apple）" onPress={() => { void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL); }} />
      <Row label={busy ? '確認中…' : '還原購買'} disabled={busy || !appSubscription.storeAvailable} onPress={() => { void restore(); }} />
      {!appSubscription.storeAvailable ? <Text style={{ color: colors.muted }}>這個版本沒有接上 App Store 內購，無法還原購買。</Text> : null}
      {message ? <Text style={{ color: colors.muted }}>{message}</Text> : null}
    </ScrollView>
  );
}

function Row({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
