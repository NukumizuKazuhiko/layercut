/**
 * SVG rasterization helpers (Phase 1 strategy, project plan §6):
 * SVG is rasterized by the browser and participates in occlusion like a PNG.
 * The original text is kept in the asset for Phase 2 vector boolean.
 */

export interface SVGSize {
  width: number;
  height: number;
}

/** Read intrinsic size from width/height attributes, falling back to viewBox. */
export function parseSVGSize(svgText: string): SVGSize {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  const num = (v: string | null): number | null => {
    if (!v) return null;
    const m = v.match(/^([\d.]+)\s*(px|pt|mm|cm|in)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return null;
    const unit = (m[2] ?? "px").toLowerCase();
    const factor = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[unit] ?? 1;
    return n * factor;
  };

  const w = num(svg.getAttribute("width"));
  const h = num(svg.getAttribute("height"));
  if (w && h) return { width: Math.round(w), height: Math.round(h) };

  const vb = svg.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }
  return { width: 300, height: 150 }; // SVG default intrinsic size
}

/** Load SVG text into an <img> the browser can draw (vector-crisp on drawImage). */
export function loadSVGImage(svgText: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG decode failed"));
    };
    img.src = url;
  });
}
