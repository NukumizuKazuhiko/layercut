import { useI18n } from "../i18n";
import type { CanvasSettings } from "../layers/layerTypes";
import { TextField, ColorField } from "./controls";

const PRESETS: { w: number; h: number; label: string }[] = [
  { w: 1080, h: 1920, label: "9:16 · 1080×1920" },
  { w: 1920, h: 1080, label: "16:9 · 1920×1080" },
  { w: 1080, h: 1080, label: "1:1 · 1080×1080" },
  { w: 1200, h: 1600, label: "3:4 · 1200×1600" },
  { w: 2048, h: 2048, label: "1:1 · 2048×2048" },
];

const SWATCHES = ["#ffffff", "#111114", "#f2ede4", "#dfe8f2"];

/** Shared canvas setup form: presets + size + background. */
export function CanvasSetupForm({
  width,
  height,
  background,
  onChange,
}: {
  width: string;
  height: string;
  background: CanvasSettings["background"];
  onChange: (next: {
    width?: string;
    height?: string;
    background?: CanvasSettings["background"];
  }) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="field-label">{t("preset")}</div>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={`preset${Number(width) === p.w && Number(height) === p.h ? " active" : ""}`}
            onClick={() => onChange({ width: String(p.w), height: String(p.h) })}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="form-row">
        <label>
          <span className="field-label">{t("canvasWidth")}</span>
          <TextField
            type="number"
            min={1}
            max={8192}
            value={width}
            onChange={(e) => onChange({ width: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label">{t("canvasHeight")}</span>
          <TextField
            type="number"
            min={1}
            max={8192}
            value={height}
            onChange={(e) => onChange({ height: e.target.value })}
          />
        </label>
      </div>

      <div className="field-label">{t("background")}</div>
      <div className="bg-row">
        <button
          className={`checker-chip${background === "transparent" ? " active" : ""}`}
          onClick={() => onChange({ background: "transparent" })}
          title={t("transparent")}
        />
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`color-chip${background === c ? " active" : ""}`}
            style={{ background: c }}
            onClick={() => onChange({ background: c })}
          />
        ))}
        <ColorField
          value={background === "transparent" ? "#888888" : background}
          onChange={(v) => onChange({ background: v })}
          title={t("background")}
        />
      </div>
    </>
  );
}
