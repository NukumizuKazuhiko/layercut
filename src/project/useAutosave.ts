import { useEffect } from "react";
import { useEditorStore } from "../layers/layerStore";
import { useAssetStore } from "../assets/assetStore";
import { serializeProject } from "./projectTypes";
import { writeAutosave } from "./storage";

const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Debounced autosave to IndexedDB (project plan §13 "Autosave").
 * Writes whenever committed document content changes; flushes immediately
 * when the page is being hidden/closed.
 */
export function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSavedKey = "";
    let pendingContentKey: string | null = null;

    const serialize = async (flush: boolean) => {
      const s = useEditorStore.getState();
      const contentKey = JSON.stringify(s.canvas) + "|" + JSON.stringify(s.layers);
      if (contentKey === lastSavedKey) return;
      if (!flush) {
        pendingContentKey = contentKey;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void serialize(true), AUTOSAVE_DEBOUNCE_MS);
        return;
      }
      timer = null;
      const assets = useAssetStore.getState().assets;
      const project = await serializeProject(
        s.projectName || "layercut",
        s.canvas,
        s.layers,
        assets
      );
      const json = JSON.stringify(project);
      await writeAutosave({ savedAt: Date.now(), name: s.projectName, json });
      lastSavedKey = pendingContentKey ?? contentKey;
      pendingContentKey = null;
    };

    let lastLayers: unknown = null;
    let lastCanvas: unknown = null;
    const unsub = useEditorStore.subscribe((s) => {
      // only document content (canvas + layers) matters; ignore selection/view
      if (s.layers === lastLayers && s.canvas === lastCanvas) return;
      lastLayers = s.layers;
      lastCanvas = s.canvas;
      void serialize(false);
    });

    const onFlush = () => {
      if (timer) void serialize(true);
    };
    document.addEventListener("visibilitychange", onFlush);
    window.addEventListener("pagehide", onFlush);

    // remember what the initial state looks like so a no-op session never
    // triggers the recovery banner
    lastLayers = useEditorStore.getState().layers;
    lastCanvas = useEditorStore.getState().canvas;

    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onFlush);
      window.removeEventListener("pagehide", onFlush);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
