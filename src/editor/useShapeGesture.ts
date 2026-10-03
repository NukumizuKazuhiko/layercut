/**
 * Drag-to-draw gesture for the shape tools.
 *
 * Pointer events go through the canvas container (not Konva) so a drag that
 * leaves the canvas keeps tracking, exactly like the existing pan gesture.
 * The gesture only ever produces one committed action: adding a layer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../layers/layerStore";
import { dropPointToCanvas } from "../import/importFiles";
import { createShapeLayer } from "../shapes/createShape";
import { constrainDrag, defaultDrag, isClickDrag } from "../shapes/shapeGeometry";
import { isShapeTool, type Point, type ShapeKind } from "../shapes/shapeTypes";
import { useViewportStore } from "./ViewportManager";
import type { ShapeDrag } from "./ShapePreview";

/** Drag coordinates are rounded so generated geometry keeps tidy numbers. */
function roundPoint(p: Point): Point {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

export interface ShapeGesture {
  /** Non-null while a shape is being dragged (drives the live preview). */
  drag: ShapeDrag | null;
  /** Returns true when the event started a shape drag and must not pan. */
  startDraw: (e: React.MouseEvent) => boolean;
}

export function useShapeGesture({
  containerRef,
  nameFor,
  failureNotice,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  nameFor: (kind: ShapeKind) => string;
  /** localized text shown when a shape cannot be built */
  failureNotice: string;
}): ShapeGesture {
  const [drag, setDrag] = useState<ShapeDrag | null>(null);
  // kept in a ref as well so the mouseup handler reads the final geometry
  // without re-subscribing to every pointer move
  const pending = useRef<ShapeDrag | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const commit = useCallback(
    (kind: ShapeKind, gesture: ShapeDrag) => {
      const { shapeStyle, shapeSides, layers } = useEditorStore.getState();
      void createShapeLayer({
        kind,
        from: gesture.from,
        to: gesture.to,
        style: shapeStyle,
        sides: shapeSides,
        name: `${nameFor(kind)} ${layers.length + 1}`,
      })
        .then((layer) => useEditorStore.getState().addLayers([layer]))
        .catch((error) => {
          console.error("Shape creation failed", error);
          useEditorStore.getState().setNotice(`⚠ ${failureNotice}`);
        });
    },
    [failureNotice, nameFor]
  );

  const startDraw = useCallback(
    (e: React.MouseEvent): boolean => {
      const container = containerRef.current;
      const state = useEditorStore.getState();
      if (!container || !isShapeTool(state.activeTool) || e.button !== 0) return false;
      const kind = state.activeTool;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const viewport = useViewportStore.getState();
      const origin = dropPointToCanvas(e.clientX, e.clientY, rect, viewport);

      /** Apply the live modifier keys to a raw pointer position. */
      const apply = (p: Point, shift: boolean, alt: boolean): ShapeDrag => {
        const c = constrainDrag(origin, p, { square: shift, fromCenter: alt });
        return { from: roundPoint(c.from), to: roundPoint(c.to) };
      };

      const initial: ShapeDrag = { from: roundPoint(origin), to: roundPoint(origin) };
      pending.current = initial;
      setDrag(initial);

      const onMove = (ev: MouseEvent) => {
        const p = dropPointToCanvas(ev.clientX, ev.clientY, rect, viewport);
        const next = apply(p, ev.shiftKey, ev.altKey);
        pending.current = next;
        setDrag(next);
      };

      const cleanup = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("blur", onCancel);
        cleanupRef.current = null;
      };

      /** Commit the gesture: one added layer, or nothing when cancelled. */
      const finish = (gesture: ShapeDrag) => {
        cleanup();
        pending.current = null;
        setDrag(null);
        commit(kind, gesture);
      };

      const onUp = () => {
        const raw = pending.current ?? initial;
        if (!isClickDrag(raw.from, raw.to)) {
          finish(raw);
          return;
        }
        // A click without a drag still produces a usable default-sized shape.
        const fallback = defaultDrag(origin);
        finish({ from: roundPoint(fallback.from), to: roundPoint(fallback.to) });
      };

      const onCancel = () => {
        cleanup();
        pending.current = null;
        setDrag(null);
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") onCancel();
      };

      cleanupRef.current = cleanup;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("keydown", onKey);
      window.addEventListener("blur", onCancel);
      return true;
    },
    [commit, containerRef]
  );

  return { drag, startDraw };
}
