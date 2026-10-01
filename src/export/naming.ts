import { sanitizeFileName } from "../layers/layerUtils";

/** Batch export naming: 001_background.png (project plan §7.2). */
export function exportName(index: number, layerName: string, ext = "png"): string {
  return `${String(index).padStart(3, "0")}_${sanitizeFileName(layerName)}.${ext}`;
}

export function compositeName(): string {
  return "layercut_composite.png";
}
