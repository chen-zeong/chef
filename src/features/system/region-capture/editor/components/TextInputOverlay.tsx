import clsx from "clsx";
import type {
  KeyboardEvent,
  ChangeEvent,
  RefObject
} from "react";
import { clampNumber } from "../operations";
import type { TextEntryState } from "../types";

type TextInputOverlayProps = {
  entry: TextEntryState | null;
  textSize: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TextInputOverlay({
  entry,
  textSize,
  inputRef,
  onChange,
  onKeyDown,
  onCancel,
  onConfirm
}: TextInputOverlayProps) {
  if (!entry) {
    return null;
  }

  let left = entry.clientX;
  let top = entry.clientY;

  if (typeof window !== "undefined") {
    left = clampNumber(left, 16, window.innerWidth - 280);
    top = clampNumber(top, 16, window.innerHeight - 140);
  }

  const trimmed = entry.value.trim();

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      <div
        className="pointer-events-auto flex w-[280px] flex-col gap-2 rounded-xl bg-[rgba(18,27,43,0.9)] px-4 py-3 text-xs text-white shadow-[0_20px_44px_rgba(8,15,30,0.6)] backdrop-blur"
        style={{ position: "fixed", left: `${left}px`, top: `${top}px` }}
      >
        <input
          ref={inputRef}
          value={entry.value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-[rgba(18,27,43,0.9)] placeholder:text-[rgba(18,27,43,0.45)] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          placeholder="输入文字"
          maxLength={120}
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg bg-[rgba(255,255,255,0.16)] px-3 py-1.5 text-white/85 transition hover:bg-[rgba(255,255,255,0.25)]"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-lg px-3 py-1.5 font-semibold transition",
              trimmed
                ? "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                : "bg-[rgba(255,255,255,0.35)] text-[rgba(18,27,43,0.6)]"
            )}
            onClick={onConfirm}
            disabled={!trimmed}
          >
            完成
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-white/60">
          <span>字号 {textSize}px</span>
          <span>Enter 完成 / Esc 取消</span>
        </div>
      </div>
    </div>
  );
}
