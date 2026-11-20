import { Children, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { selection } from './haptics.ts';
import { segmentedStyles, text } from './kit.tsx';

/** 兩個收支頁同時保留，手勢與按鈕共用翻頁位置；只有橫滑才接手。 */
export function ReportPager({ options, children, onChange }: {
  options: { key: string; label: string }[]; children: ReactNode; onChange: (index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const progress = useSharedValue(0);
  const start = useSharedValue(0);
  const settled = useSharedValue(0);
  const dragging = useSharedValue(false);
  function didSettle(index: number) { setSelected(index); onChange(index); selection(); }
  function settle(index: number) {
    'worklet';
    progress.value = withTiming(index, { duration: 240 }, (finished) => {
      if (finished) {
        settled.value = index;
        dragging.value = false;
        runOnJS(didSettle)(index);
      }
    });
  }
  const pan = Gesture.Pan().activeOffsetX([-16, 16]).failOffsetY([-12, 12])
    .onStart(() => { cancelAnimation(progress); start.value = progress.value; dragging.value = true; })
    .onUpdate((event) => { progress.value = Math.max(0, Math.min(1, start.value - event.translationX / width)); })
    .onEnd((event) => {
      const projected = progress.value - event.velocityX / width * 0.15;
      settle(projected >= 0.5 ? 1 : 0);
    })
    .onFinalize((_event, success) => { if (!success && dragging.value) settle(settled.value); });
  const pagesStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -progress.value * width }] }));
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * (width - 4) / 2 }] }));
  const viewportStyle = useAnimatedStyle(() => ({
    height: heights[0] > 0 && heights[1] > 0 ? (dragging.value ? Math.max(...heights) : heights[selected]) : undefined,
  }));
  return (
    <View style={styles.container} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={segmentedStyles.container} accessibilityRole="tablist">
        <Animated.View style={[segmentedStyles.item, segmentedStyles.selected, styles.indicator, { width: (width - 4) / 2 }, indicatorStyle]} />
        {options.map((option, index) => (
          <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{ selected: selected === index }}
            onPress={() => { dragging.value = true; settle(index); }} style={segmentedStyles.item}>
            <Text style={[text.subhead, selected === index && styles.selected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.viewport, viewportStyle]}>
          <Animated.View style={[styles.pages, { width: width * 2 }, pagesStyle]}>
            {Children.map(children, (child, index) => (
              <View style={{ width }} accessibilityElementsHidden={selected !== index}
                importantForAccessibility={selected === index ? 'auto' : 'no-hide-descendants'}
                pointerEvents={selected === index ? 'auto' : 'none'}
                onLayout={(event) => {
                  const height = event.nativeEvent.layout.height;
                  setHeights((old) => old[index] === height ? old : Object.assign([...old], { [index]: height }));
                }}>{child}</View>
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 24 },
  indicator: { position: 'absolute', top: 2, bottom: 2, left: 2 },
  selected: { fontWeight: '600' },
  viewport: { overflow: 'hidden' },
  pages: { flexDirection: 'row', alignItems: 'flex-start' },
});
