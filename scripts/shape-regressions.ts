/**
 * Shape drawing regressions.
 *
 * Run `npm run dev`, then open
 *   http://localhost:5173/scripts/shape-regressions.html
 * and check that the result line ends with PASS.
 *
 * Covers the pure geometry, the SVG document that becomes the layer asset, the
 * full pixel pipeline (raster + occlusion + vector export), the store contract
 * (tool state is not undoable) and the project round-trip.
 */
import { computeOcclusion } from "../src/occlusion/OcclusionEngine";
import { isValidProjectJson, serializeProject } from "../src/project/projectTypes";
import { loadProjectJson } from "../src/project/saveProject";
import { createShapeLayer } from "../src/shapes/createShape";
import {
  constrainDrag,
  defaultDrag,
  isClickDrag,
  resolveShapeStyle,
  shapeGeometry,
} from "../src/shapes/shapeGeometry";
import type { ShapeStyle } from "../src/shapes/shapeTypes";
import { useEditorStore } from "../src/layers/layerStore";
import { useAssetStore } from "../src/assets/assetStore";
import { computeVectorOcclusion } from "../src/vector/svgBoolean";
import { analyzeSvgSafety } from "../src/vector/svgSafety";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const eq = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) throw new Error(`${message}: got ${String(actual)}, want ${String(expected)}`);
};

const filled: ShapeStyle = { fill: "#ff0000", stroke: null, strokeWidth: 0 };
const outlined: ShapeStyle = { fill: "#ff0000", stroke: "#0000ff", strokeWidth: 8 };

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  assert(!doc.querySelector("parsererror"), `generated SVG does not parse: ${svg}`);
  return doc;
}

/** fill pixel reader for a canvas element */
function reader(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return (x: number, y: number) => {
    const i = (y * canvas.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
}

function imageFromSvg(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("generated SVG failed to decode as an image"));
    image.src = url;
  });
}

function geometryTests() {
  const rect = shapeGeometry({ kind: "rect", from: { x: 10, y: 20 }, to: { x: 110, y: 70 }, style: filled });
  eq(rect.d, "M 0,0 H 100 V 50 H 0 Z", "rect path");
  eq(rect.width, 100, "rect natural width");
  eq(rect.height, 50, "rect natural height");
  eq(rect.center.x, 60, "rect centre x");
  eq(rect.center.y, 45, "rect centre y");
  const rectDoc = parse(rect.svg);
  eq(rectDoc.documentElement.getAttribute("viewBox"), "0 0 100 50", "rect viewBox");
  eq(rectDoc.querySelector("path")?.getAttribute("fill"), "#ff0000", "rect fill");

  // a stroke must not be clipped: half of it goes outside the bounding box
  const stroked = shapeGeometry({ kind: "rect", from: { x: 10, y: 20 }, to: { x: 110, y: 70 }, style: outlined });
  eq(stroked.width, 108, "stroked width includes padding");
  eq(stroked.height, 58, "stroked height includes padding");
  eq(stroked.center.x, 60, "stroke padding keeps the centre");
  eq(stroked.origin.x, 6, "stroke padding moves the origin");
  eq(stroked.d, "M 4,4 H 104 V 54 H 4 Z", "stroked rect path is inset");
  eq(parse(stroked.svg).querySelector("path")?.getAttribute("stroke-width"), "8", "stroke width attribute");

  // reversed drag produces the same box
  const reversed = shapeGeometry({ kind: "rect", from: { x: 110, y: 70 }, to: { x: 10, y: 20 }, style: filled });
  eq(reversed.d, rect.d, "reversed drag rect");
  eq(reversed.center.x, rect.center.x, "reversed drag centre");

  const ellipse = shapeGeometry({ kind: "ellipse", from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, style: filled });
  eq((ellipse.d.match(/A /g) ?? []).length, 2, "ellipse uses two arcs");
  assert(ellipse.d.endsWith("Z"), "ellipse is closed");

  // a line follows the drag direction, and is never filled
  const line = shapeGeometry({
    kind: "line",
    from: { x: 0, y: 0 },
    to: { x: 100, y: 50 },
    style: { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 2 },
  });
  eq(line.d, "M 1,1 L 101,51", "line path follows the drag");
  eq(parse(line.svg).querySelector("path")?.getAttribute("fill"), "none", "line is not filled");
  eq(line.width, 102, "line natural width");
  const flipped = shapeGeometry({
    kind: "line",
    from: { x: 100, y: 50 },
    to: { x: 0, y: 0 },
    style: { fill: null, stroke: "#00ff00", strokeWidth: 2 },
  });
  eq(flipped.d, "M 101,51 L 1,1", "line keeps the drag direction");

  const hexagon = shapeGeometry({ kind: "polygon", from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, style: filled, sides: 6 });
  eq((hexagon.d.match(/L /g) ?? []).length, 5, "hexagon vertex count");
  assert(hexagon.d.startsWith("M 50,0"), `hexagon first vertex on top: ${hexagon.d}`);
  const star = shapeGeometry({ kind: "star", from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, style: filled, sides: 5 });
  eq((star.d.match(/L /g) ?? []).length, 9, "star vertex count");
  assert(star.d.includes("64.695,29.775"), `star inner vertex: ${star.d}`);

  // sides are clamped into the supported range
  const clamped = shapeGeometry({ kind: "polygon", from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, style: filled, sides: 99 });
  eq((clamped.d.match(/L /g) ?? []).length, 11, "sides clamped to the maximum");

  // a degenerate drag still yields a drawable path
  const degenerate = shapeGeometry({ kind: "rect", from: { x: 5, y: 5 }, to: { x: 5, y: 5 }, style: filled });
  eq(degenerate.width, 1, "degenerate width clamped");
  assert(degenerate.d.length > 0, "degenerate path exists");
}

