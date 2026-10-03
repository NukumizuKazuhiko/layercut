import { useEffect } from "react";
import { useEditorStore } from "../layers/layerStore";
import { useAssetStore } from "../assets/assetStore";
import { serializeProject } from "./projectTypes";
import { readExportConfig } from "./exportConfig";
import { writeAutosave } from "./storage";

const AUTOSAVE_DEBOUNCE_MS = 1500;
/** Periodic retry for a failed write while the app sits idle. */
const AUTOSAVE_RETRY_MS = 10000;

/** One writer consumes the latest document snapshot; failed writes stay retryable. */
export function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let ready = false;
    let pending: ReturnType<typeof capture> | null = null;
    let lastSavedKey = "";

    function capture() {
      const state = useEditorStore.getState();
      const exportConfig = readExportConfig();
      const key = JSON.stringify([state.documentEpoch, state.projectName, state.canvas, state.layers, exportConfig]);
      return { key, state, assets: useAssetStore.getState().assets, exportConfig };
    }

    const drain = async () => {
      if (running) return;
      running = true;
      try {
        while (ready && pending) {
          const snapshot = pending;
          pending = null;
          ready = false;
          if (snapshot.key === lastSavedKey) continue;
          try {
            const { state, assets, exportConfig } = snapshot;
            const project = await serializeProject(state.projectName || "layercut", state.canvas, state.layers, assets, exportConfig);
            await writeAutosave({ savedAt: Date.now(), name: state.projectName, json: JSON.stringify(project) });
            lastSavedKey = snapshot.key;
          } catch (error) {
            // Keep the newest snapshot. A later edit, visibility event, retry
            // timer or cleanup retries it.
            pending ??= snapshot;
            ready = false;
            console.warn("autosave failed", error);
            if (!retryTimer) {
              retryTimer = setTimeout(() => {
                retryTimer = null;
                flush();
              }, AUTOSAVE_RETRY_MS);
            }
            break;
          }
        }
      } finally {
        running = false;
      }
    };

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      ready = pending !== null;
      void drain();
    };
    let observedKey = capture().key;
    const unsub = useEditorStore.subscribe(() => {
      const snapshot = capture();
      if (snapshot.key === observedKey) return;
      observedKey = snapshot.key;
      pending = snapshot;
      ready = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      if (retryTimer) clearTimeout(retryTimer);
      // React cleanup starts the queued write instead of discarding its timer.
      flush();
    };
  }, []);
}
