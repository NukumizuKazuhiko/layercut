import { create } from "zustand";
import { uid } from "../utils/id";

/**
 * Immutable source material of a layer (project plan §9 "Source Data").
 * Kept OUT of the undo history — history only tracks layer metadata.
 */
export interface LayerAsset {
  id: string;
  kind: "png" | "svg";
  fileName: string;
  mimeType: string;
  naturalWidth: number;
  naturalHeight: number;
  /** decoded PNG bitmap, or the rasterized <img> for SVG */
  bitmap: ImageBitmap | HTMLImageElement;
  /** Original imported PNG bytes; project saving must not fetch the preview blob URL. */
  sourceBlob?: Blob;
  /** SVG text, kept for Phase 2 vector boolean + re-rasterization */
  svgText?: string;
  /** blob URL for the SVG source (also used as panel thumbnail) */
  svgUrl?: string;
  /** object URL of the original file for thumbnails */
  previewUrl: string;
}

interface AssetStore {
  assets: Record<string, LayerAsset>;
  put: (asset: LayerAsset) => void;
  remove: (id: string) => void;
}

export const useAssetStore = create<AssetStore>((set) => ({
  assets: {},
  put: (asset) =>
    set((s) => ({ assets: { ...s.assets, [asset.id]: asset } })),
  remove: (id) =>
    set((s) => {
      if (!(id in s.assets)) return s;
      const next = { ...s.assets };
      delete next[id];
      return { assets: next };
    }),
}));

export function getAsset(assets: Record<string, LayerAsset>, id: string | null): LayerAsset | null {
  if (!id) return null;
  return assets[id] ?? null;
}

export function newAssetId(): string {
  return uid("asset");
}
