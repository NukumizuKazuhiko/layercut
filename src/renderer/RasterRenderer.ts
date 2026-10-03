import type { Layer } from "../layers/layerTypes";
import type { LayerAsset } from "../assets/assetStore";
import { create2DCanvas } from "../utils/canvas";
import { isLayerOccluder } from "../layers/layerUtils";

/**
 * Rasterize one layer (with its transform + opacity baked in) into a
 * full-canvas bitmap. Pure — never mutates source data (project plan §2.2).
 */
export function rasterizeLayer(
  layer: Layer,
  asset: LayerAsset | null,
  canvasW: number,
  canvasH: number,
  scale: number
): HTMLCanvasElement | null {
  if (!asset || !isLayerOccluder(layer) || layer.opacity <= 0) return null;
  const { canvas, ctx } = create2DCanvas(canvasW * scale, canvasH * scale);
  ctx.scale(scale, scale);
  drawLayerToContext(ctx, layer, asset);
  return canvas;
}

/** Draw a layer at its transform into a context that is in canvas coordinates. */
export function drawLayerToContext(ctx: CanvasRenderingContext2D, layer: Layer, asset: LayerAsset): void {
  const t = layer.transform;
  const w = asset.naturalWidth * t.scaleX;
  const h = asset.naturalHeight * t.scaleY;
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  // For SVG assets modern browsers re-rasterize the vector at the destination
  // size, so exports stay crisp at any scale.
  ctx.drawImage(asset.bitmap as CanvasImageSource, -w / 2, -h / 2, w, h);
  ctx.restore();
}