function dragTests() {
  const square = constrainDrag({ x: 0, y: 0 }, { x: 100, y: 20 }, { square: true });
  eq(square.to.x, 100, "shift keeps the long axis");
  eq(square.to.y, 100, "shift equalises the short axis");

  const centred = constrainDrag({ x: 50, y: 50 }, { x: 80, y: 60 }, { fromCenter: true });
  eq(centred.from.x, 20, "alt mirrors the start");
  eq(centred.from.y, 40, "alt mirrors the start vertically");
  eq(centred.to.x, 80, "alt keeps the end");

  const centredSquare = constrainDrag({ x: 50, y: 50 }, { x: 80, y: 60 }, { fromCenter: true, square: true });
  eq(centredSquare.from.x, 20, "alt+shift square");
  eq(centredSquare.from.y, 20, "alt+shift square vertically");
  eq(centredSquare.to.y, 80, "alt+shift square end");

  const negative = constrainDrag({ x: 0, y: 0 }, { x: -100, y: -20 }, { square: true });
  eq(negative.to.x, -100, "negative drag keeps direction");
  eq(negative.to.y, -100, "negative drag keeps direction vertically");

  assert(isClickDrag({ x: 0, y: 0 }, { x: 1, y: 1 }), "tiny drag is a click");
  assert(!isClickDrag({ x: 0, y: 0 }, { x: 40, y: 40 }), "real drag is not a click");
  const fallback = defaultDrag({ x: 300, y: 400 });
  eq(fallback.to.x - fallback.from.x, 200, "click creates a default-sized shape");
  eq((fallback.from.x + fallback.to.x) / 2, 300, "default shape is centred on the click");

  // paint resolution is shared with the live preview, and rejects junk colours
  const resolved = resolveShapeStyle("rect", { fill: "red", stroke: "#00FF00", strokeWidth: -3 });
  eq(resolved.fill, null, "invalid fill colour is dropped");
  eq(resolved.stroke, "#00ff00", "stroke colour is normalised");
  eq(resolved.strokeWidth, 0, "negative stroke width is clamped");
  eq(resolveShapeStyle("line", { fill: "#ff0000", stroke: null, strokeWidth: 4 }).fill, null, "lines are never filled");
}

async function pixelTests() {
  const store = useEditorStore.getState();
  store.newCanvas({ width: 400, height: 400, background: "transparent" });
  store.setShapeStyle({ fill: "#ff0000", stroke: null, strokeWidth: 0 });

  // --- the generated document is vector-export safe and rasterizes as drawn
  const background = await createShapeLayer({
    kind: "rect",
    from: { x: 100, y: 100 },
    to: { x: 300, y: 200 },
    style: filled,
    sides: 6,
    name: "background",
  });
  useEditorStore.getState().addLayers([background]);
  const backgroundAsset = useAssetStore.getState().assets[background.assetId!];
  assert(backgroundAsset, "shape asset registered");
  eq(backgroundAsset.kind, "svg", "shape asset is an SVG");
  eq(backgroundAsset.naturalWidth, 200, "asset natural width");
  eq(backgroundAsset.naturalHeight, 100, "asset natural height");
  eq(analyzeSvgSafety(backgroundAsset.svgText ?? "").safe, true, "generated SVG is vector-safe");

  const single = computeOcclusion([background], { width: 400, height: 400, background: "transparent" }, {
    [backgroundAsset.id]: backgroundAsset,
  });
  const backgroundRaster = single.byLayerId.get(background.id)!;
  assert(backgroundRaster, "shape took part in occlusion");
  const backgroundPixels = reader(backgroundRaster);
  eq(backgroundPixels(200, 150).join(), "255,0,0,255", "shape rasterized where it was drawn");
  eq(backgroundPixels(50, 50)[3], 0, "shape rasterized nowhere else");
  eq(backgroundPixels(299, 101).join(), "255,0,0,255", "shape covers its full bounding box");

  // --- a shape cuts the layer below it like any other layer
  const cover = await createShapeLayer({
    kind: "rect",
    from: { x: 180, y: 130 },
    to: { x: 260, y: 175 },
    style: { fill: "#00ff00", stroke: null, strokeWidth: 0 },
    sides: 6,
    name: "cover",
  });
  useEditorStore.getState().addLayers([cover]);
  const coverAsset = useAssetStore.getState().assets[cover.assetId!];
  const assets = { [backgroundAsset.id]: backgroundAsset, [coverAsset.id]: coverAsset };
  const both = computeOcclusion([background, cover], { width: 400, height: 400, background: "transparent" }, assets);
  const cut = reader(both.byLayerId.get(background.id)!);
  const top = reader(both.byLayerId.get(cover.id)!);
  eq(cut(220, 150)[3], 0, "drawn shape occludes the layer below");
  eq(cut(150, 150).join(), "255,0,0,255", "uncovered area survives");
  eq(top(220, 150).join(), "0,255,0,255", "cover paints its own area");

  // --- shape geometry survives the vector (Paper.js) path
  const vector = computeVectorOcclusion([background, cover], assets, { width: 400, height: 400, background: "transparent" });
  const vectorSvg = vector.byLayerId.get(background.id);
  assert(vectorSvg && vectorSvg.includes("<path"), "shape exports as vector geometry");
  const vectorImage = await imageFromSvg(vectorSvg!);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 400;
  canvas.getContext("2d")!.drawImage(vectorImage, 0, 0, 400, 400);
  const vectorPixels = reader(canvas);
  eq(vectorPixels(220, 150)[3], 0, "vector result keeps the cut-out");
  eq(vectorPixels(150, 150).slice(0, 3).join(), "255,0,0", "vector result keeps the fill");
}

