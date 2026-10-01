import { create } from "zustand";
import type { CanvasSettings, Layer, PreviewMode, ProjectSnapshot } from "./layerTypes";
import { duplicateLayer, validSelection } from "./layerUtils";
import { uid } from "../utils/id";
const HISTORY_LIMIT = 100;

function snap(s: EditorState): ProjectSnapshot {
  return { canvas: s.canvas, layers: s.layers, selectedIds: s.selectedIds };
}

function sameSnapshot(a: ProjectSnapshot, b: ProjectSnapshot): boolean {
  return (
    JSON.stringify(a.canvas) === JSON.stringify(b.canvas) &&
    JSON.stringify(a.layers) === JSON.stringify(b.layers) &&
    JSON.stringify(a.selectedIds) === JSON.stringify(b.selectedIds)
  );
}

// ---------------------------------------------------------------------------
// Undo/Redo history (project plan §16).
// Commands are coarse-grained transactions: dragging calls beginTransaction()
// at drag start and commitTransaction() at drag end, so one gesture = one
// undo step. Source data (bitmaps) is never part of history.
// ---------------------------------------------------------------------------
const history = {
  past: [] as ProjectSnapshot[],
  future: [] as ProjectSnapshot[],
  pending: null as ProjectSnapshot | null,
};

interface EditorState extends ProjectSnapshot {
  // view state (not undoable, not part of history)
  previewMode: PreviewMode;
  explodeAmount: number;
  snapEnabled: boolean;
  notice: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** current project display name ("" = untitled) */
  projectName: string;
  /** bumped on every committed content change (incl. undo/redo) */
  historyVersion: number;
  /** historyVersion at the last explicit save / load — dirty = version > savedVersion */
  savedVersion: number;

  // view actions
  setPreviewMode: (mode: PreviewMode) => void;
  setExplodeAmount: (v: number) => void;
  toggleSnap: () => void;
  setNotice: (msg: string | null) => void;
  setProjectName: (name: string) => void;
  markSaved: () => void;
  /** replace the whole document (open project / recovery) */
  loadProject: (doc: { canvas: CanvasSettings; layers: Layer[]; name: string }) => void;

  // selection (changes are deliberately NOT undo steps)
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string, additive: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // history control
  beginTransaction: () => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;

  // canvas
  setCanvasSize: (width: number, height: number) => void;
  setCanvasBackground: (background: CanvasSettings["background"]) => void;
  newCanvas: (canvas: CanvasSettings) => void;

