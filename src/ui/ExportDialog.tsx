import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { useEditorStore } from "../layers/layerStore";
import { useAssetStore } from "../assets/assetStore";
import { validSelection } from "../layers/layerUtils";
import { exportLayers, type ExportDestination, type ExportFormat, type ExportScope } from "../export/exportAll";
import { compositeName, exportName } from "../export/naming";
import { analyzeSvgSafety } from "../vector/svgSafety";
import { readExportConfig, writeExportConfig, type StoredExportConfig } from "../project/exportConfig";
import { TextField } from "./controls";
import { isLayerOccluder } from "../layers/layerUtils";

const SCALES = [1, 2, 4];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const layers = useEditorStore((s) => s.layers);
  const rawSelection = useEditorStore((s) => s.selectedIds);
  const selectedIds = validSelection(layers, rawSelection);
  const assets = useAssetStore((s) => s.assets);

  const visibleCount = layers.filter((l) => l.visible).length;

  // SVG availability (§7.3): every visible layer must be a vector-safe SVG
  const svgStatus = useMemo(() => {
    const visible = layers.filter((l) => l.visible);
    if (visible.length === 0) return { ok: false, reason: t("needLayers") };
    if (layers.some((l) => isLayerOccluder(l) && l.type !== "svg")) return { ok: false, reason: t("svgOnlyAllSvg") };
    for (const l of layers.filter(isLayerOccluder)) {
      const asset = l.assetId ? assets[l.assetId] : null;
      if (asset?.kind === "svg" && asset.svgText) {
        const safety = analyzeSvgSafety(asset.svgText);
        if (!safety.safe) {
          return { ok: false, reason: `${t("svgUnsafe")}: ${safety.offending.join(", ")}` };
        }
      }
    }
    return { ok: true, reason: "" };
  }, [layers, assets, t]);

  const saved = readExportConfig() as StoredExportConfig | undefined;
  const selectionDefault: ExportScope =
    selectedIds.length === 1 ? "current" : selectedIds.length > 1 ? "selected" : "all";
  const initialScope: ExportScope =
    saved?.scope === "current" && selectedIds.length !== 1
      ? selectionDefault
      : saved?.scope === "selected" && selectedIds.length === 0
        ? selectionDefault
        : (saved?.scope ?? selectionDefault);
  const [scope, setScope] = useState<ExportScope>(initialScope);
  const [format, setFormat] = useState<ExportFormat>(saved?.format === "svg" && svgStatus.ok ? "svg" : "png");
  const savedScale = saved?.scale;
  const [scale, setScale] = useState<number>(
    savedScale && SCALES.includes(savedScale) ? savedScale : savedScale ? 0 : 1
  );
  const [customScale, setCustomScale] = useState(String(savedScale ?? "2"));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const folderAvailable = "showDirectoryPicker" in window && typeof window.showDirectoryPicker === "function";
  const [destination, setDestination] = useState<ExportDestination>(folderAvailable ? "folder" : "zip");

  const effectiveScale = scale === 0 ? Math.min(8, Math.max(0.1, Number(customScale) || 1)) : scale;
  const ext = format === "svg" ? "svg" : "png";
  const svgDisabled = format === "svg" && (!svgStatus.ok || scope === "composite");

  const fileNames = useMemo(() => {
    if (scope === "composite") return ext === "png" ? [compositeName()] : [];
    let targets = layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => layer.visible);
    if (scope === "current" || scope === "selected") {
      const ids = new Set(selectedIds);
      targets = targets.filter(({ layer }) => ids.has(layer.id));
    }
    return targets.map(({ layer, index }) => exportName(index + 1, layer.name, ext));
  }, [scope, layers, selectedIds, ext]);

  const scopeOptions: { value: ExportScope; label: string; disabled: boolean }[] = [
    { value: "current", label: t("scopeCurrent"), disabled: selectedIds.length !== 1 },
    { value: "selected", label: t("scopeSelected"), disabled: selectedIds.length === 0 },
    { value: "all", label: t("scopeAll"), disabled: visibleCount === 0 },
    { value: "composite", label: t("scopeComposite"), disabled: visibleCount === 0 },
  ];

  const run = async () => {
    setBusy(true);
    setProgress(t("exporting"));
    try {
      const result = await exportLayers(scope, effectiveScale, format, (done, total) =>
        setProgress(`${t("exporting")} ${done}/${total}`), destination
      );
      if (result === "cancelled") setProgress(t("exportCancelled"));
      else {
        writeExportConfig({ scope, scale: effectiveScale, format });
        setProgress(`${t("exported")} ✓`);
        setTimeout(onClose, 600);
      }
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.message === "svg_needs_all_svg") setProgress(t("svgOnlyAllSvg"));
      else if (e instanceof Error && (e.message === "svg_unsafe" || e.message === "svg_composite_unsupported"))
        setProgress(t("svgCompositeUnavailable"));
      else setProgress(`⚠ ${t("exportFailed")}`);
    } finally {
      setBusy(false);
    }
  };

  const canExport =
    scope === "composite" ? visibleCount > 0 && format === "png" : fileNames.length > 0 && !svgDisabled;

  return (
    <div className="dialog-overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{t("exportTitle")}</h2>

        <div className="field-label">{t("exportDestination")}</div>
        <div className="scale-row">
          <button className={`preset${destination === "folder" ? " active" : ""}`}
            disabled={busy || !folderAvailable} onClick={() => setDestination("folder")}>
            {t("exportToFolder")}
          </button>
          <button className={`preset${destination === "zip" ? " active" : ""}`}
            disabled={busy} onClick={() => setDestination("zip")}>
            {t("exportToZip")}
          </button>
        </div>
        {destination === "folder" && <p className="dialog-note">{t("folderRestrictedHint")}</p>}

        <div className="field-label">{t("scope")}</div>
        <div className="preset-grid">
          {scopeOptions.map((o) => (
            <button
              key={o.value}
              className={`preset${scope === o.value ? " active" : ""}`}
              disabled={o.disabled}
              onClick={() => setScope(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="field-label">{t("format")}</div>
        <div className="scale-row">
          <button
            className={`preset${format === "png" ? " active" : ""}`}
            onClick={() => setFormat("png")}
          >
            {t("formatPng")}
          </button>
          <button
            className={`preset${format === "svg" ? " active" : ""}`}
            disabled={!svgStatus.ok}
            title={svgStatus.ok ? t("formatSvg") : svgStatus.reason}
            onClick={() => setFormat("svg")}
          >
            {t("formatSvg")}
          </button>
        </div>
        {format === "svg" && scope === "composite" && (
          <p className="dialog-note warn">{t("svgCompositeUnavailable")}</p>
        )}
        {format === "svg" && !svgStatus.ok && <p className="dialog-note warn">{svgStatus.reason}</p>}

        <div className="field-label">{t("scale")}</div>
        <div className="scale-row">
          {SCALES.map((s) => (
            <button
              key={s}
              className={`preset${scale === s ? " active" : ""}`}
              onClick={() => setScale(s)}
            >
              {s}x
            </button>
          ))}
          <button className={`preset${scale === 0 ? " active" : ""}`} onClick={() => setScale(0)}>
            {t("custom")}
          </button>
          {scale === 0 && (
            <TextField
              type="number"
              className="scale-input"
              min={0.1}
              max={8}
              step={0.5}
              value={customScale}
              onChange={(e) => setCustomScale(e.target.value)}
            />
          )}
        </div>

        <div className="field-label">{t("filePreview")}</div>
        <div className="file-list">
          {fileNames.length === 0 ? (
            <span className="muted">{visibleCount === 0 ? t("needLayers") : t("needSelection")}</span>
          ) : (
            fileNames.map((n) => <div key={n} className="file-item">{n}</div>)
          )}
        </div>
        <p className="dialog-note">
          {format === "svg"
            ? t("svgOnlyAllSvg")
            : destination === "folder"
              ? t("folderTip")
              : t("zipTip")}
          {" · "}
          {t("hiddenLayersSkipped")}
        </p>

        <div className="dialog-actions">
          <span className="progress-text">{progress}</span>
          <button className="btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button className="btn accent" onClick={run} disabled={busy || !canExport}>
            {t("exportBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
