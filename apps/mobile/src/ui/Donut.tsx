import type { ReactNode } from 'react';
import { View } from 'react-native';
import { allocateShares } from '../calc/shares.ts';
import { colors } from './theme.ts';

// 甜甜圈圖。專案沒有裝 SVG 套件，所以用一圈細長的色條拼成：整圈分成 TICKS 格，
// 每格是一條繞圓心旋轉的色條，各切片依金額比例（最大餘數法）分到幾格。
const TICKS = 180;
const SIZE = 220;
const RING = 34; // 環的粗細
const OUTER = 97; // 外半徑（對應原型 r=80、線寬 34）
// 色條寬度要比外緣一格的弧長（2π·97/180 ≈ 3.4）略寬，相鄰色條才不會露出縫隙。
const TICK_WIDTH = 4.5;

export interface DonutSlice {
  key: string;
  amount: number;
  color: string;
}

export function Donut({ slices, children }: { slices: DonutSlice[]; children?: ReactNode }) {
  const counts = allocateShares(slices.map((s) => s.amount), TICKS);
  const tickColors: string[] = [];
  slices.forEach((slice, i) => {
    for (let n = 0; n < counts[i]; n += 1) tickColors.push(slice.color);
  });
  const empty = tickColors.length === 0;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      {empty ? (
        <View
          style={{
            position: 'absolute',
            left: SIZE / 2 - OUTER,
            top: SIZE / 2 - OUTER,
            width: OUTER * 2,
            height: OUTER * 2,
            borderRadius: OUTER,
            borderWidth: RING,
            borderColor: colors.fill,
          }}
        />
      ) : (
        tickColors.map((color, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (SIZE - TICK_WIDTH) / 2,
              top: SIZE / 2 - OUTER,
              width: TICK_WIDTH,
              height: OUTER * 2,
              // 第 i 格的中心角度；0 度在正上方、順時針，和原型一致。
              transform: [{ rotate: `${((i + 0.5) * 360) / TICKS}deg` }],
            }}
          >
            <View style={{ width: TICK_WIDTH, height: RING, backgroundColor: color }} />
          </View>
        ))
      )}
      <View style={{ position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}
