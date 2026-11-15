import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { DONUT_OUTER, DONUT_RING, DONUT_SIZE, donutPath, donutSegments } from './donutGeometry.ts';
import { colors } from './theme.ts';

export interface DonutSlice {
  key: string;
  amount: number;
  color: string;
}

export function Donut({ slices, children }: { slices: DonutSlice[]; children?: ReactNode }) {
  const segments = donutSegments(slices.map((slice) => slice.amount));
  const single = segments.length === 1;

  return (
    <View style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} accessible={false} pointerEvents="none">
        {/* 空資料沿用灰環；唯一正值直接畫完整圓環，不留下起訖接縫。多段底色讓細縫維持白色。 */}
        <Circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={DONUT_OUTER - DONUT_RING / 2}
          fill="none"
          stroke={single ? slices[segments[0].index].color : segments.length === 0 ? colors.fill : colors.surface}
          strokeWidth={DONUT_RING}
        />
        {!single && segments.map((segment) => (
          <Path key={slices[segment.index].key} d={donutPath(segment)} fill={slices[segment.index].color} />
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: 0, top: 0, width: DONUT_SIZE, height: DONUT_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}
