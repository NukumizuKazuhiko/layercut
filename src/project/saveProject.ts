import { downloadBlob } from "../export/exportPNG";
import { importPNGFile } from "../import/importPNG";
import { importSVGFile } from "../import/importSVG";
import { useAssetStore } from "../assets/assetStore";
import { useEditorStore } from "../layers/layerStore";
import { useViewportStore } from "../editor/ViewportManager";
import { sanitizeFileName } from "../layers/layerUtils";
import { addRecent } from "./storage";
import {
  PROJECT_EXT,
  isValidProjectJson,
  serializeProject,
  type SerializedProject,
} from "./projectTypes";
import { readExportConfig, writeExportConfig } from "./exportConfig";

/** Serialize the current document and download it as {name}.layercut. */
export async function saveProjectAs(rawName: string): Promise<void> {
  const name = rawName.trim() || "layercut";
  const s = useEditorStore.getState();
  const assets = useAssetStore.getState().assets;
  const exportConfig = readExportConfig();
  const project = await serializeProject(name, s.canvas, s.layers, assets, exportConfig);
  const json = JSON.stringify(project);

  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, `${sanitizeFileName(name)}${PROJECT_EXT}`);

  await addRecent({ name, savedAt: Date.now(), layerCount: s.layers.length, json });
  const store = useEditorStore.getState();
  store.setProjectName(name);
  store.markSaved();
}

/**
 * Load a serialized project: rebuild assets through the normal import
 * pipeline (new asset ids), remap layer references, replace the document.
 */
export async function loadProjectJson(json: string, name?: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("invalid json");
  }
  if (!isValidProjectJson(parsed)) throw new Error("not a layercut project");
  const project = parsed as SerializedProject;

  // rebuild assets (ids differ from the saved ones)
  const idMap = new Map<string, string>();
  for (const [oldId, sa] of Object.entries(project.assets ?? {})) {
    try {
      const blob = await (await fetch(sa.data)).blob();
      const file = new File([blob], sa.fileName || "asset", { type: sa.mimeType });
      if (sa.kind === "svg" || sa.mimeType === "image/svg+xml") {
        const { asset } = await importSVGFile(file);
        idMap.set(oldId, asset.id);
      } else {
        const { asset } = await importPNGFile(file);
        idMap.set(oldId, asset.id);
      }
    } catch (e) {
      console.warn("project asset failed to load:", sa.fileName, e);
    }
  }

  // clamp + remap layers
  const canvas = {
    width: clampInt(project.canvas.width, 1, 8192, 1080),
    height: clampInt(project.canvas.height, 1, 8192, 1920),
    background: typeof project.canvas.background === "string" ? project.canvas.background : "transparent",
  };
  const layers = (Array.isArray(project.layers) ? project.layers : [])
    .filter((l) => l && typeof l.id === "string" && typeof l.transform === "object")
    .map((l) => ({
      ...l,
      name: typeof l.name === "string" ? l.name : "",
      opacity: finiteOr(l.opacity, 1, 0, 1),
      visible: l.visible !== false,
      locked: l.locked === true,
      assetId: l.assetId ? idMap.get(l.assetId) ?? null : null,
      transform: {
        x: finiteOr(l.transform.x, 0),
        y: finiteOr(l.transform.y, 0),
        scaleX: finiteOr(l.transform.scaleX, 1, 0.001, 1000),
        scaleY: finiteOr(l.transform.scaleY, 1, 0.001, 1000),
        rotation: finiteOr(l.transform.rotation, 0),
      },
    }));

  const projectName = (name ?? project.name ?? "").trim();
  useEditorStore.getState().loadProject({ canvas, layers, name: projectName });
  if (project.exportConfig) writeExportConfig(project.exportConfig);
  useViewportStore.getState().fit(canvas.width, canvas.height);
}

/** Open a .layercut file picked from disk. */
export async function openProjectFile(file: File): Promise<void> {
  const json = await file.text();
  await loadProjectJson(json, file.name.replace(/\.[^.]+$/, ""));
  const name = useEditorStore.getState().projectName;
  await addRecent({
    name: name || "layercut",
    savedAt: Date.now(),
    layerCount: useEditorStore.getState().layers.length,
    json,
  });
}

function finiteOr(v: unknown, fallback: number, min?: number, max?: number): number {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  if (min !== undefined) return Math.max(min, n);
  if (max !== undefined) return Math.min(max, n);
  return n;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(typeof v === "number" && isFinite(v) ? v : fallback);
  return Math.min(max, Math.max(min, n));
}
