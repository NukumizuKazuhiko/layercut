/**
 * Drawing-tool UI: the tool segment in the main toolbar plus the options row
 * that appears under it while a shape tool is armed.
 */
import type { ComponentType } from "react";
import { useI18n } from "../i18n";
import { useEditorStore } from "../layers/layerStore";
import { TOOL_NAME_KEY } from "../shapes/shapeLabels";
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
  SHAPE_KINDS,
  SIDES_MAX,
  SIDES_MIN,
  isShapeTool,
  type EditorTool,
} from "../shapes/shapeTypes";
import { ColorField, NumberField } from "./controls";
import {
  EllipseIcon,
  LineIcon,
  PolygonIcon,
  RectIcon,
  SelectIcon,
  StarIcon,
} from "./icons";

const TOOL_ICON: Record<EditorTool, ComponentType<{ size?: number }>> = {
  select: SelectIcon,
  rect: RectIcon,
  ellipse: EllipseIcon,
  line: LineIcon,
  polygon: PolygonIcon,
  star: StarIcon,
};

/** Single-key shortcuts, mirrored by useKeyboard. */
export const TOOL_SHORTCUT: Record<EditorTool, string> = {
  select: "V",
  rect: "R",
  ellipse: "O",
  line: "L",
  polygon: "P",
  star: "S",
};

const TOOLS: readonly EditorTool[] = ["select", ...SHAPE_KINDS];

export function ShapeToolSegment() {
  const { t } = useI18n();
  const activeTool = useEditorStore((s) => s.activeTool);

  return (
    <div className="segmented tool-segment" role="group" aria-label={t("toolShapes")}>
      {TOOLS.map((tool) => {
        const Icon = TOOL_ICON[tool];
        const label = t(TOOL_NAME_KEY[tool]);
        return (
          <button
            key={tool}
            className={activeTool === tool ? "active" : ""}
            aria-pressed={activeTool === tool}
            title={`${label} (${TOOL_SHORTCUT[tool]})`}
            onClick={() => useEditorStore.getState().setActiveTool(tool)}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

function ColorChannel({
  label,
  noneLabel,
  value,
  fallback,
  onChange,
}: {
  label: string;
  noneLabel: string;
  value: string | null;
  fallback: string;
  onChange: (color: string | null) => void;
}) {
  return (
    <label className="tool-field">
      <span className="field-label">{label}</span>
      <ColorField value={value ?? fallback} onChange={onChange} title={label} />
      <button
        type="button"
        className={`btn small${value === null ? " toggled" : ""}`}
        aria-pressed={value === null}
        title={noneLabel}
        onClick={() => onChange(value === null ? fallback : null)}
      >
        {noneLabel}
      </button>
    </label>
  );
}

/** Options for the armed tool; renders nothing for the select tool. */
export function ShapeOptionsRow() {
  const { t } = useI18n();
  const activeTool = useEditorStore((s) => s.activeTool);
  const style = useEditorStore((s) => s.shapeStyle);
  const sides = useEditorStore((s) => s.shapeSides);
  if (!isShapeTool(activeTool)) return null;

  const Icon = TOOL_ICON[activeTool];
  const setStyle = useEditorStore.getState().setShapeStyle;

  return (
    <div className="tool-options">
      <span className="tool-options-name">
        <Icon /> {t(TOOL_NAME_KEY[activeTool])}
      </span>
      <div className="toolbar-sep" />

      {activeTool !== "line" && (
        <ColorChannel
          label={t("shapeFill")}
          noneLabel={t("shapeFillNone")}
          value={style.fill}
          fallback={DEFAULT_FILL_COLOR}
          onChange={(fill) => setStyle({ fill })}
        />
      )}

      <ColorChannel
        label={t("shapeStroke")}
        noneLabel={t("shapeStrokeNone")}
        value={style.stroke}
        fallback={DEFAULT_STROKE_COLOR}
        onChange={(stroke) => setStyle({ stroke })}
      />

      <label className="tool-field">
        <span className="field-label">{t("shapeStrokeWidth")}</span>
        <NumberField
          value={style.strokeWidth}
          min={0}
          max={200}
          onCommit={(strokeWidth) => setStyle({ strokeWidth })}
        />
      </label>

      {(activeTool === "polygon" || activeTool === "star") && (
        <label className="tool-field">
          <span className="field-label">{t("shapeSides")}</span>
          <NumberField
            value={sides}
            min={SIDES_MIN}
            max={SIDES_MAX}
            onCommit={(v) => useEditorStore.getState().setShapeSides(v)}
          />
        </label>
      )}

      <span className="tool-options-hint">{t("shapeHint")}</span>
    </div>
  );
}