  // layers (commit = push an undo step; false = transient, e.g. mid-drag)
  addLayers: (layers: Layer[], select?: boolean) => void;
  addEmptyLayer: (name?: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  updateLayer: (id: string, patch: Partial<Layer>, commit?: boolean) => void;
  updateLayerTransform: (
    id: string,
    t: Partial<Layer["transform"]>,
    commit?: boolean
  ) => void;
  setLayersOpacity: (ids: string[], opacity: number, commit?: boolean) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  moveLayerToTop: (id: string) => void;
  moveLayerToBottom: (id: string) => void;
  nudgeSelected: (dx: number, dy: number) => void;
}

function pushHistory(state: EditorState): Partial<EditorState> {
  const s = snap(state);
  if (history.past.length >= HISTORY_LIMIT) history.past.shift();
  history.past.push(s);
  history.future = [];
  return { canUndo: true, canRedo: false };
}

function restore(target: ProjectSnapshot): Partial<EditorState> {
  // selection may reference layers that no longer exist
  const selectedIds = validSelection(target.layers, target.selectedIds);
  return { ...target, selectedIds, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

function ids(layers: Layer[], selectedIds: string[]): string[] {
  return validSelection(layers, selectedIds);
}

/** True while a gesture transaction is open (beginTransaction without commit). */
export function hasPendingTransaction(): boolean {
  return history.pending !== null;
}

export const useEditorStore = create<EditorState>((set, get) => {
  /** Apply committed (undoable) mutation. */
  const commitSet = (fn: (s: EditorState) => Partial<EditorState>) => {
    set((s) => ({ ...pushHistory(s), ...fn(s), historyVersion: s.historyVersion + 1 }));
  };
  /** Apply transient mutation (no history entry). */
  const liveSet = (fn: (s: EditorState) => Partial<EditorState>) => {
    set((s) => fn(s));
  };

  return {
    canvas: { width: 1080, height: 1920, background: "transparent" },
    layers: [],
    selectedIds: [],

    previewMode: "normal",
    explodeAmount: 0,
    snapEnabled: true,
    notice: null,
    canUndo: false,
    canRedo: false,
    projectName: "",
    historyVersion: 0,
    savedVersion: 0,

    setPreviewMode: (mode) => set({ previewMode: mode }),
    setExplodeAmount: (v) => set({ explodeAmount: v }),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    setNotice: (msg) => set({ notice: msg }),
    setProjectName: (name) => set({ projectName: name }),
    markSaved: () => set({ savedVersion: get().historyVersion }),
    loadProject: ({ canvas, layers, name }) => {
      commitSet(() => ({ canvas, layers, selectedIds: [] }));
      set({ projectName: name, savedVersion: get().historyVersion });
    },

    setSelection: (ids_) => set({ selectedIds: ids_ }),
    toggleSelection: (id, additive) =>
      set((s) => {
        if (!additive) return { selectedIds: [id] };
        const has = s.selectedIds.includes(id);
        return {
          selectedIds: has ? s.selectedIds.filter((i) => i !== id) : [...s.selectedIds, id],
        };
      }),
    selectAll: () => set((s) => ({ selectedIds: s.layers.filter((l) => !l.locked).map((l) => l.id) })),
    clearSelection: () => set({ selectedIds: [] }),

    beginTransaction: () => {
      history.pending = snap(get());
    },
    commitTransaction: () => {
      const pending = history.pending;
      history.pending = null;
      if (!pending) return;
      const current = snap(get());
      if (sameSnapshot(pending, current)) return; // gesture produced no change
      if (history.past.length >= HISTORY_LIMIT) history.past.shift();
      history.past.push(pending);
      history.future = [];
      set({ canUndo: true, canRedo: false, historyVersion: get().historyVersion + 1 });
    },
    cancelTransaction: () => {
      history.pending = null;
    },
    undo: () => {
      const prev = history.past.pop();
      if (!prev) return;
      history.future.push(snap(get()));
      set(restore(prev));
      set((s) => ({ historyVersion: s.historyVersion + 1 }));
    },
    redo: () => {
      const next = history.future.pop();
      if (!next) return;
      history.past.push(snap(get()));
      set(restore(next));
      set((s) => ({ historyVersion: s.historyVersion + 1 }));
    },

    setCanvasSize: (width, height) =>
      commitSet((s) => ({ canvas: { ...s.canvas, width, height } })),
    setCanvasBackground: (background) =>
      commitSet((s) => ({ canvas: { ...s.canvas, background } })),
    newCanvas: (canvas) =>
      commitSet(() => ({ canvas, layers: [], selectedIds: [] })),

    addLayers: (layers, select = true) =>
      commitSet((s) => ({
        layers: [...s.layers, ...layers],
        selectedIds: select ? layers.map((l) => l.id) : s.selectedIds,
      })),
    addEmptyLayer: (name) =>
      commitSet((s) => {
        const layer: Layer = {
          id: uid("layer"),
          name: name ?? "",
          type: "empty",
          assetId: null,
          transform: { x: s.canvas.width / 2, y: s.canvas.height / 2, scaleX: 1, scaleY: 1, rotation: 0 },
          opacity: 1,
          visible: true,
          locked: false,
        };
        return { layers: [...s.layers, layer], selectedIds: [layer.id] };
      }),
    deleteSelected: () =>
      commitSet((s) => {
        const ids_ = ids(s.layers, s.selectedIds);
        if (ids_.length === 0) return {};
        return {
          layers: s.layers.filter((l) => !ids_.includes(l.id)),
          selectedIds: [],
        };
      }),
    duplicateSelected: () =>
      commitSet((s) => {
        const ids_ = ids(s.layers, s.selectedIds);
        if (ids_.length === 0) return {};
        const copies = s.layers
          .filter((l) => ids_.includes(l.id))
          .map((l) => duplicateLayer(l, s.layers));
        return {
          layers: [...s.layers, ...copies],
          selectedIds: copies.map((l) => l.id),
        };
      }),
    updateLayer: (id, patch, commit = true) => {
      const apply = (s: EditorState): Partial<EditorState> => ({
        layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      });
      commit ? commitSet(apply) : liveSet(apply);
    },
    updateLayerTransform: (id, t, commit = true) => {
      const apply = (s: EditorState): Partial<EditorState> => ({
        layers: s.layers.map((l) =>
          l.id === id ? { ...l, transform: { ...l.transform, ...t } } : l
        ),
      });
      commit ? commitSet(apply) : liveSet(apply);
    },
    setLayersOpacity: (ids_, opacity, commit = true) => {
      const apply = (s: EditorState): Partial<EditorState> => ({
        layers: s.layers.map((l) => (ids_.includes(l.id) ? { ...l, opacity } : l)),
      });
      commit ? commitSet(apply) : liveSet(apply);
    },
    reorder: (fromIndex, toIndex) =>
      commitSet((s) => {
        const next = [...s.layers];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { layers: next };
      }),
    moveLayerToTop: (id) =>
      commitSet((s) => {
        const idx = s.layers.findIndex((l) => l.id === id);
        if (idx < 0) return {};
        const next = [...s.layers];
        const [moved] = next.splice(idx, 1);
        next.push(moved);
        return { layers: next };
      }),
    moveLayerToBottom: (id) =>
      commitSet((s) => {
        const idx = s.layers.findIndex((l) => l.id === id);
        if (idx < 0) return {};
        const next = [...s.layers];
        const [moved] = next.splice(idx, 1);
        next.unshift(moved);
        return { layers: next };
      }),
    nudgeSelected: (dx, dy) =>
      commitSet((s) => {
        const ids_ = ids(s.layers, s.selectedIds);
        if (ids_.length === 0) return {};
        return {
          layers: s.layers.map((l) =>
            ids_.includes(l.id)
              ? { ...l, transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } }
              : l
          ),
        };
      }),
  };
});
