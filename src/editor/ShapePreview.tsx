/**
 * Live preview of the shape currently being dragged.
 *
 * It draws the very same path data the generated SVG will contain, so what the
 * user sees during the drag is exactly what lands on the canvas.
 */
import { Path } from "react-konva";
import { resolveShapeStyle, shapeGeometry } from "../shapes/shapeGeometry";
import type { Point, ShapeKind, ShapeStyle } from "../shapes/shapeTypes";

export interface ShapeDrag {
  from: Point;
  to: Point;
}

export function ShapePreview({
  kind,
  drag,
  style,
  sides,
}: {
  kind: ShapeKind;
  drag: ShapeDrag;
  style: ShapeStyle;
  sides: number;
}) {
  const geometry = shapeGeometry({ kind, from: drag.from, to: drag.to, style, sides });
  const paint = resolveShapeStyle(kind, style);
  return (
    <Path
      data={geometry.d}
      x={geometry.origin.x}
      y={geometry.origin.y}
      fill={paint.fill ?? undefined}
      stroke={paint.stroke ?? undefined}
      strokeWidth={paint.strokeWidth}
      strokeLinejoin="round"
      strokeLinecap={kind === "line" ? "round" : undefined}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}
