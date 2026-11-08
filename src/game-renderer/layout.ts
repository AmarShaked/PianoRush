/** Pure geometry for the play field, in CSS pixels. Unit-testable and renderer-agnostic. */
export interface PlayfieldLayout {
  readonly width: number;
  readonly height: number;
  readonly laneCount: number;
  readonly laneWidth: number;
  readonly left: number;
  readonly right: number;
  readonly hitY: number;
  readonly keysTop: number;
  readonly keysHeight: number;
  /** Pixels per millisecond of song time. */
  readonly pxPerMs: number;
}

export interface LayoutOptions {
  readonly laneCount: number;
  /** How much song time is visible between the top of the screen and the hit line. */
  readonly lookaheadMs: number;
  /** Space reserved at the top for the DOM HUD. */
  readonly topInset?: number;
}

export function computeLayout(width: number, height: number, opts: LayoutOptions): PlayfieldLayout {
  const keysHeight = clamp(height * 0.17, 64, 140);
  const keysTop = height - keysHeight;
  const hitY = keysTop - clamp(height * 0.035, 12, 28);
  const maxByWidth = (width - 32) / opts.laneCount;
  const maxByHeight = (height * 1.05) / opts.laneCount;
  const laneWidth = clamp(Math.min(maxByWidth, maxByHeight, 170), 44, 170);
  const total = laneWidth * opts.laneCount;
  const left = Math.round((width - total) / 2);
  const travel = hitY - (opts.topInset ?? 0);
  return {
    width,
    height,
    laneCount: opts.laneCount,
    laneWidth,
    left,
    right: left + total,
    hitY,
    keysTop,
    keysHeight,
    pxPerMs: travel / opts.lookaheadMs,
  };
}

/** Y of a tile's bottom edge (its note-on moment) at a given song time. */
export function noteBottomY(layout: PlayfieldLayout, noteTimeMs: number, songTime: number): number {
  return layout.hitY - (noteTimeMs - songTime) * layout.pxPerMs;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
