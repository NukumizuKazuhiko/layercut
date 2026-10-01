import { useEffect } from "react";
import { useI18n } from "../i18n";
import { useEditorStore } from "../layers/layerStore";
import { useViewportStore } from "../editor/ViewportManager";

export function StatusBar() {
  const { t } = useI18n();
  const canvas = useEditorStore((s) => s.canvas);
  const layerCount = useEditorStore((s) => s.layers.length);
  const previewMode = useEditorStore((s) => s.previewMode);
  const notice = useEditorStore((s) => s.notice);
  const scale = useViewportStore((s) => s.scale);
  const projectName = useEditorStore((s) => s.projectName);
  const isDirty = useEditorStore((s) => s.historyVersion !== s.savedVersion);

  // transient notices auto-dismiss
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useEditorStore.getState().setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="statusbar">
      <span className="status-zoom" title={t("fitView")}>
        {t("zoom")} {Math.round(scale * 100)}%
      </span>
      <span>
        {t("canvasSettings")} {canvas.width} × {canvas.height}
      </span>
      <span>
        {t("layerCount")} {layerCount}
      </span>
      <span className="status-mode">
        {previewMode === "normal" ? t("modeNormal") : t("modeOcclusion")}
      </span>
      <span className="status-project">
        {projectName || t("unnamedProject")}
        <span className={isDirty ? "dirty-dot" : "saved-tag"}>
          {isDirty ? ` ● ${t("unsavedChanges")}` : ` · ${t("saved")}`}
        </span>
      </span>
      <span className="status-notice">{notice ?? (layerCount === 0 ? t("tipEmpty") : previewMode === "occlusion" ? t("tipOcclusion") : "")}</span>
    </div>
  );
}
