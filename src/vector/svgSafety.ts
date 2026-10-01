/**
 * Vector-safety analysis (project plan §6 Phase 2 / §7.3):
 * SVG export is only offered when every visible layer parses into supported
 * geometry. Unsupported elements make "Boolean Result Vector-safe" false.
 *
 * Supported (v0.4 scope): svg, g, defs, path, rect, circle, ellipse,
 * polygon, polyline, line, use, symbol, gradients (paint only).
 * Unsupported: text, image, filter, mask, clipPath, pattern, style, SMIL.
 */

const SAFE_TAGS = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
  "use",
  "symbol",
  "title",
  "desc",
  "metadata",
  "lineargradient",
  "radialgradient",
  "stop",
]);

export interface SvgSafety {
  safe: boolean;
  offending: string[];
}

export function analyzeSvgSafety(svgText: string): SvgSafety {
  const offending = new Set<string>();
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (doc.querySelector("parsererror")) return { safe: false, offending: ["parse-error"] };
    const walk = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) offending.add(el.tagName);
      for (const child of Array.from(el.children)) walk(child);
    };
    walk(doc.documentElement);
  } catch {
    return { safe: false, offending: ["parse-error"] };
  }
  return { safe: offending.size === 0, offending: [...offending] };
}
