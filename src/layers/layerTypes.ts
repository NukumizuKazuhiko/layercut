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

export type PreviewMode = "normal" | "occlusion";
