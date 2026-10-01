/**
 * Vector occlusion engine (project plan §14 v0.5 + v0.6):
 *
 *   Layer[i]_visible.svg = Layer[i] − Union(Layers Above i)
 *
 * Same top-down cumulative sweep as the raster engine, but operating on
 * Paper.js path booleans so every layer keeps true vector geometry:
 * curves are preserved and the result exports as real SVG (§7.3).
 */
import { getPaper, resetProject, type PaperPathItem } from "./paperEnv";
import { importLayerGeometry } from "./svgNormalize";
import type { CanvasSettings, Layer } from "../layers/layerTypes";
import type { LayerAsset } from "../assets/assetStore";

export interface VectorOcclusionResult {
  /** per-layer SVG document string, full-canvas viewBox, transform baked in */
  byLayerId: Map<string, string>;
}

function exportVisibleSvg(item: PaperPathItem, canvas: CanvasSettings, scale: number): string {
  const P = getPaper();
  resetProject();
  const layer = new P.Layer();
  P.project.addLayer(layer);
  layer.addChild(item);
  const svg = P.project.exportSVG({
    asString: true,
    bounds: new P.Rectangle(0, 0, canvas.width, canvas.height),
    precision: 4,
    matchShapes: false,
  }) as string;
  resetProject();
  // paper's root <svg> may not carry width/height — build our own wrapper so
  // the canvas viewBox is guaranteed and the export scale is applied exactly
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  const w = (canvas.width * scale).toFixed(2);
  const h = (canvas.height * scale).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${canvas.width} ${canvas.height}">${inner}</svg>`;
}

/**
 * Compute per-layer visible SVG via vector boolean. The caller must ensure
 * every visible layer is an SVG layer (use analyzeSvgSafety for content).
 */
export function computeVectorOcclusion(
  layers: Layer[],
  assets: Record<string, LayerAsset>,
  canvas: CanvasSettings,
  scale = 1
): VectorOcclusionResult {
  const byLayerId = new Map<string, string>();
  let mask: PaperPathItem | null = null;

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible) continue;
    const asset = layer.assetId ? assets[layer.assetId] ?? null : null;
    if (!asset || asset.kind !== "svg") continue;
    const normalized = importLayerGeometry(asset, layer);
    if (!normalized) continue;

    const { filledGeometry } = normalized;
    if (filledGeometry) {
      const visible = mask
        ? (filledGeometry.subtract(mask) as PaperPathItem)
        : filledGeometry;
      byLayerId.set(layer.id, exportVisibleSvg(visible, canvas, scale));
      mask = mask ? (mask.unite(filledGeometry) as PaperPathItem) : filledGeometry;
    } else {
      // stroke-only or empty geometry: nothing occludes, export as-is
      byLayerId.set(layer.id, exportVisibleSvg(normalized.item as PaperPathItem, canvas, scale));
    }
  }

  return { byLayerId };
}
