import JSZip from "jszip";
import { useAssetStore } from "../assets/assetStore";
import { useEditorStore } from "../layers/layerStore";
import { validSelection } from "../layers/layerUtils";
import { canvasToBlob, computeOcclusionForExport, exportableLayers, rasterizeComposite } from "./exportPNG";
import {
  COMPOSITE_NAME_KEY,
  compositeBaseName,
  defaultBaseName,
  normalizedBase,
  resolveFileNames,
  type FileNameOverrides,
} from "./naming";
import { analyzeSvgSafety } from "../vector/svgSafety";
import { computeVectorOcclusion } from "../vector/svgBoolean";
import { isLayerOccluder } from "../layers/layerUtils";
import { paintedAssetsForLayers } from "../vector/svgPaint";
import type { Layer } from "../layers/layerTypes";

export type ExportScope = "current" | "selected" | "all" | "composite";
export type ExportFormat = "png" | "svg";
export type ExportDestination = "folder" | "zip";

export interface ExportOptions {
  scope: ExportScope;
  scale: number;
}

/** One planned output file: the name the dialog shows is the name that is written. */
export interface PlannedExportFile {
  /** layer id, or COMPOSITE_NAME_KEY for the composite output */
  key: string;
  /** position in the layer stack (bottom → top), used by the default name */
  index: number;
  /** the user-editable name without extension */
  base: string;
  /** final name after sanitizing + duplicate disambiguation */
  fileName: string;
}

/** Visible layers a scope will export, in file order (bottom → top). */
function exportTargets(
  layers: Layer[],
  selectedIds: string[],
  scope: ExportScope
): { layer: Layer; index: number }[] {
  const visible = exportableLayers(layers);
  if (scope !== "current" && scope !== "selected") return visible;
  const ids = new Set(validSelection(layers, selectedIds));
  return visible.filter(({ layer }) => ids.has(layer.id));
}

/**
 * The single source of truth for output file names. The export dialog previews
 * exactly this list and the writers consume the same list, so a rename or an
 * automatic "(1)" can never differ between preview and output.
 */
export function planExportFiles(opts: {
  layers: Layer[];
  selectedIds: string[];
  scope: ExportScope;
  ext: string;
  overrides?: FileNameOverrides;
}): PlannedExportFile[] {
  const { layers, selectedIds, scope, ext, overrides } = opts;
  const override = (key: string) => normalizedBase(overrides?.[key]);

  if (scope === "composite") {
    const base = override(COMPOSITE_NAME_KEY) ?? compositeBaseName();
    return [{ key: COMPOSITE_NAME_KEY, index: 0, base, fileName: resolveFileNames([base], ext)[0] }];
  }

  const targets = exportTargets(layers, selectedIds, scope);
  const bases = targets.map(
    ({ layer, index }) => override(layer.id) ?? defaultBaseName(index + 1, layer.name)
  );
  const names = resolveFileNames(bases, ext);
  return targets.map(({ layer, index }, i) => ({
    key: layer.id,
    index,
    base: bases[i],
    fileName: names[i],
  }));
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
 *
 * `overrides` renames output files (keyed by layer id, values without extension);
 * duplicates inside one batch get " (1)", " (2)", … from planExportFiles.
 */
export async function exportLayers(
  scope: ExportScope,
  scale: number,
  format: ExportFormat = "png",
  onProgress?: (done: number, total: number) => void,
  destination: ExportDestination = "folder",
  overrides?: FileNameOverrides
): Promise<"folder" | "zip" | "cancelled"> {
  const { canvas, layers, selectedIds } = useEditorStore.getState();
  const assets = useAssetStore.getState().assets;
  const ext = format === "svg" ? "svg" : "png";
  const plan = planExportFiles({ layers, selectedIds, scope, ext, overrides });
  if (plan.length === 0) return "cancelled";

  if (format === "svg") {
    // Vector boolean exports per layer, so a single composite image is out of scope.
    if (scope === "composite") throw new Error("svg_composite_unsupported");
    return exportVectorLayers(plan, scale, onProgress, destination);
  }

  const renderAssets = await paintedAssetsForLayers(layers, assets);

  if (scope === "composite") {
    const blob = await canvasToBlob(rasterizeComposite(layers, canvas, renderAssets, scale));
    return saveOrZip([{ name: plan[0].fileName, blob }], destination);
  }

  // one occlusion pass serves every layer (project plan §15)
  const occlusion = computeOcclusionForExport(layers, canvas, renderAssets, scale);
  const files: { name: string; blob: Blob }[] = [];
  let done = 0;
  for (const file of plan) {
    const raster = occlusion.byLayerId.get(file.key);
    if (!raster) continue;
    const blob = await canvasToBlob(raster);
    files.push({ name: file.fileName, blob });
    done += 1;
    onProgress?.(done, plan.length);
  }

  return saveOrZip(files, destination);
}

/** Vector export (§14 v0.6): Layer[i] − Union(Layers Above) as real SVG. */
async function exportVectorLayers(
  plan: PlannedExportFile[],
  scale: number,
  onProgress?: (done: number, total: number) => void,
  destination: ExportDestination = "folder"
): Promise<"folder" | "zip" | "cancelled"> {
  const { canvas, layers } = useEditorStore.getState();
  const assets = useAssetStore.getState().assets;

  // An empty layer has no content: it outputs nothing and rasterizes to no
  // occlusion, so it must not veto SVG export (the vector engine skips it too).
  if (layers.some((layer) => layer.type !== "empty" && isLayerOccluder(layer) && layer.type !== "svg")) {
    throw new Error("svg_needs_all_svg"); // a non-empty PNG layer exists (§7.3)
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

  const result = computeVectorOcclusion(layers, assets, canvas, scale);
  const files: { name: string; blob: Blob }[] = [];
  let done = 0;
  for (const file of plan) {
    const svg = result.byLayerId.get(file.key);
    if (!svg) continue;
    files.push({
      name: file.fileName,
      blob: new Blob([svg], { type: "image/svg+xml" }),
    });
    done += 1;
    onProgress?.(done, plan.length);
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
