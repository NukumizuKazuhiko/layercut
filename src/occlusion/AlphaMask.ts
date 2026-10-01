/**
 * Binary / threshold masking — interface reserved for post-MVP occlusion modes
 * (project plan §21 Case 4 "Alpha vs Binary" and §22 "Mask Threshold").
 * MVP always runs in "alpha" mode (real alpha subtraction).
 */

export interface MaskOptions {
  /** alpha: subtract real alpha. binary: alpha >= threshold is fully subtracted. */
  mode?: "alpha" | "binary";
  /** 0..1 threshold for binary mode */
  threshold?: number;
}

/**
 * Subtract a mask canvas from ctx (destination-out).
 * Binary mode is a no-op stub until the threshold pipeline lands.
 */
export function applyMaskToContext(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  opts: MaskOptions = {}
): void {
  if (opts.mode === "binary") {
    // TODO(post-MVP): threshold mask alpha into a temp canvas, then subtract.
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}
