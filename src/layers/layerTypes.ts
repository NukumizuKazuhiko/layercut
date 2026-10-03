export type LayerType = "png" | "svg" | "empty";

/**
 * Layer transform, following the project plan §9.
 * x/y is the layer CENTER in canvas coordinates (rotation pivots around it).
 * width/height are derived: natural size × scaleX/scaleY.
 */
export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** degrees, clockwise */
  rotation: number;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  /** null for empty layers */
  assetId: string | null;
  transform: LayerTransform;
  /** 0..1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Keep the current width/height ratio during numeric and canvas resizing. */
  aspectLocked: boolean;
  /** A hidden layer can still cut the layers below it. */
  occludesWhenHidden: boolean;
  /** Optional per-layer paint overrides; null keeps the imported SVG paint. */
  svgFillColor?: string | null;
  svgStrokeColor?: string | null;
}

export interface CanvasSettings {
  width: number;
  height: number;
  /** "transparent" or any CSS color */
  background: "transparent" | string;
}

/** Layers are stored bottom → top. zIndex equals the array index. */
export interface ProjectSnapshot {
  canvas: CanvasSettings;
  layers: Layer[];
  selectedIds: string[];
}

/**
 * What a whole-document mutation expects; the mutation applies only if the
 * current state still matches every field (no concurrent edit, history or
 * epoch change happened while the replacement was being prepared).
 */
export interface DocumentSnapshot {
  layers: Layer[];
  canvas: CanvasSettings;
  historyVersion: number;
  documentEpoch: number;
}

export type PreviewMode = "normal" | "occlusion";
