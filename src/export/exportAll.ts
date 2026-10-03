import JSZip from "jszip";
import { useAssetStore } from "../assets/assetStore";
import { useEditorStore } from "../layers/layerStore";
import { validSelection } from "../layers/layerUtils";
import { canvasToBlob, computeOcclusionForExport, rasterizeComposite } from "./exportPNG";
import { compositeName, exportName } from "./naming";
import { analyzeSvgSafety } from "../vector/svgSafety";
import { computeVectorOcclusion } from "../vector/svgBoolean";
import { isLayerOccluder } from "../layers/layerUtils";
import { paintedAssetsForLayers } from "../vector/svgPaint";

export type ExportScope = "current" | "selected" | "all" | "composite";
export type ExportFormat = "png" | "svg";
export type ExportDestination = "folder" | "zip";

export interface ExportOptions {
  scope: ExportScope;
  scale: number;
}

interface WritableFileHandle {
  createWritable: () => Promise<{
    write: (d: BlobPart) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

async function saveViaFolder(
  dir: { getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<WritableFileHandle> },
  files: { name: string; blob: Blob }[]
): Promise<void> {
  for (const f of files) {
    const handle = await dir.getFileHandle(f.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(f.blob);
    await writable.close();
  }
}

async function saveZip(files: { name: string; blob: Blob }[]): Promise<void> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "layercut_export.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Batch export (project plan §7). Prefers the File System Access API so users
 * pick a real folder; falls back to a single ZIP download.
 * Hidden layers are skipped as outputs. A hidden occluder still cuts lower layers.
 * format "svg" requires every participating layer to be a vector-safe SVG (§7.3).
 */
export async function exportLayers(
  scope: ExportScope,
  scale: number,
  format: ExportFormat = "png",
  onProgress?: (done: number, total: number) => void,
  destination: ExportDestination = "folder"
): Promise<"folder" | "zip" | "cancelled"> {
  const { canvas, layers, selectedIds } = useEditorStore.getState();
  const assets = useAssetStore.getState().assets;

  if (format === "svg") {
    return exportVectorLayers(scope, scale, onProgress, destination);
  }
  const renderAssets = await paintedAssetsForLayers(layers, assets);

  if (scope === "composite") {
    const blob = await canvasToBlob(rasterizeComposite(layers, canvas, renderAssets, scale));
    return saveOrZip([{ name: compositeName(), blob }], destination);
  }

  const visible = layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => layer.visible);
  let targets = visible;
  if (scope === "current" || scope === "selected") {
    const ids = new Set(validSelection(layers, selectedIds));
    targets = visible.filter(({ layer }) => ids.has(layer.id));
    if (targets.length === 0) return "cancelled";
  }

  // one occlusion pass serves every layer (project plan §15)
  const occlusion = computeOcclusionForExport(layers, canvas, renderAssets, scale);
  const files: { name: string; blob: Blob }[] = [];
  let done = 0;
  for (const { layer, index } of targets) {
    const raster = occlusion.byLayerId.get(layer.id);
    if (!raster) continue;
    const blob = await canvasToBlob(raster);
    files.push({ name: exportName(index + 1, layer.name), blob });
    done += 1;
    onProgress?.(done, targets.length);
  }

  return saveOrZip(files, destination);
}

/** Vector export (§14 v0.6): Layer[i] − Union(Layers Above) as real SVG. */
async function exportVectorLayers(
  scope: ExportScope,
  scale: number,
  onProgress?: (done: number, total: number) => void,
  destination: ExportDestination = "folder"
): Promise<"folder" | "zip" | "cancelled"> {
  if (scope === "composite") throw new Error("svg_composite_unsupported");
  const { canvas, layers, selectedIds } = useEditorStore.getState();
  const assets = useAssetStore.getState().assets;

  const visible = layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => layer.visible);
  if (layers.some((layer) => isLayerOccluder(layer) && layer.type !== "svg")) {
    throw new Error("svg_needs_all_svg"); // a PNG layer exists (§7.3)
  }

  for (const layer of layers.filter(isLayerOccluder)) {
    const asset = layer.assetId ? assets[layer.assetId] : null;
    if (asset?.kind === "svg" && asset.svgText) {
      const safety = analyzeSvgSafety(asset.svgText);
      if (!safety.safe) {
        const err = new Error("svg_unsafe") as Error & { offending?: string[] };
        err.offending = safety.offending;
        throw err;
      }
    }
  }

  let targets = visible;
  if (scope === "current" || scope === "selected") {
    const ids = new Set(validSelection(layers, selectedIds));
    targets = visible.filter(({ layer }) => ids.has(layer.id));
    if (targets.length === 0) return "cancelled";
  }

  const result = computeVectorOcclusion(layers, assets, canvas, scale);
  const files: { name: string; blob: Blob }[] = [];
  let done = 0;
  for (const { layer, index } of targets) {
    const svg = result.byLayerId.get(layer.id);
    if (!svg) continue;
    files.push({
      name: exportName(index + 1, layer.name, "svg"),
      blob: new Blob([svg], { type: "image/svg+xml" }),
    });
    done += 1;
    onProgress?.(done, targets.length);
  }
  if (files.length === 0) throw new Error("svg_unsafe");

  return saveOrZip(files, destination);
}

async function saveOrZip(files: { name: string; blob: Blob }[], destination: ExportDestination): Promise<"folder" | "zip" | "cancelled"> {
  if (files.length === 0) return "cancelled";
  if (destination === "zip") {
    await saveZip(files);
    return "zip";
  }
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string; id?: string; startIn?: string }) => Promise<{
        getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<WritableFileHandle>;
      }>;
    }
  ).showDirectoryPicker;

  if (picker) {
    try {
      const dir = await picker.call(window, { mode: "readwrite", id: "layercut-export", startIn: "downloads" });
      await saveViaFolder(dir, files);
      return "folder";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      console.warn("Folder picker failed, falling back to ZIP", e);
    }
  }
  await saveZip(files);
  return "zip";
}
