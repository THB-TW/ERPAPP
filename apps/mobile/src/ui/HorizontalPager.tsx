import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, interpolateColor, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { selection } from './haptics.ts';
import { segmentedStyles, text } from './kit.tsx';
import { colors } from './theme.ts';

type PageOption = { key: string; label: string; color?: string };
const RAIL_INSET = 16;
const RAIL_LINE_INSET = 4;
const PagerInteraction = createContext<() => boolean>(() => true);

export function usePagerTap() {
  const canTap = useContext(PagerInteraction);
  return (action: () => void) => () => {
    if (canTap()) action();
  };
}

export function HorizontalPager({ options, children, onChange, variant = 'segmented' }: {
  options: readonly PageOption[];
  children: ReactNode;
  onChange?: (index: number) => void;
  variant?: 'segmented' | 'rail';
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const progress = useSharedValue(0);
  const start = useSharedValue(0);
  const settled = useSharedValue(0);
  const animating = useSharedValue(false);
  const suppressTap = useSharedValue(0);
  const flat = variant === 'rail';
  const last = options.length - 1;
  const inset = flat ? RAIL_INSET : 2;
  const step = Math.max(0, width - 2 * inset) / options.length;
  const indicatorRange = options.map((_, index) => index);
  const indicatorColors = options.map(option => option.color ?? colors.accent);

  function didChange(index: number) {
    setSelected(index);
    onChange?.(index);
    selection();
  }

  function settle(index: number) {
    'worklet';
    animating.set(true);
    progress.set(withTiming(index, { duration: 240 }, finished => {
      if (!finished) return;
      const changed = index !== settled.get();
      settled.set(index);
      animating.set(false);
      if (changed) runOnJS(didChange)(index);
    }));
  }

  // 水平移動才接手。以拖曳起點的相鄰頁為限，兩端只短暫位移後回彈。
  const pan = Gesture.Pan().enabled(width > 0).activeOffsetX([-16, 16]).failOffsetY([-12, 12])
    .onStart(() => {
      cancelAnimation(progress);
      start.set(progress.get());
      animating.set(true);
    })
    .onUpdate(event => {
      const origin = Math.max(0, Math.min(last, Math.round(start.get())));
      const next = start.get() - event.translationX / width;
      const adjacent = Math.max(origin - 1, Math.min(origin + 1, next));
      const edge = Math.max(0, Math.min(last, adjacent));
      progress.set(edge + Math.max(-0.14, Math.min(0.14, (adjacent - edge) * 0.25)));
    })
    .onEnd((event, completed) => {
      // iOS 的清單列可能在橫拖放手時仍收到 Pressable 的 onPress。
      suppressTap.set(1);
      suppressTap.set(withDelay(320, withTiming(0, { duration: 0 }), ReduceMotion.Never));
      const origin = Math.max(0, Math.min(last, Math.round(start.get())));
      const projected = Math.round(progress.get() - event.velocityX / width * 0.15);
      const target = Math.max(0, origin - 1, Math.min(last, origin + 1, projected));
      settle(completed ? target : settled.get());
    });

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: -progress.get() * width }] }));
  const indicator = useAnimatedStyle(() => {
    const index = Math.max(0, Math.min(last, progress.get()));
    return {
      transform: [{ translateX: index * step }],
      backgroundColor: flat ? interpolateColor(index, indicatorRange, indicatorColors) : colors.surface,
    };
  });
  const naturalHeight = useAnimatedStyle(() => ({
    height: heights.length === options.length && heights.every(height => height > 0)
      ? (animating.get() ? Math.max(...heights) : heights[selected]) : undefined,
  }));
  return (
    <View style={flat ? styles.fill : styles.segmentedPager} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <View style={flat ? styles.rail : segmentedStyles.container} accessibilityRole="tablist">
        {width > 0 ? (
          <Animated.View pointerEvents="none"
            style={flat ? [styles.railIndicator, { width: Math.max(0, step - RAIL_LINE_INSET * 2) }, indicator]
              : [segmentedStyles.item, segmentedStyles.selected, styles.segmentedIndicator, { width: step }, indicator]} />
        ) : null}
        {options.map((option, index) => (
          <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{ selected: selected === index }}
            onPress={() => settle(index)} style={flat ? styles.railTab : segmentedStyles.item}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
              style={[text.subhead, selected === index && styles.selected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.viewport, flat ? styles.fill : naturalHeight]}>
          <Animated.View style={[styles.pages, flat && styles.fullHeight, { width: width * options.length }, strip]}>
            <PagerInteraction.Provider value={() => !animating.get() && suppressTap.get() === 0}>
              {Children.map(children, (child, index) => (
                <View style={[{ width }, flat && styles.fullHeight]} accessibilityElementsHidden={selected !== index}
                  importantForAccessibility={selected === index ? 'auto' : 'no-hide-descendants'}
                  pointerEvents={selected === index ? 'auto' : 'none'}
                  onLayout={flat ? undefined : event => {
                    const height = event.nativeEvent.layout.height;
                    setHeights(previous => {
                      if (previous[index] === height) return previous;
                      const next = [...previous];
                      next[index] = height;
                      return next;
                    });
                  }}>
                  {child}
                </View>
              ))}
            </PagerInteraction.Provider>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fullHeight: { height: '100%' },
  segmentedPager: { gap: 24 },
  segmentedIndicator: { position: 'absolute', top: 2, bottom: 2, left: 2 },
  rail: {
    flexDirection: 'row', paddingHorizontal: RAIL_INSET,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  railTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  railIndicator: { position: 'absolute', left: RAIL_INSET + RAIL_LINE_INSET, bottom: 0, height: 3, borderRadius: 2 },
  selected: { fontWeight: '600' },
  viewport: { overflow: 'hidden' },
  pages: { flexDirection: 'row', alignItems: 'flex-start' },
});
