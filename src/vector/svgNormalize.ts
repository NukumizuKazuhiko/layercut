/**
 * SVG Path Normalize + canvas-space placement (project plan §14 v0.4).
 * Paper's SVG importer normalizes rect/circle/ellipse/polygon/polyline/line
 * into paths; we additionally materialize <use>/<symbol> instances, drop
 * clip masks, and merge all filled geometry into one PathItem per layer so
 * the boolean stage sees a single shape per layer.
 */
import paper from "paper";
import { getPaper } from "./paperEnv";
import type { LayerAsset } from "../assets/assetStore";
import type { Layer } from "../layers/layerTypes";
import { svgTextForLayer } from "./svgPaint";

/** Materialize non-path items (symbols → placed definition, shapes → paths). */
function materialize(item: paper.Item): paper.Item | null {
  if (item instanceof paper.SymbolItem) {
    const def = item.definition as unknown as paper.Item;
    const placed = def.clone({ insert: false, deep: true }) as paper.Item;
    placed.transform(item.matrix);
    return materializeTree(placed);
  }
  if (item instanceof paper.Shape) {
    return materializeTree(item.toPath(true));
  }
  if (item instanceof paper.Group || item instanceof paper.Layer) {
    return materializeTree(item);
  }
  if (item.clipMask) return null; // clip geometry is not filled content
  return item;
}

function materializeTree(item: paper.Item): paper.Item | null {
  const children = item.children;
  if (children && children.length > 0) {
    const out: paper.Item[] = [];
    for (const child of children) {
      const m = materialize(child);
      if (m) out.push(m);
    }
    item.removeChildren();
    if (out.length === 0) return null;
    item.addChildren(out);
    return item;
  }
  return item;
}

export interface NormalizedLayer {
  /** all materialized geometry, already in canvas coordinates */
  item: paper.Item;
  /** union of every filled path — the layer's occluding geometry (may be null) */
  filledGeometry: paper.PathItem | null;
}

/**
 * Import an SVG asset and place it exactly like the raster pipeline draws it:
 * intrinsic bounds → centered at origin → scaled to displayed size → rotated
 * around the center → moved to the layer position.
 */
export function importLayerGeometry(asset: LayerAsset, layer: Layer): NormalizedLayer | null {
  const P = getPaper();
  if (asset.kind !== "svg" || !asset.svgText) return null;

  let imported: paper.Item;
  try {
    imported = P.project.importSVG(svgTextForLayer(asset, layer), {
      expandShapes: true,
      insert: false,
    }) as paper.Item;
  } catch (e) {
    console.warn("SVG import failed", e);
    return null;
  }
  if (!imported) return null;

  const materialized = materialize(imported);
  if (!materialized) return null;

  // map intrinsic bounds onto the displayed rect, then apply the layer transform
  const b = materialized.bounds;
  if (b.width <= 0 || b.height <= 0) return null;
  const t = layer.transform;
  const kx = (asset.naturalWidth * t.scaleX) / b.width;
  const ky = (asset.naturalHeight * t.scaleY) / b.height;

  materialized.translate(new P.Point(-b.center.x, -b.center.y));
  materialized.scale(kx, ky, new P.Point(0, 0));
  materialized.rotate(t.rotation, new P.Point(0, 0));
  materialized.translate(new P.Point(t.x, t.y));

  // collect filled leaf paths; SVG fill defaults to black (paper follows this)
  const filled: paper.PathItem[] = [];
  const leaves =
    materialized instanceof paper.PathItem
      ? [materialized]
      : (materialized.getItems({ class: P.PathItem }) as paper.PathItem[]);
  for (const leaf of leaves) {
    if (leaf.clipMask) continue;
    if (leaf.fillColor && !(leaf.fillColor.type === "none")) {
      filled.push(leaf.clone({ insert: false, deep: true }) as paper.PathItem);
    }
  }

  let filledGeometry: paper.PathItem | null = null;
  for (const f of filled) {
    filledGeometry = filledGeometry ? (filledGeometry.unite(f) as paper.PathItem) : f;
  }

  return { item: materialized, filledGeometry };
}
