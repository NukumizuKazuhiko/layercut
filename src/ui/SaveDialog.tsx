import { useState } from "react";
import { useI18n } from "../i18n";
import { useEditorStore } from "../layers/layerStore";
import { saveProjectAs } from "../project/saveProject";
import { TextField } from "./controls";

export function SaveDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const currentName = useEditorStore((s) => s.projectName);
  const [name, setName] = useState(currentName || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveProjectAs(name);
      onClose();
    } catch (e) {
      console.error(e);
      useEditorStore.getState().setNotice(`⚠ ${t("openFailed")}`);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{t("saveTitle")}</h2>
        <div className="field-label">{t("projectName")}</div>
        <TextField
          autoFocus
          value={name}
          placeholder={t("unnamedProject")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <p className="dialog-note">{t("saveNote")}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button className="btn accent" onClick={() => void save()} disabled={busy}>
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
