import type { CanvasSettings, Layer } from "../layers/layerTypes";
import type { LayerAsset } from "../assets/assetStore";
import { newAssetId, useAssetStore } from "../assets/assetStore";
import { makeLayer } from "../layers/layerUtils";

/**
 * Decode a PNG file into an asset. PNG files use createImageBitmap;
 * SVG files cannot (they take the SVG path in importSVG.ts).
 */
export async function importPNGFile(file: File): Promise<{ asset: LayerAsset }> {
  const bitmap = await createImageBitmap(file);
  const asset: LayerAsset = {
    id: newAssetId(),
    kind: "png",
    fileName: file.name,
    mimeType: file.type || "image/png",
    naturalWidth: bitmap.width,
    naturalHeight: bitmap.height,
    bitmap,
    sourceBlob: file,
    previewUrl: URL.createObjectURL(file),
  };
  useAssetStore.getState().put(asset);
  return { asset };
}

/** Create the Layer for an imported PNG asset (centered on canvas). */
export function pngLayerFromAsset(asset: LayerAsset, canvas: CanvasSettings): Layer {
  return makeLayer({
    name: asset.fileName.replace(/\.[^.]+$/, ""),
    type: "png",
    assetId: asset.id,
    canvas,
    natural: { width: asset.naturalWidth, height: asset.naturalHeight },
  });
}
