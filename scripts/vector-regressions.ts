import { importLayerGeometry } from "../src/vector/svgNormalize";
import { computeVectorOcclusion } from "../src/vector/svgBoolean";
import type { Layer } from "../src/layers/layerTypes";
import type { LayerAsset } from "../src/assets/assetStore";

const wrap = (body: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" ${attrs}>${body}</svg>`;
const asset = (svgText: string): LayerAsset => ({ id: "a", kind: "svg", fileName: "test.svg", mimeType: "image/svg+xml", naturalWidth: 100, naturalHeight: 100, bitmap: null as never, previewUrl: "", svgText });
const layer = (id = "test", opacity = 1): Layer => ({ id, name: id, type: "svg", assetId: "a", visible: true, locked: false, opacity, transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 } });
const canvas = { width: 100, height: 100, background: "transparent" };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

async function pixels(svg: string): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("SVG decode failed")); image.src = url; });
    const c = document.createElement("canvas"); c.width = c.height = 100;
    const ctx = c.getContext("2d")!; ctx.drawImage(image, 0, 0, 100, 100);
    return ctx.getImageData(0, 0, 100, 100).data;
  } finally { URL.revokeObjectURL(url); }
}
const pixel = (data: Uint8ClampedArray, x: number, y: number) => Array.from(data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4));

export async function runVectorRegressions() {
  const results: { name: string; pass: boolean; detail?: string }[] = [];
  const test = async (name: string, body: () => void | Promise<void>) => {
    try { await body(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, detail: String(e) }); }
  };
  await test("viewport whitespace and offset", () => {
    const normalized = importLayerGeometry(asset(wrap('<rect x="10" y="10" width="20" height="20" fill="#ff0000"/>')), layer());
    const b = normalized?.filledGeometry?.bounds;
    assert(b && Math.abs(b.x - 10) < .01 && Math.abs(b.y - 10) < .01 && Math.abs(b.width - 20) < .01, `unexpected bounds ${b}`);
  });
  await test("nonzero viewBox and preserveAspectRatio", async () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="10 20 200 100"><rect x="10" y="20" width="200" height="100" fill="#ff0000"/></svg>';
    const svg = computeVectorOcclusion([layer()], { a: asset(source) }, canvas).byLayerId.get("test")!;
    const data = await pixels(svg);
    assert(pixel(data, 50, 10)[3] === 0 && pixel(data, 50, 50)[0] === 255 && pixel(data, 50, 90)[3] === 0, "meet letterboxing was lost");
  });
  await test("opacity zero does not occlude and exports empty SVG", async () => {
    const a = asset(wrap('<rect width="100" height="100" fill="#ff0000"/>'));
    const result = computeVectorOcclusion([layer("bottom"), layer("top", 0)], { a }, canvas);
    const top = await pixels(result.byLayerId.get("top")!);
    const bottom = await pixels(result.byLayerId.get("bottom")!);
    assert(pixel(top, 50, 50)[3] === 0 && pixel(bottom, 50, 50)[3] === 255, "zero-opacity layer erased lower geometry");
  });
  await test("partial layer alpha rejected", () => {
    let rejected = false;
    try { computeVectorOcclusion([layer("test", .5)], { a: asset(wrap('<rect width="100" height="100"/>')) }, canvas); } catch (e) { rejected = (e as { code?: string }).code === "svg_partial_opacity"; }
    assert(rejected, "partial alpha was silently flattened");
  });
  await test("partial SVG source alpha rejected", () => {
    let rejected = false;
    try { computeVectorOcclusion([layer()], { a: asset(wrap('<rect width="100" height="100" fill-opacity="0.5"/>')) }, canvas); } catch (e) { rejected = (e as { code?: string }).code === "svg_partial_opacity"; }
    assert(rejected, "source partial alpha was silently flattened");
  });
  await test("multicolor fills and stroke-only sibling preserved", async () => {
    const a = asset(wrap('<rect x="10" y="10" width="30" height="30" fill="#ff0000"/><rect x="50" y="10" width="30" height="30" fill="#0000ff"/><path d="M10 70 H80" fill="none" stroke="#00ff00" stroke-width="6"/>'));
    const svg = computeVectorOcclusion([layer()], { a }, canvas).byLayerId.get("test")!;
    const data = await pixels(svg);
    assert(pixel(data, 20, 20).join() === "255,0,0,255", `red lost: ${pixel(data, 20, 20)}`);
    assert(pixel(data, 60, 20).join() === "0,0,255,255", `blue lost: ${pixel(data, 60, 20)}`);
    assert(pixel(data, 30, 70).join() === "0,255,0,255", `stroke lost: ${pixel(data, 30, 70)}`);
  });
  await test("symbol use materialization", async () => {
    const a = asset(wrap('<defs><symbol id="box"><rect width="20" height="20" fill="#ff0000"/></symbol></defs><use href="#box" x="10" y="10"/>'));
    const svg = computeVectorOcclusion([layer()], { a }, canvas).byLayerId.get("test")!;
    const data = await pixels(svg);
    assert(pixel(data, 15, 15)[0] === 255 && pixel(data, 40, 40)[3] === 0, "symbol placement lost");
  });
  await test("colored lower geometry clipped by upper geometry", async () => {
    const bottom = asset(wrap('<rect x="10" y="10" width="30" height="30" fill="#ff0000"/><rect x="50" y="10" width="30" height="30" fill="#0000ff"/>'));
    const top = { ...asset(wrap('<rect x="20" y="0" width="40" height="50" fill="#00ff00"/>')), id: "b" };
    const result = computeVectorOcclusion([layer("bottom"), { ...layer("top"), assetId: "b" }], { a: bottom, b: top }, canvas);
    const data = await pixels(result.byLayerId.get("bottom")!);
    assert(pixel(data, 15, 20)[0] === 255 && pixel(data, 30, 20)[3] === 0 && pixel(data, 70, 20)[2] === 255, "boolean changed paint or mask");
  });
  return { passed: results.filter(r => r.pass).length, total: results.length, results };
}
