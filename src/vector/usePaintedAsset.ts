import { useEffect, useState } from "react";
import type { LayerAsset } from "../assets/assetStore";
import type { Layer } from "../layers/layerTypes";
import { paintedAsset } from "./svgPaint";

/**
 * The asset repainted with the layer's SVG colour overrides. While a repaint
 * is in flight the overrides clear it to null, so the stale paint never shows.
 */
export function usePaintedAsset(asset: LayerAsset | null, layer: Layer): LayerAsset | null {
  const [painted, setPainted] = useState<LayerAsset | null>(asset);
  useEffect(() => {
    let active = true;
    if (!asset) { setPainted(null); return; }
    setPainted(asset.kind === "svg" && (layer.svgFillColor || layer.svgStrokeColor) ? null : asset);
    paintedAsset(asset, layer).then((result) => {
      if (active) setPainted(result);
    }).catch((error) => console.error("SVG paint preview failed", error));
    return () => { active = false; };
  }, [asset, layer.svgFillColor, layer.svgStrokeColor]);
  return painted;
}
