// 只計算圖形的角度與路徑，不參與帳本金額或報表占比計算。角度由正上方起、順時針，單位為弧度。
export const DONUT_SIZE = 220;
export const DONUT_OUTER = 97;
export const DONUT_RING = 34;
const INNER = DONUT_OUTER - DONUT_RING;
const CENTER = DONUT_SIZE / 2;
const TURN = Math.PI * 2;

export interface DonutSegment {
  /** 保留原始切片索引，零值略過後仍對應原本的顏色。 */
  index: number;
  startAngle: number;
  endAngle: number;
}

export function donutSegments(amounts: readonly number[]): DonutSegment[] {
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('金額必須是不小於 0 的整數。');
  }
  const total = amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
  if (total === 0n) return [];

  let cumulative = 0n;
  let endAngle = 0;
  return amounts.flatMap((amount, index) => {
    if (amount === 0) return [];
    const startAngle = endAngle;
    cumulative += BigInt(amount);
    endAngle = cumulative === total ? TURN : (Number(cumulative) / Number(total)) * TURN;
    return [{ index, startAngle, endAngle }];
  });
}

/** 多分段的圓環切片：內緣約 2pt 白縫、四個 3pt 小圓角；極小片依弧長縮小，避免反轉。完整圓環另用 Circle。 */
export function donutPath({ startAngle, endAngle }: DonutSegment): string {
  const span = endAngle - startAngle;
  const gap = Math.min(2 / INNER, span / 4);
  const start = startAngle + gap / 2;
  const end = endAngle - gap / 2;
  const corner = Math.min(3, ((end - start) * INNER) / 4);
  const outerCorner = corner / DONUT_OUTER;
  const innerCorner = corner / INNER;
  const point = (radius: number, angle: number) => `${CENTER + radius * Math.sin(angle)} ${CENTER - radius * Math.cos(angle)}`;
  const outerLarge = end - start - outerCorner * 2 > Math.PI ? 1 : 0;
  const innerLarge = end - start - innerCorner * 2 > Math.PI ? 1 : 0;

  return [
    `M ${point(DONUT_OUTER, start + outerCorner)}`,
    `A ${DONUT_OUTER} ${DONUT_OUTER} 0 ${outerLarge} 1 ${point(DONUT_OUTER, end - outerCorner)}`,
    `Q ${point(DONUT_OUTER, end)} ${point(DONUT_OUTER - corner, end)}`,
    `L ${point(INNER + corner, end)}`,
    `Q ${point(INNER, end)} ${point(INNER, end - innerCorner)}`,
    `A ${INNER} ${INNER} 0 ${innerLarge} 0 ${point(INNER, start + innerCorner)}`,
    `Q ${point(INNER, start)} ${point(INNER + corner, start)}`,
    `L ${point(DONUT_OUTER - corner, start)}`,
    `Q ${point(DONUT_OUTER, start)} ${point(DONUT_OUTER, start + outerCorner)}`,
    'Z',
  ].join(' ');
}
