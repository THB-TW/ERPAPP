// 財產趨勢折線的幾何（純函式，可單元測試）。單一數列、一條 y 軸。
export interface TrendLayout {
  /** 每個點的座標（與輸入同順序）。 */
  points: { x: number; y: number }[];
  /** SVG path 的 d。 */
  path: string;
  /** 刻度：上、中、下三條水平線的值與 y。 */
  ticks: { value: number; y: number }[];
}

/** 把範圍放寬到「好讀」的整數：上下各留一點空間，步距取 1／2／5×10^n。 */
function niceRange(min: number, max: number): [number, number] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return [min - pad, max + pad];
  }
  const raw = (max - min) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

export function trendLayout(values: number[], width: number, height: number, pad = { top: 8, bottom: 8, left: 0, right: 0 }): TrendLayout {
  if (values.length === 0 || width <= 0 || height <= 0) return { points: [], path: '', ticks: [] };
  const [low, high] = niceRange(Math.min(...values), Math.max(...values));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const y = (v: number) => pad.top + innerH * (1 - (v - low) / (high - low));
  const x = (i: number) => pad.left + (values.length === 1 ? innerW / 2 : (innerW * i) / (values.length - 1));
  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const ticks = [high, (high + low) / 2, low].map((value) => ({ value, y: y(value) }));
  return { points, path, ticks };
}

/** 依觸控位置找最近的點。 */
export function nearestIndex(points: { x: number }[], touchX: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(points[i].x - touchX) < Math.abs(points[best].x - touchX)) best = i;
  return best;
}
