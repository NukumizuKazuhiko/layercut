/**
 * Dictionary keys for the drawing tools, shared by the toolbar, the options
 * row, the canvas status hint and the layer names of newly drawn shapes.
 */
import type { Dict } from "../i18n/zh";
import type { EditorTool, ShapeKind } from "./shapeTypes";

export const SHAPE_NAME_KEY: Record<ShapeKind, keyof Dict> = {
  rect: "shapeRect",
  ellipse: "shapeEllipse",
  line: "shapeLine",
  polygon: "shapePolygon",
  star: "shapeStar",
};

export const TOOL_NAME_KEY: Record<EditorTool, keyof Dict> = {
  select: "toolSelect",
  ...SHAPE_NAME_KEY,
};
