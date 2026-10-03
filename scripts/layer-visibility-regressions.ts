import { computeOcclusion } from "../src/occlusion/OcclusionEngine";
import { rasterizeComposite } from "../src/export/exportPNG";
import { computeVectorOcclusion } from "../src/vector/svgBoolean";
import { useEditorStore } from "../src/layers/layerStore";
import { useAssetStore } from "../src/assets/assetStore";
import { mergeCurrentLayers } from "../src/layers/mergeLayers";
import type { Layer } from "../src/layers/layerTypes";
import type { LayerAsset } from "../src/assets/assetStore";

const canvas = { width: 100, height: 100, background: "transparent" };
const svg = (color: string, size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`;
const pixel = (source: HTMLCanvasElement, x: number, y: number) => source.getContext("2d")!.getImageData(x, y, 1, 1).data;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

async function image(source: string): Promise<HTMLImageElement> {
  const element = new Image();
  element.src = `data:image/svg+xml,${encodeURIComponent(source)}`;
  await element.decode();
  return element;
}

function layer(id: string): Layer {
  return {
    id, name: id, type: "svg", assetId: id, visible: true, locked: false,
    aspectLocked: false, occludesWhenHidden: false, opacity: 1,
    transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
  };
}

async function asset(id: string, color: string, size: number): Promise<LayerAsset> {
  const svgText = svg(color, size);
  return {
    id, kind: "svg", fileName: `${id}.svg`, mimeType: "image/svg+xml",
    naturalWidth: size, naturalHeight: size, bitmap: await image(svgText), previewUrl: "", svgText,
  };
}

async function svgPixels(source: string): Promise<HTMLCanvasElement> {
  const img = await image(source);
  const output = document.createElement("canvas");
  output.width = output.height = 100;
  output.getContext("2d")!.drawImage(img, 0, 0);
  return output;
}

export async function runLayerVisibilityRegressions() {
  const assets = { bottom: await asset("bottom", "red", 100), top: await asset("top", "blue", 50) };
  const bottom = layer("bottom");
  const top = { ...layer("top"), visible: false, occludesWhenHidden: true };
  const results: { name: string; pass: boolean; detail?: string }[] = [];
  const test = async (name: string, run: () => void | Promise<void>) => {
    try { await run(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, detail: String(error) }); }
  };

  await test("hidden raster occluder cuts lower output but exports no own layer", () => {
    const result = computeOcclusion([bottom, top], canvas, assets);
    const lower = result.byLayerId.get("bottom")!;
    assert(pixel(lower, 50, 50)[3] === 0 && pixel(lower, 10, 10)[3] === 255, "incorrect raster mask");
    assert(!result.byLayerId.has("top"), "hidden layer has an output");
  });
  await test("ordinary hidden layer does not cut lower output", () => {
    const lower = computeOcclusion([bottom, { ...top, occludesWhenHidden: false }], canvas, assets).byLayerId.get("bottom")!;
    assert(pixel(lower, 50, 50)[3] === 255, "ordinary hidden layer still occludes");
  });
  await test("composite export matches retained occlusion", () => {
    const output = rasterizeComposite([bottom, top], canvas, assets, 1);
    assert(pixel(output, 50, 50)[3] === 0 && pixel(output, 10, 10)[3] === 255, "composite ignored hidden occluder");
  });
  await test("hidden vector occluder cuts lower SVG but exports no own layer", async () => {
    const result = computeVectorOcclusion([bottom, top], assets, canvas);
    const lower = await svgPixels(result.byLayerId.get("bottom")!);
    assert(pixel(lower, 50, 50)[3] === 0 && pixel(lower, 10, 10)[3] === 255, "incorrect vector mask");
    assert(!result.byLayerId.has("top"), "hidden vector layer has an output");
  });
  await test("locked width edit preserves the current ratio", () => {
    const store = useEditorStore.getState();
    store.loadProject({ canvas, layers: [{ ...bottom, aspectLocked: true, transform: { ...bottom.transform, scaleX: 0.5, scaleY: 0.75 } }], name: "test" });
    store.setLayerDimension("bottom", "width", 100, { width: 100, height: 100 });
    const resized = useEditorStore.getState().layers[0].transform;
    assert(resized.scaleX === 1 && resized.scaleY === 1.5, "aspect ratio was not preserved");
  });
  await test("merge bakes a hidden triangular cutter into a transparent circular PNG and undo restores sources", async () => {
    const circle = await image('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="red"/></svg>');
    const triangle = await image('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><polygon points="25,3 3,47 47,47" fill="blue"/></svg>');
    const sourceAssets = {
      circle: { ...assets.bottom, id: "circle", naturalWidth: 80, naturalHeight: 80, bitmap: circle },
      triangle: { ...assets.top, id: "triangle", naturalWidth: 50, naturalHeight: 50, bitmap: triangle },
    };
    useAssetStore.getState().put(sourceAssets.circle);
    useAssetStore.getState().put(sourceAssets.triangle);
    const sourceLayers = [
      { ...layer("circle"), type: "png" as const },
      { ...layer("triangle"), type: "png" as const, visible: false, occludesWhenHidden: true },
    ];
    useEditorStore.getState().loadProject({ canvas, layers: sourceLayers, name: "merge-test" });
    assert(await mergeCurrentLayers("merged"), "merge did not complete");
    const merged = useEditorStore.getState().layers;
    assert(merged.length === 1 && merged[0].type === "png", "sources were not replaced by one PNG layer");
    const mergedAsset = useAssetStore.getState().assets[merged[0].assetId!];
    assert(mergedAsset.sourceBlob?.type === "image/png", "merged PNG bytes are unavailable for project save");
    const rendered = document.createElement("canvas");
    rendered.width = rendered.height = 100;
    rendered.getContext("2d")!.drawImage(mergedAsset.bitmap, 0, 0);
    assert(pixel(rendered, 50, 50)[3] === 0, "triangle hole is not transparent");
    assert(pixel(rendered, 50, 20)[3] === 255, "circle exterior disappeared");
    assert(pixel(rendered, 5, 5)[3] === 0, "background was baked into the PNG");
    useEditorStore.getState().undo();
    assert(useEditorStore.getState().layers.length === 2, "undo did not restore source layers");
  });
  return { passed: results.filter((result) => result.pass).length, total: results.length, results };
}
