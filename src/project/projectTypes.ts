import type { CanvasSettings, Layer } from "../layers/layerTypes";
import type { LayerAsset } from "../assets/assetStore";
import type { ExportScope } from "../export/exportAll";

/**
 * .layercut project file format (project plan §8/§9).
 * Self-contained: all source material is embedded as base64 data URLs.
 */
export interface SerializedProject {
  app: "layercut";
  version: 1;
  name: string;
  canvas: CanvasSettings;
  assets: Record<string, SerializedAsset>;
  layers: Layer[];
  /** last used export settings (project plan §13 "导出配置保存") */
  exportConfig?: ExportConfig;
}

export interface SerializedAsset {
  fileName: string;
  mimeType: string;
  kind: "png" | "svg";
  data: string; // data URL
}

export interface ExportConfig {
  scope: ExportScope;
  scale: number;
}

export const PROJECT_APP_TAG = "layercut";
export const PROJECT_VERSION = 1 as const;
export const PROJECT_EXT = ".layercut";

// ---------------------------------------------------------------------------
// Serialize: store state → SerializedProject
// Asset data URLs are cached per asset id — assets are immutable, so repeated
// autosaves don't re-encode the same bitmaps.
// ---------------------------------------------------------------------------

const assetDataCache = new Map<string, SerializedAsset>();

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function serializeProject(
  name: string,
  canvas: CanvasSettings,
  layers: Layer[],
  assets: Record<string, LayerAsset>,
  exportConfig?: ExportConfig
): Promise<SerializedProject> {
  const out: Record<string, SerializedAsset> = {};
  for (const layer of layers) {
    if (!layer.assetId) continue;
    const asset = assets[layer.assetId];
    if (!asset || out[layer.assetId]) continue;
    const cached = assetDataCache.get(layer.assetId);
    if (cached) {
      out[layer.assetId] = cached;
      continue;
    }
    let dataUrl: string;
    if (asset.kind === "svg" && asset.svgText !== undefined) {
      const b64 = await blobToBase64(new Blob([asset.svgText], { type: "image/svg+xml" }));
      dataUrl = `data:image/svg+xml;base64,${b64}`;
    } else {
      // original file bytes are still reachable through the preview object URL
      const blob = await (await fetch(asset.previewUrl)).blob();
      const mime = asset.mimeType || blob.type || "image/png";
      dataUrl = `data:${mime};base64,${await blobToBase64(blob)}`;
    }
    const serialized: SerializedAsset = {
      fileName: asset.fileName,
      mimeType: asset.kind === "svg" ? "image/svg+xml" : asset.mimeType || "image/png",
      kind: asset.kind,
      data: dataUrl,
    };
    assetDataCache.set(layer.assetId, serialized);
    out[layer.assetId] = serialized;
  }
  return {
    app: PROJECT_APP_TAG,
    version: PROJECT_VERSION,
    name,
    canvas,
    assets: out,
    layers,
    exportConfig,
  };
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

export function isValidProjectJson(value: unknown): value is SerializedProject {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.app === PROJECT_APP_TAG && v.version === PROJECT_VERSION && typeof v.canvas === "object";
}
