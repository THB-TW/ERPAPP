// 長頁面「區段快速導覽」的純計算：點頁籤要捲到哪、捲動時該亮哪個頁籤。
// 放在畫面外，才能用 node --test 驗證；預算頁（及之後其他長頁面）共用。

/** 區段標題上方保留的空白（px），讓標題不貼齊頂端。 */
export const SECTION_TOP_GAP = 12;

export interface ScrollMetrics {
  /** 目前捲動位置。 */
  offset: number;
  /** 可見區域高度。 */
  viewport: number;
  /** 內容總高度。 */
  content: number;
  /** 捲動區頂端被吸頂元件（例如頁籤列）蓋住的高度。 */
  topInset?: number;
}

/** 可捲到的最大位置；內容比畫面短時為 0。 */
export function maxOffset(viewport: number, content: number): number {
  return Math.max(0, content - viewport);
}

/**
 * 點頁籤後要捲到的位置：區段頂端減吸頂元件高度與上方空白，並限制在可捲範圍內。
 * 不限制的話，最後幾個短區段的目標會超過頁底，捲動動畫停在別處，判斷「到了沒」也永遠不成立。
 */
export function jumpOffset(sectionY: number, viewport: number, content: number, topInset = 0): number {
  return Math.min(Math.max(0, sectionY - topInset - SECTION_TOP_GAP), maxOffset(viewport, content));
}

/**
 * 依捲動位置決定目前所在區段：最後一個標題已捲到上方空白線（含容差）的區段。
 * 捲到頁底時，最後一區可能太短而無法讓標題到頂端，此時標示最後一區。
 */
export function sectionAt<T extends string>(
  order: readonly T[],
  positions: Partial<Record<T, number>>,
  metrics: ScrollMetrics,
): T {
  let current = order[0];
  for (const id of order) {
    const y = positions[id];
    if (y !== undefined && y - SECTION_TOP_GAP <= metrics.offset + (metrics.topInset ?? 0) + 4) current = id;
  }
  const last = order[order.length - 1];
  const scrollable = metrics.content > metrics.viewport;
  if (scrollable && positions[last] !== undefined && metrics.offset >= maxOffset(metrics.viewport, metrics.content) - 2) {
    current = last;
  }
  return current;
}

/** 程式捲動是否已抵達目標（容差 2px，涵蓋小數像素與回彈）。 */
export function reachedTarget(offset: number, target: number): boolean {
  return Math.abs(offset - target) <= 2;
}
