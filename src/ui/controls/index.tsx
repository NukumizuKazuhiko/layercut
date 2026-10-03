import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { round2 } from "../../utils/geometry";

/**
 * Unified input control kit — the app's in-house UI framework for form
 * controls (styled via .ctl-* classes in styles.css). Every input in the
 * app goes through here so focus rings, hover states and sliders look and
 * behave identically.
 */

export function TextField({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={`ctl-input ${className}`} {...rest} />;
}

/**
 * Numeric field that commits on Enter / blur (one undo step per edit),
 * with clamping and graceful fallback to the previous value.
 */
export function NumberField({
  value,
  onCommit,
  step = 1,
  min,
  max,
  className = "",
  disabled,
  placeholder,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(String(round2(value)));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(String(round2(value)));
  }, [value, editing]);

  const commit = () => {
    const n = parseFloat(text);
    if (isFinite(n)) {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onCommit(v);
    } else {
      setText(String(round2(value)));
    }
    setEditing(false);
  };

  return (
    <input
      type="number"
      className={`ctl-input ${className}`}
      value={text}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(String(round2(value)));
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/**
 * Range slider with an accent fill up to the current value.
 * onChange fires live; onCommit fires on release (one undo step).
 * onDragStart fires on pointer down — wire it to history.beginTransaction()
 * so the release commit captures the pre-drag state.
 */
export function SliderField({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  onDragStart,
  className = "",
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  onDragStart?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const active = useRef(false);
  const start = () => {
    if (active.current || disabled) return;
    active.current = true;
    onDragStart?.();
  };
  const finish = (v: number) => {
    if (!active.current) return;
    active.current = false;
    onCommit?.(v);
  };
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={`ctl-slider ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      style={{ backgroundSize: `${pct}% 100%` }}
      onPointerDown={(e) => {
        start();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onChange={(e) => {
        start();
        onChange(Number(e.target.value));
      }}
      onPointerUp={(e) => finish(Number(e.currentTarget.value))}
      onPointerCancel={(e) => finish(Number(e.currentTarget.value))}
      onLostPointerCapture={(e) => finish(Number(e.currentTarget.value))}
      onKeyUp={(e) => finish(Number(e.currentTarget.value))}
      onBlur={(e) => finish(Number(e.currentTarget.value))}
    />
  );
}

export function ColorField({
  value,
  onChange,
  title,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="color"
      className={`ctl-color ${className}`}
      value={value}
      title={title}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
