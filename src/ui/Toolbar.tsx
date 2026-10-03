import { useRef } from "react";
import { useI18n } from "../i18n";
import { useEditorStore } from "../layers/layerStore";
import { importFiles } from "../import/importFiles";
import { openProjectFile } from "../project/saveProject";
import { SliderField } from "./controls";
import { ShapeOptionsRow, ShapeToolSegment } from "./ShapeTools";
import {
  CanvasIcon,
  ExportIcon,
  FolderIcon,
  ImportIcon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
} from "./icons";

export function Toolbar({
  onHome,
  onNewCanvas,
  onExport,
  onSave,
}: {
  onHome: () => void;
  onNewCanvas: () => void;
  onExport: () => void;
  onSave: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const previewMode = useEditorStore((s) => s.previewMode);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const explodeAmount = useEditorStore((s) => s.explodeAmount);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
    <div className="toolbar">
      <button className="toolbar-brand" onClick={onHome} title={t("backToConsole")}>
        LayerCut
      </button>

      <button className="btn" onClick={onNewCanvas} title={t("newCanvas")}>
        <CanvasIcon /> <span>{t("newCanvas")}</span>
      </button>
      <button className="btn" onClick={() => fileInputRef.current?.click()} title={t("import")}>
        <ImportIcon /> <span>{t("import")}</span>
      </button>
      <button className="btn accent" onClick={onExport} title={t("export")}>
        <ExportIcon /> <span>{t("export")}</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/svg+xml,.png,.svg"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void importFiles(files);
        }}
      />

      <div className="toolbar-sep" />

      <button className="btn" onClick={onSave} title={`${t("saveProject")} (Ctrl+S)`}>
        <SaveIcon /> <span>{t("saveProject")}</span>
      </button>
      <button className="btn" onClick={() => projectInputRef.current?.click()} title={t("openProject")}>
        <FolderIcon /> <span>{t("openProject")}</span>
      </button>
      <input
        ref={projectInputRef}
        type="file"
        accept=".layercut,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            await openProjectFile(file);
          } catch (err) {
            console.error(err);
            useEditorStore.getState().setNotice(`⚠ ${t("invalidProject")}`);
          }
        }}
      />
      <div className="toolbar-sep" />

      <ShapeToolSegment />

      <div className="segmented">
        <button
          className={previewMode === "normal" ? "active" : ""}
          onClick={() => useEditorStore.getState().setPreviewMode("normal")}
        >
          {t("modeNormal")}
        </button>
        <button
          className={previewMode === "occlusion" ? "active" : ""}
          onClick={() => useEditorStore.getState().setPreviewMode("occlusion")}
        >
          {t("modeOcclusion")}
        </button>
      </div>

      {previewMode === "occlusion" && (
        <label className="explode-slider">
          <span>{t("explode")}</span>
          <SliderField
            min={0}
            max={200}
            step={2}
            value={explodeAmount}
            onChange={(v) => useEditorStore.getState().setExplodeAmount(v)}
          />
        </label>
      )}

      <div className="toolbar-spacer" />

      <button
        className={`btn icon-only${snapEnabled ? " toggled" : ""}`}
        onClick={() => useEditorStore.getState().toggleSnap()}
        title={t("snap")}
      >
        <span className={`dot${snapEnabled ? " on" : ""}`} /> <span>{t("snap")}</span>
      </button>
      <button
        className="btn icon-only"
        disabled={!canUndo}
        onClick={() => useEditorStore.getState().undo()}
        title={`${t("undo")} (Ctrl+Z)`}
      >
        <UndoIcon />
      </button>
      <button
        className="btn icon-only"
        disabled={!canRedo}
        onClick={() => useEditorStore.getState().redo()}
        title={`${t("redo")} (Ctrl+Shift+Z)`}
      >
        <RedoIcon />
      </button>
      <button
        className="btn lang"
        onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        title={t("language")}
      >
        {lang === "zh" ? "EN" : "中"}
      </button>
    </div>
    <ShapeOptionsRow />
    </>
  );
}
