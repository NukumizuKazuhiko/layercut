// Generate test fixtures for the LayerCut acceptance run:
// three PNGs with alpha (they overlap when stacked) and one SVG.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(outDir, { recursive: true });

// ---- minimal PNG encoder (RGBA, filter 0) ----
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeCanvas(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  return {
    buf,
    set(x, y, r, g, b, a) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    },
    fillDisc(cx, cy, rad, r, g, b) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy);
          const a = Math.max(0, Math.min(1, rad - d + 0.5));
          if (a > 0) this.set(x, y, r, g, b, Math.round(a * 255));
        }
    },
    fillRoundedRect(x0, y0, rw, rh, rad, r, g, b) {
      const inside = (x, y) => {
        if (x < x0 || y < y0 || x >= x0 + rw || y >= y0 + rh) return false;
        const cx = Math.max(x0 + rad, Math.min(x, x0 + rw - rad));
        const cy = Math.max(y0 + rad, Math.min(y, y0 + rh - rad));
        return Math.hypot(x - cx, y - cy) <= rad;
      };
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if (inside(x, y)) this.set(x, y, r, g, b, 255);
    },
    fillTriangle(p1, p2, p3, r, g, b) {
      const sign = (a, b2, p) => (a[0] - p[0]) * (b2[1] - p[1]) - (b2[0] - p[0]) * (a[1] - p[1]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const p = [x + 0.5, y + 0.5];
          const d1 = sign(p1, p2, p),
            d2 = sign(p2, p3, p),
            d3 = sign(p3, p1, p);
          const neg = d1 < 0 || d2 < 0 || d3 < 0;
          const pos = d1 > 0 || d2 > 0 || d3 > 0;
          if (!(neg && pos)) this.set(x, y, r, g, b, 255);
        }
    },
  };
}

// A — red disc (bottom)
{
  const S = 400;
  const c = makeCanvas(S, S);
  c.fillDisc(S / 2, S / 2, 175, 232, 62, 48);
  writeFileSync(join(outDir, "red_disc.png"), encodePNG(S, S, c.buf));
}

// B — blue rounded rect (middle)
{
  const W = 640,
    H = 320;
  const c = makeCanvas(W, H);
  c.fillRoundedRect(20, 20, W - 40, H - 40, 48, 52, 120, 246);
  writeFileSync(join(outDir, "blue_card.png"), encodePNG(W, H, c.buf));
}

// C — green triangle (top)
{
  const S = 520;
  const c = makeCanvas(S, S);
  c.fillTriangle([S / 2, 30], [S - 40, S - 40], [40, S - 40], 36, 200, 110);
  writeFileSync(join(outDir, "green_triangle.png"), encodePNG(S, S, c.buf));
}

// D — SVG star
const starSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
  <polygon points="180,20 224,140 352,140 250,216 288,338 180,262 72,338 110,216 8,140 136,140"
    fill="#f5c542" stroke="#8a6d1a" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="180" cy="180" r="36" fill="#fff3cf" stroke="#8a6d1a" stroke-width="4"/>
</svg>`;
writeFileSync(join(outDir, "yellow_star.svg"), starSVG);

console.log("fixtures written to", outDir);
