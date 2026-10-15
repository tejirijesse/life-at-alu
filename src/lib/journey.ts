// A tiny mutable store shared by the DOM scroll loop and the 3D frame loop.
// Nothing here triggers React renders; both loops read and write it every frame.

export type Detail = "high" | "medium" | "low";

export const journey = {
  /** Scroll position in scene units: integer part = scene index, fraction = local progress. */
  target: 0,
  /** Smoothed value the 3D world actually follows. */
  t: 0,
  index: 0,
  /** Per-scene local progress, so environments can animate without recomputing. */
  locals: [] as number[],
  reduced: false,
  /** With reduced motion, the scene shown only changes behind a fade. */
  snap: 0,
  mobile: false,
  detail: "high" as Detail,
  /** 1 → 0 once the canvas has mounted: Tejiri walks into the opening frame. */
  intro: 1,
  /** Set by the world when it is ready to receive the canvas blur used in transitions. */
  canvas: null as HTMLCanvasElement | null,
};

export type AnnotationHandle = {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  scene: number;
  range: [number, number];
};

export const annotationHandles: AnnotationHandle[] = [];

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