async function storeTests() {
  const store = useEditorStore.getState();
  const before = store.layers.length;

  // tool state is view state: it never becomes an undo step
  store.setActiveTool("star");
  eq(useEditorStore.getState().activeTool, "star", "tool armed");
  const historyBefore = useEditorStore.getState().historyVersion;
  store.setShapeSides(7);
  store.setShapeStyle({ stroke: "#123456", strokeWidth: 6.25 });
  eq(useEditorStore.getState().historyVersion, historyBefore, "tool options are not undo steps");
  eq(useEditorStore.getState().shapeSides, 7, "sides stored");
  eq(useEditorStore.getState().shapeStyle.strokeWidth, 6.25, "stroke width stored");
  store.setShapeSides(99);
  eq(useEditorStore.getState().shapeSides, 12, "sides clamped by the store");
  store.setShapeStyle({ stroke: "javascript:alert(1)" });
  eq(useEditorStore.getState().shapeStyle.stroke, null, "store rejects a non-colour string");

  // arming a drawing tool leaves the occlusion preview (drawing only works in normal mode)
  store.setPreviewMode("occlusion");
  eq(useEditorStore.getState().activeTool, "select", "occlusion preview disarms the tool");
  store.setActiveTool("ellipse");
  eq(useEditorStore.getState().previewMode, "normal", "arming a tool returns to normal preview");

  const shape = await createShapeLayer({
    kind: "star",
    from: { x: 0, y: 0 },
    to: { x: 120, y: 120 },
    style: filled,
    sides: 5,
    name: "star",
  });
  useEditorStore.getState().addLayers([shape]);
  eq(useEditorStore.getState().layers.length, before + 1, "drawn layer added");
  eq(useEditorStore.getState().layers.at(-1)!.type, "svg", "drawn layer is an svg layer");
  useEditorStore.getState().undo();
  eq(useEditorStore.getState().layers.length, before, "drawn layer is one undo step");
  eq(useEditorStore.getState().activeTool, "ellipse", "undo keeps the armed tool");
  useEditorStore.getState().redo();
  eq(useEditorStore.getState().layers.length, before + 1, "redo restores the drawn layer");
  store.setActiveTool("select");
}

async function projectTests() {
  const canvas = { width: 400, height: 400, background: "transparent" as const };
  const layers = useEditorStore.getState().layers;
  const assets = useAssetStore.getState().assets;
  const serialized = await serializeProject("shape test", canvas, layers, assets);
  assert(isValidProjectJson(serialized), "project with drawn shapes is valid");
  assert(serialized.layers.every((l) => l.type !== "svg" || !!serialized.assets[l.assetId!]), "shape assets embedded");
  await loadProjectJson(JSON.stringify(serialized));
  const reloaded = useEditorStore.getState().layers;
  eq(reloaded.length, layers.length, "layers survive the round-trip");
  const shapeLayer = reloaded.find((l) => l.name === "background")!;
  const shapeAsset = useAssetStore.getState().assets[shapeLayer.assetId!];
  assert(shapeAsset?.svgText?.includes("M 0,0 H 200 V 100"), "shape geometry survives the round-trip");
  assert(analyzeSvgSafety(shapeAsset.svgText ?? "").safe, "reloaded shape is still vector-safe");
}

async function main() {
  geometryTests();
  dragTests();
  await pixelTests();
  await storeTests();
  await projectTests();
  document.getElementById("result")!.textContent =
    "PASS: geometry, drag modifiers, raster, occlusion, vector export, tool state, undo, project round-trip";
}

main().catch((error) => {
  document.getElementById("result")!.textContent = `FAIL: ${error}`;
});
