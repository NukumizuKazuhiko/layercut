import type { ExportFormat, ExportScope } from "../export/exportAll";
import type { ExportConfig } from "./projectTypes";

/** Last-used export settings, remembered across sessions (project plan §13). */
const KEY = "layercut.exportConfig";

export interface StoredExportConfig extends ExportConfig {
  format?: ExportFormat;
}

export function readExportConfig(): StoredExportConfig | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw);
    const scopes: ExportScope[] = ["current", "selected", "all", "composite"];
    if (!scopes.includes(v.scope) || typeof v.scale !== "number") return undefined;
    const cfg: StoredExportConfig = { scope: v.scope, scale: v.scale };
    if (v.format === "svg" || v.format === "png") cfg.format = v.format;
    return cfg;
  } catch {
    return undefined;
  }
}

export function writeExportConfig(config: StoredExportConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}
