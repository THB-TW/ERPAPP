// 付費內容唯讀時的提示列：說明為何只能檢視，並提供進入付費牆的按鈕（票 22）。
import { Pressable, Text, View } from 'react-native';
import type { PaidFeature } from '../subscription/entitlement.ts';
import { requirePaidFeature, useSubscriptionStatus } from './closeEntitlement.ts';
import { colors } from './theme.ts';

export function PaidLock({ feature, note }: { feature: PaidFeature; note: string }) {
  const status = useSubscriptionStatus();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted }}>{note}</Text>
      <Pressable accessibilityRole="button" onPress={() => { requirePaidFeature(feature); }}>
        <Text style={{ color: colors.accent }}>{status.kind === 'expired' ? '重新訂閱進階版 ›' : '查看進階版方案 ›'}</Text>
      </Pressable>
    </View>
  );
}
