// 付費牆（票 22）：第一次碰付費功能、或訂閱到期後碰付費寫入時由 requirePaidFeature() 推入。
// 文字見 src/subscription/paywallText.ts（法規審核修訂版）；價格與試用資格一律來自 App Store。
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appSubscription } from '../platform/appSubscription.ts';
import { PAID_FEATURE_LABELS, type PaidFeature } from '../subscription/entitlement.ts';
import { TERMS_URL, paywallSections, purchaseButtonLabel } from '../subscription/paywallText.ts';
import { MANAGE_SUBSCRIPTIONS_URL, type StoreOffer } from '../subscription/storePort.ts';
import { useSubscriptionStatus } from '../ui/closeEntitlement.ts';
import { colors } from '../ui/theme.ts';

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '無法連上 App Store，請稍後再試。';
}

export default function PaywallScreen() {
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const status = useSubscriptionStatus();
  const [offer, setOffer] = useState<StoreOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    appSubscription.loadOffer().then((value) => { if (mounted.current) setOffer(value); },
      (e: unknown) => { if (mounted.current) setError(errorText(e)); });
    return () => { mounted.current = false; };
  }, []);

  // 訂閱成功（含在別處完成的購買）就回到原本的畫面。
  useEffect(() => {
    if ((status.kind === 'active' || status.kind === 'dev_unlocked') && router.canGoBack()) router.back();
  }, [status.kind]);

  async function run(action: () => Promise<unknown>, done?: string) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await action();
      if (mounted.current && done) setNotice(done);
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const label = feature && feature in PAID_FEATURE_LABELS ? PAID_FEATURE_LABELS[feature as PaidFeature] : null;
  const monthly = offer?.products.find((p) => p.period === 'month');
  const yearly = offer?.products.find((p) => p.period === 'year');
  const trial = offer?.trialEligible === true;
  const sections = monthly && yearly ? paywallSections({ monthly: monthly.displayPrice, yearly: yearly.displayPrice }, trial) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: '進階版', headerBackTitle: '返回' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>進階版</Text>
        {label ? <Text style={{ color: colors.muted }}>{status.kind === 'expired'
          ? `訂閱已到期，「${label}」目前只能檢視。重新訂閱後可繼續使用，缺的月結會從最早的開放月份依序補做。`
          : `「${label}」是進階版功能。`}</Text> : null}
        {!appSubscription.storeAvailable ? (
          <View style={{ padding: 14, borderRadius: 12, backgroundColor: colors.surface }}>
            <Text style={{ color: colors.text }}>這個版本沒有接上 App Store 內購，無法訂閱或還原購買。</Text>
          </View>
        ) : null}
        {appSubscription.storeAvailable && !offer && !error ? <ActivityIndicator accessibilityLabel="讀取訂閱方案中" /> : null}
        {sections?.map((section, i) => (
          <View key={i} style={{ gap: 4 }}>
            {section.heading ? <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{section.heading}</Text> : null}
            {section.lines.map((line) => /^(年|月)方案：/.test(line)
              // 價格是付費牆上最醒目的字（審查指南 3.1.2(c)），不小於試用標題。
              ? <Text key={line} style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{line}</Text>
              : <Text key={line} style={{ color: colors.text, lineHeight: 21 }}>{line}</Text>)}
          </View>
        ))}
        {yearly ? <Button label={purchaseButtonLabel(trial, 'year', yearly.displayPrice)} disabled={busy}
          onPress={() => run(() => appSubscription.purchase(yearly.id))} /> : null}
        {monthly ? <Button label={purchaseButtonLabel(trial, 'month', monthly.displayPrice)} disabled={busy} secondary
          onPress={() => run(() => appSubscription.purchase(monthly.id))} /> : null}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.expense }}>{error}</Text> : null}
        {notice ? <Text style={{ color: colors.muted }}>{notice}</Text> : null}
        <Button label="還原購買" secondary disabled={busy || !appSubscription.storeAvailable}
          onPress={() => run(() => appSubscription.restore(), '已向 App Store 確認購買紀錄。')} />
        <Button label="管理訂閱" secondary onPress={() => { void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL); }} />
        <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
          <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(TERMS_URL); }}>
            <Text style={{ color: colors.accent }}>使用條款</Text>
          </Pressable>
          {/* 隱私權政策網址上架前才決定（票 02／上架前待辦）；有網址後改成連結。 */}
          <Text style={{ color: colors.muted }}>隱私權政策（上架前提供）</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={{ paddingVertical: 14, borderRadius: 12, alignItems: 'center', opacity: disabled ? 0.5 : 1,
        backgroundColor: secondary ? colors.surface : colors.accent }}>
      <Text style={{ color: secondary ? colors.text : '#fff', fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
