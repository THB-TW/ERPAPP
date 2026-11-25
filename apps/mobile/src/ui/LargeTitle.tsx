import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { kit } from './kit.tsx';
import { useCurrentLedgerName } from './LedgerProvider.tsx';
import { colors, typeScale } from './theme.ts';

// 分頁的大標題（像 iOS「設定」）：標題是捲動內容的第一項，往下捲超過它之後，導覽列中央淡入同名小標題並出現底線。
//
// 為什麼不用原生的 headerLargeTitleEnabled：2026-11-13 在 iPhone 17 模擬器（iOS 26.5）實測，
// 導覽列設了底色時原生大標題收合後小標題是看不見的（expo-router 原始碼也註明
// 「The title becomes invisible if background color is set with large title on iOS 26」），
// 改成透明導覽列又會讓預算頁的吸頂頁籤列跑到導覽列底下。自己畫標題兩個問題都沒有。

/** 捲動超過這個距離就算大標題已經捲出畫面（大標題一行約 41pt）。 */
const COLLAPSE_AT = 36;

/**
 * 分頁畫面用：回傳要放在 ScrollView 第一項的大標題，以及要接到 ScrollView onScroll 的處理函式
 *（記得設 scrollEventThrottle={16}）。一般分頁直接用下面的 <TabScrollView> 就好；
 * 只有需要自己拿 ScrollView ref 或 stickyHeaderIndices 的畫面（預算頁）才直接用這個。
 */
export function useLargeTitle(title: string, options: { onLedgerPress?: () => void } = {}): {
  element: ReactNode;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const navigation = useNavigation();
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <FadingTitle title={title} visible={collapsed} />,
      headerShadowVisible: collapsed,
    });
  }, [navigation, title, collapsed]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCollapsed(event.nativeEvent.contentOffset.y > COLLAPSE_AT);
  }, []);

  // 多帳本（ADR 0008）：大標題右邊顯示目前帳本名稱；記帳頁可以點它切換帳本。
  const ledgerName = useCurrentLedgerName();
  const { onLedgerPress } = options;
  const badge = !ledgerName ? null : onLedgerPress ? (
    <Pressable onPress={onLedgerPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`目前帳本：${ledgerName}`}
      accessibilityHint="切換或管理帳本" style={({ pressed }) => [styles.ledgerButton, pressed && kit.pressed]}>
      <Text style={styles.ledgerActive} numberOfLines={1}>{ledgerName} ▾</Text>
    </Pressable>
  ) : (
    <Text style={styles.ledgerName} numberOfLines={1} accessibilityLabel={`目前帳本：${ledgerName}`}>{ledgerName}</Text>
  );
  return {
    element: (
      <View style={styles.titleRow}>
        <Text style={styles.large} accessibilityRole="header">{title}</Text>
        {badge}
      </View>
    ),
    onScroll,
  };
}

/** 導覽列中央的小標題：大標題捲出畫面後淡入，捲回來淡出。 */
function FadingTitle({ title, visible }: { title: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [opacity, visible]);
  return (
    <Animated.Text
      style={[styles.small, { opacity }]}
      numberOfLines={1}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {title}
    </Animated.Text>
  );
}

/**
 * 分頁畫面的最外層：淺灰底的 ScrollView，第一項是大標題，其餘是 children。
 * contentContainerStyle 預設 kit.content（左右 16、區段間距 24）。
 */
export function TabScrollView({
  title,
  children,
  contentContainerStyle,
  onLedgerPress,
  ...rest
}: { title: string; children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle>; onLedgerPress?: () => void } & Omit<ScrollViewProps, 'onScroll' | 'style' | 'contentContainerStyle'>) {
  const largeTitle = useLargeTitle(title, { onLedgerPress });
  return (
    <ScrollView
      style={kit.screen}
      contentContainerStyle={contentContainerStyle ?? kit.content}
      contentInsetAdjustmentBehavior="automatic"
      onScroll={largeTitle.onScroll}
      scrollEventThrottle={16}
      {...rest}
    >
      {/* 預設版面的區段間距是 24，大標題和下一個區段靠近一點（12）；自訂版面就照它自己的間距。 */}
      <View style={contentContainerStyle ? undefined : styles.titleWrap}>{largeTitle.element}</View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  ledgerName: { ...typeScale.subhead, color: colors.muted, flexShrink: 1 },
  ledgerButton: { flexShrink: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  ledgerActive: { ...typeScale.subhead, fontWeight: '600', color: colors.accent },
  large: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.4, color: colors.text },
  small: { ...typeScale.headline, color: colors.text },
  titleWrap: { marginBottom: -12 },
});
