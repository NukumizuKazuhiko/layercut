import type { Layer } from "./layerTypes";
import type { LayerAsset } from "../assets/assetStore";
import { uid } from "../utils/id";
import type { CanvasSettings } from "./layerTypes";

/** Selection filtered to layers that still exist (history may restore dangling ids). */
export function validSelection(layers: Layer[], selectedIds: string[]): string[] {
  const ids = new Set(layers.map((l) => l.id));
  return selectedIds.filter((id) => ids.has(id));
}

export function findLayer(layers: Layer[], id: string): Layer | undefined {
  return layers.find((l) => l.id === id);
}

export function layerNaturalSize(asset: LayerAsset | null): { width: number; height: number } | null {
  if (!asset) return null;
  return { width: asset.naturalWidth, height: asset.naturalHeight };
}

/** Center a new layer on the canvas, scaled down if larger than the canvas. */
export function initialTransform(canvas: CanvasSettings, natural: { width: number; height: number }) {
  let scale = 1;
  const maxW = canvas.width * 0.8;
  const maxH = canvas.height * 0.8;
  if (natural.width > maxW || natural.height > maxH) {
    scale = Math.min(maxW / natural.width, maxH / natural.height);
  }
  return {
    x: canvas.width / 2,
    y: canvas.height / 2,
    scaleX: scale,
    scaleY: scale,
    rotation: 0,
  };
}

export function makeLayer(opts: {
  name: string;
  type: Layer["type"];
  assetId: string | null;
  canvas: CanvasSettings;
  natural?: { width: number; height: number } | null;
}): Layer {
  return {
    id: uid("layer"),
    name: opts.name,
    type: opts.type,
    assetId: opts.assetId,
    transform: initialTransform(opts.canvas, opts.natural ?? { width: 0, height: 0 }),
    opacity: 1,
    visible: true,
    locked: false,
  };
}

export function duplicateLayer(layer: Layer, layers: Layer[]): Layer {
  const base = layer.name.replace(/ copy( \d+)?$/, "");
  let suffixIndex = 1;
  let name = `${base} copy`;
  // ensure unique name
  const names = new Set(layers.map((l) => l.name));
  while (names.has(name)) {
    suffixIndex += 1;
    name = `${base} copy ${suffixIndex}`;
  }
  // offset slightly so the copy is visible
  return {
    ...layer,
    id: uid("layer"),
    name,
    transform: { ...layer.transform, x: layer.transform.x + 16, y: layer.transform.y + 16 },
  };
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return cleaned || "layer";
}
