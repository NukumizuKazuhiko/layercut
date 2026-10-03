import { sanitizeFileName } from "../layers/layerUtils";

/**
 * Output file naming (project plan §7.2): `001_background.png`.
 *
 * Names are split into a user-editable *base* and a fixed extension, so the
 * export dialog can rename files without ever letting a name lose its
 * extension or depend on the current format.
 */

/** Default base name of one batch entry: the zero-padded index + the layer name. */
export function defaultBaseName(index: number, layerName: string): string {
  return `${String(index).padStart(3, "0")}_${sanitizeFileName(layerName)}`;
}

export function exportName(index: number, layerName: string, ext = "png"): string {
  return `${defaultBaseName(index, layerName)}.${ext}`;
}

export function compositeBaseName(): string {
  return "layercut_composite";
}

export function compositeName(ext = "png"): string {
  return `${compositeBaseName()}.${ext}`;
}

/** Overrides are keyed by layer id; the composite output uses this key. */
export const COMPOSITE_NAME_KEY = "composite";

export type FileNameOverrides = Record<string, string>;

/** A usable base name: user input that is empty or blank means "use the default". */
export function normalizedBase(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim() === "" ? undefined : value;
}

/**
 * Resolve the final file names of one batch: sanitize every requested base and
 * make it unique inside the batch by inserting " (1)", " (2)", … before the
 * extension. Comparison is case-insensitive because the usual export targets
 * (Windows, macOS) are — `Logo.png` and `logo.png` would otherwise overwrite
 * each other.
 */
export function resolveFileNames(bases: string[], ext: string): string[] {
  const used = new Set<string>();
  return bases.map((base) => {
    const safe = sanitizeFileName(base);
    let name = `${safe}.${ext}`;
    let suffix = 1;
    while (used.has(name.toLowerCase())) {
      name = `${safe} (${suffix}).${ext}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}
