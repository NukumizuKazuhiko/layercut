import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Image as KonvaImage, Layer as KonvaLayer, Line as KonvaLine, Rect, Stage } from "react-konva";
import type { Layer } from "../layers/layerTypes";
import { useEditorStore } from "../layers/layerStore";
import { useAssetStore, type LayerAsset } from "../assets/assetStore";
import { validSelection } from "../layers/layerUtils";
import { getLayerAABB, type AABB } from "../utils/geometry";
import { getCheckerTile } from "../utils/canvas";
import { useViewportStore } from "./ViewportManager";
import { SelectionTransformer, collectSnapTargets, snapAABB } from "./TransformManager";
import { importFiles } from "../import/importFiles";
import { computeOcclusion, type OcclusionResult } from "../occlusion/OcclusionEngine";

interface Guide {
  v: number | null;
  h: number | null;
}

// snap guides are emitted from Konva drag handlers via this tiny pub/sub so
// that dragging does not re-render every layer node
type GuideListener = (g: Guide | null) => void;
let guideListener: GuideListener | null = null;
function emitGuide(g: Guide | null) {
  guideListener?.(g);
}

// set while a viewport pan gesture is active, so node mousedown ignores it
let isPanning = false;

// ---------------------------------------------------------------------------
// Single interactive layer node (Normal preview mode)
// ---------------------------------------------------------------------------
function LayerNode({
  layer,
  asset,
  nodeRefs,
}: {
  layer: Layer;
  asset: LayerAsset | null;
  nodeRefs: React.MutableRefObject<Record<string, Konva.Image | null>>;
}) {
  const interactive = useEditorStore((s) => s.previewMode === "normal");

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (isPanning) return;
      const s = useEditorStore.getState();
      const additive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
      const selected = validSelection(s.layers, s.selectedIds);
      if (additive) {
        s.toggleSelection(layer.id, true);
      } else if (!selected.includes(layer.id)) {
        s.setSelection([layer.id]);
      }
      // else keep selection — lets a group drag move all selected nodes
    },
    [layer.id]
  );

  const handleDragStart = useCallback(
    (_e: KonvaEventObject<MouseEvent>) => {
      const s = useEditorStore.getState();
      s.beginTransaction();
      const ids = validSelection(s.layers, s.selectedIds);
      const origin = new Map<string, { x: number; y: number }>();
      for (const l of s.layers) {
        if (ids.includes(l.id)) origin.set(l.id, { x: l.transform.x, y: l.transform.y });
      }
      if (!origin.has(layer.id)) {
        origin.set(layer.id, { x: layer.transform.x, y: layer.transform.y });
      }
      nodeRefs.current[layer.id]?.setAttr("__dragOrigin", origin);
    },
    [layer.id, layer.transform.x, layer.transform.y, nodeRefs]
  );

  const handleDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      const origin: Map<string, { x: number; y: number }> = node.getAttr("__dragOrigin");
      const start = origin?.get(layer.id);
      if (!start) return;

      const s = useEditorStore.getState();
      const vp = useViewportStore.getState();
      let cx = node.x();
      let cy = node.y();
      let guide: Guide = { v: null, h: null };

      if (s.snapEnabled) {
        // candidate AABB of the dragged layer at the pointer position
        const aabb =
          getLayerAABB(
            { ...layer, transform: { ...layer.transform, x: cx, y: cy } },
            asset ? { width: asset.naturalWidth, height: asset.naturalHeight } : null
          ) ?? { left: cx, top: cy, right: cx, bottom: cy };

        const exclude = new Set(validSelection(s.layers, s.selectedIds));
        const allAssets = useAssetStore.getState().assets;
        const others: AABB[] = [];
        for (const l of s.layers) {
          if (!l.visible || exclude.has(l.id)) continue;
          const a = getLayerAABB(
            l,
            l.assetId && allAssets[l.assetId]
              ? {
                  width: allAssets[l.assetId].naturalWidth,
                  height: allAssets[l.assetId].naturalHeight,
                }
              : null
          );
          if (a) others.push(a);
        }
        const snap = snapAABB(aabb, collectSnapTargets(s.canvas, others, exclude), 8 / vp.scale);
        cx += snap.dx;
        cy += snap.dy;
        node.position({ x: cx, y: cy });
        guide = { v: snap.vLine, h: snap.hLine };
      }
      emitGuide(guide);

      const dx = cx - start.x;
      const dy = cy - start.y;
      for (const [id, o] of origin) {
        s.updateLayerTransform(id, { x: o.x + dx, y: o.y + dy }, false);
      }
    },
    [asset, layer]
  );

  const handleDragEnd = useCallback(() => {
    emitGuide(null);
    useEditorStore.getState().commitTransaction();
  }, []);

  // node transform write-back is handled centrally in SelectionTransformer
  // (one transaction per gesture); nothing to do on the node itself.

  if (!asset) return null; // empty layers render nothing on canvas

  const t = layer.transform;
  return (
    <KonvaImage
      id={layer.id}
      image={asset.bitmap as CanvasImageSource}
      x={t.x}
      y={t.y}
      offsetX={asset.naturalWidth / 2}
      offsetY={asset.naturalHeight / 2}
      scaleX={t.scaleX}
      scaleY={t.scaleY}
      rotation={t.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      listening={interactive && !layer.locked}
      draggable={interactive && !layer.locked}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      ref={(node) => {
        nodeRefs.current[layer.id] = node;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Occlusion preview (Separated mode, project plan §4): stacked per-layer
// occluded rasters, with dimming + explode offsets for inspection.
// ---------------------------------------------------------------------------
function OcclusionPreview() {
  const layers = useEditorStore((s) => s.layers);
  const canvas = useEditorStore((s) => s.canvas);
  const explode = useEditorStore((s) => s.explodeAmount);
  const selectionKey = useEditorStore((s) => validSelection(s.layers, s.selectedIds).join(","));
  const assets = useAssetStore((s) => s.assets);
  const [result, setResult] = useState<OcclusionResult | null>(null);

  useEffect(() => {
    setResult(computeOcclusion(layers, canvas, assets, 1));
  }, [layers, canvas, assets]);

  const selected = new Set(selectionKey ? selectionKey.split(",") : []);
  const dimOthers = selected.size > 0;

  return (
    <>
      {layers.map((layer, i) => {
        if (!layer.visible) return null;
        const raster = result?.byLayerId.get(layer.id);
        if (!raster) return null;
        const dim = dimOthers && !selected.has(layer.id);
        return (
          <KonvaImage
            key={layer.id}
            image={raster as unknown as HTMLImageElement}
            x={i * explode}
            y={0}
            listening={false}
            opacity={dim ? 0.12 : 1}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// CanvasEditor
// ---------------------------------------------------------------------------
export function CanvasEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, Konva.Image | null>>({});
  const spaceHeldRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);

  const canvas = useEditorStore((s) => s.canvas);
  const layers = useEditorStore((s) => s.layers);
  const previewMode = useEditorStore((s) => s.previewMode);
  const stageWidth = useViewportStore((s) => s.stageWidth);
  const stageHeight = useViewportStore((s) => s.stageHeight);
  const scale = useViewportStore((s) => s.scale);
  const vpX = useViewportStore((s) => s.x);
  const vpY = useViewportStore((s) => s.y);
  const assets = useAssetStore((s) => s.assets);

  // guide pub/sub (only while dragging)
  useEffect(() => {
    guideListener = (g) => setGuide(g);
    return () => {
      guideListener = null;
    };
  }, []);

  // stage size tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      useViewportStore.getState().setStageSize(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // wheel zoom (needs a non-passive native listener)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.pow(1.0015, -e.deltaY);
      useViewportStore
        .getState()
        .zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // space bar pans
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // fit view on first layout and whenever canvas size changes
  const fitKey = `${canvas.width}x${canvas.height}`;
  const lastFitKey = useRef("");
  useEffect(() => {
    if (stageWidth <= 0 || stageHeight <= 0) return;
    if (lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    useViewportStore.getState().fit(canvas.width, canvas.height);
  }, [fitKey, stageWidth, stageHeight, canvas.width, canvas.height]);

  const startPan = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1 && !(e.button === 0 && spaceHeldRef.current)) return;
    e.preventDefault();
    isPanning = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const { x, y } = useViewportStore.getState();
    const onMove = (ev: MouseEvent) => {
      useViewportStore
        .getState()
        .set({ x: x + ev.clientX - startX, y: y + ev.clientY - startY });
    };
    const onUp = () => {
      isPanning = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    void importFiles(files);
  }, []);

  const handleStageMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (isPanning) return;
    if (e.target === e.target.getStage()) {
      useEditorStore.getState().clearSelection();
    }
  }, []);

  const checker = getCheckerTile();
  const isTransparent = canvas.background === "transparent";
  const safeScale = scale || 1;

  return (
    <div
      className={`canvas-area${spaceHeld ? " panning" : ""}`}
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={startPan}
      onContextMenu={(e) => e.preventDefault()}
    >
      {layers.length === 0 && <div className="canvas-empty-hint">PNG / SVG ⬇</div>}
      <Stage
        width={stageWidth}
        height={stageHeight}
        scaleX={safeScale}
        scaleY={safeScale}
        x={vpX}
        y={vpY}
        onMouseDown={handleStageMouseDown}
      >
        {/* canvas paper: checkerboard or solid background */}
        <KonvaLayer listening={false}>
          <Rect
            x={0}
            y={0}
            width={canvas.width}
            height={canvas.height}
            fill={isTransparent ? undefined : canvas.background}
            fillPatternImage={isTransparent ? (checker as unknown as HTMLImageElement) : undefined}
            fillPatternScaleX={1 / safeScale}
            fillPatternScaleY={1 / safeScale}
            stroke="#43454e"
            strokeWidth={1 / safeScale}
          />
        </KonvaLayer>

        {/* Normal mode: interactive layer nodes */}
        <KonvaLayer visible={previewMode === "normal"}>
          {layers.map((layer) => (
            <LayerNode
              key={layer.id}
              layer={layer}
              asset={layer.assetId ? assets[layer.assetId] ?? null : null}
              nodeRefs={nodeRefs}
            />
          ))}
        </KonvaLayer>

        {/* Occlusion mode: per-layer visible rasters */}
        <KonvaLayer listening={false} visible={previewMode === "occlusion"}>
          <OcclusionPreview />
        </KonvaLayer>

        {/* transformer + snap guides */}
        <KonvaLayer>
          {guide?.v != null && (
            <GuideLine vertical at={guide.v} canvas={canvas} scale={safeScale} />
          )}
          {guide?.h != null && (
            <GuideLine vertical={false} at={guide.h} canvas={canvas} scale={safeScale} />
          )}
          {previewMode === "normal" && <SelectionTransformer nodeRefs={nodeRefs} />}
        </KonvaLayer>
      </Stage>
    </div>
  );
}

function GuideLine({
  vertical,
  at,
  canvas,
  scale,
}: {
  vertical: boolean;
  at: number;
  canvas: { width: number; height: number };
  scale: number;
}) {
  const margin = 2000;
  const points = vertical
    ? [at, -margin, at, canvas.height + margin]
    : [-margin, at, canvas.width + margin, at];
  return (
    <KonvaLine
      points={points}
      stroke="#ff5bd6"
      strokeWidth={1 / scale}
      dash={[4 / scale, 4 / scale]}
      listening={false}
    />
  );
}
