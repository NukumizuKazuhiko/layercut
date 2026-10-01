// Generate the LayerCut icon source PNG (1024×1024): dark rounded square,
// three stacked "layers" (rounded rects) with a gradient accent.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const S = 1024;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// ---- PNG encoder (same minimal RGBA encoder as make-fixtures) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- drawing helpers ----
const px = new Float64Array(S * S * 4); // premultiplied-ish accumulate

function roundedRectCoverage(x, y, x0, y0, w, h, r) {
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r));
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  const d = Math.hypot(x - cx, y - cy) - r;
  return Math.max(0, Math.min(1, 0.5 - d)); // 1px AA ramp
}

function blendOver(x, y, r, g, b, a) {
  // standard source-over on straight alpha
  const i = (y * S + x) * 4;
  const da = px[i + 3];
  const sa = a;
  const outA = sa + (da * (255 - sa)) / 255;
  if (outA <= 0) return;
  px[i] = (r * sa + px[i] * da * (255 - sa) / 255) / outA;
  px[i + 1] = (g * sa + px[i + 1] * da * (255 - sa) / 255) / outA;
  px[i + 2] = (b * sa + px[i + 2] * da * (255 - sa) / 255) / outA;
  px[i + 3] = outA;
}

function fillRoundedRect(x0, y0, w, h, r, r_, g_, b_, a = 255) {
  for (let y = Math.max(0, y0 - 2); y < Math.min(S, y0 + h + 2); y++) {
    for (let x = Math.max(0, x0 - 2); x < Math.min(S, x0 + w + 2); x++) {
      const c = roundedRectCoverage(x + 0.5, y + 0.5, x0, y0, w, h, r);
      if (c > 0) blendOver(x, y, r_, g_, b_, Math.round(a * c));
    }
  }
}

// background: dark rounded square with subtle diagonal gradient
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const c = roundedRectCoverage(x + 0.5, y + 0.5, 0, 0, S, S, 180);
    if (c <= 0) continue;
    const t = (x + y) / (2 * S);
    const r = Math.round(26 + t * 30);
    const g = Math.round(27 + t * 24);
    const b = Math.round(34 + t * 44);
    blendOver(x, y, r, g, b, Math.round(255 * c));
  }
}

// three stacked layers, offset diagonally (bottom → top)
const L = 520;
const R = 90;
fillRoundedRect(170, 420, L, L * 0.42, R, 232, 62, 48, 235); // red (bottom-left)
fillRoundedRect(255, 300, L, L * 0.42, R, 52, 120, 246, 245); // blue (middle)
fillRoundedRect(340, 180, L, L * 0.42, R, 36, 200, 110, 255); // green (top)

// accent circle on the top layer, like the fixture star's hub
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - 600, y + 0.5 - 300);
    const c = Math.max(0, Math.min(1, 0.5 - (d - 72)));
    if (c > 0) blendOver(x, y, 255, 243, 207, Math.round(255 * c));
  }

// to straight-alpha RGBA
const out = Buffer.alloc(S * S * 4);
for (let p = 0; p < S * S; p++) {
  out[p * 4] = Math.round(px[p * 4]);
  out[p * 4 + 1] = Math.round(px[p * 4 + 1]);
  out[p * 4 + 2] = Math.round(px[p * 4 + 2]);
  out[p * 4 + 3] = Math.round(px[p * 4 + 3]);
}
writeFileSync(join(outDir, "icon-source.png"), encodePNG(S, S, out));
console.log("icon source written:", join(outDir, "icon-source.png"));
