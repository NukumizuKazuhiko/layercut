import type { Layer } from "../layers/layerTypes";

export interface Size {
  width: number;
  height: number;
}

/** Displayed size of a layer = asset natural size × scale. */
export function getLayerSize(layer: Layer, natural: Size | null): Size {
  if (!natural) return { width: 0, height: 0 };
  return {
    width: natural.width * layer.transform.scaleX,
    height: natural.height * layer.transform.scaleY,
  };
}

export interface AABB {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Axis-aligned bounding box of a possibly rotated layer.
 * x/y is the layer center; size is the unrotated displayed size.
 */
export function getLayerAABB(layer: Layer, natural: Size | null): AABB | null {
  if (!natural) return null;
  const { width, height } = getLayerSize(layer, natural);
  if (width === 0 || height === 0) return null;
  const rad = (layer.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = layer.transform.x;
  const cy = layer.transform.y;
  const hw = width / 2;
  const hh = height / 2;
  // rotated corners relative to center
  const dx = Math.abs(hw * cos) + Math.abs(hh * sin);
  const dy = Math.abs(hw * sin) + Math.abs(hh * cos);
  return { left: cx - dx, top: cy - dy, right: cx + dx, bottom: cy + dy };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
