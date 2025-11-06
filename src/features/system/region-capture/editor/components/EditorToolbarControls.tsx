import clsx from "clsx";
import {
  COLOR_CHOICES,
  STROKE_CHOICES,
  TEXT_SIZE_CHOICES,
  TOOL_LABELS,
  TOOL_ORDER
} from "../constants";
import type { EditorTool } from "../types";

type EditorToolbarControlsProps = {
  variant: "inline" | "full";
  className?: string;
  tool: EditorTool | null;
  onToolChange: (next: EditorTool) => void;
  strokeColor: string;
  onStrokeColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  mosaicSize: number;
  onMosaicSizeChange: (size: number) => void;
  textSize: number;
  onTextSizeChange: (size: number) => void;
  operationsCount: number;
  hasDraftOperation: boolean;
  isExporting: boolean;
  onUndo: () => void;
  onReset: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function EditorToolbarControls({
  variant,
  className,
  tool,
  onToolChange,
  strokeColor,
  onStrokeColorChange,
  strokeWidth,
  onStrokeWidthChange,
  mosaicSize,
  onMosaicSizeChange,
  textSize,
  onTextSizeChange,
  operationsCount,
  hasDraftOperation,
  isExporting,
  onUndo,
  onReset,
  onCancel,
  onConfirm
}: EditorToolbarControlsProps) {
  const containerClass = clsx(
    "flex items-center gap-3 text-white/90",
    variant === "inline"
      ? "flex-nowrap text-xs whitespace-nowrap"
      : "w-full max-w-[min(1080px,100%)] flex-wrap justify-between gap-4 text-sm"
  );

  const colorButtonSizeClass = variant === "inline" ? "h-6 w-6" : "h-7 w-7";
  const actionGroupClass =
    variant === "inline" ? "ml-2 flex items-center gap-2" : "flex items-center gap-2 text-xs";

  const confirmButton = (
    <button
      type="button"
      className={clsx(
        "rounded-lg px-4 py-2 font-semibold transition bg-[#3b82f6] text-white hover:bg-[#2563eb]",
        "disabled:bg-[#3b82f6] disabled:text-white disabled:hover:bg-[#3b82f6] disabled:cursor-default"
      )}
      onClick={onConfirm}
      disabled={isExporting}
    >
      完成
    </button>
  );

  return (
    <div className={clsx(containerClass, className)}>
      <div className="flex items-center gap-2">
        {TOOL_ORDER.map((current) => (
          <button
            key={current}
            type="button"
            className={clsx(
              "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-150",
              tool === current
                ? "bg-[rgba(255,255,255,0.92)] text-[rgba(18,27,43,0.9)] shadow"
                : "bg-[rgba(255,255,255,0.16)] text-white/80 hover:bg-[rgba(255,255,255,0.28)]"
            )}
            onClick={() => onToolChange(current)}
          >
            {TOOL_LABELS[current]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {tool !== "mosaic" && (
          <div className="flex items-center gap-2">
            {COLOR_CHOICES.map((color) => (
              <button
                key={color}
                type="button"
                className={clsx(
                  `${colorButtonSizeClass} rounded-full border-2 transition-all duration-150`,
                  strokeColor === color
                    ? "border-white scale-110 shadow-lg"
                    : "border-transparent opacity-80 hover:opacity-100"
                )}
                style={{ backgroundColor: color }}
                onClick={() => onStrokeColorChange(color)}
                aria-label={`选择颜色 ${color}`}
              />
            ))}
          </div>
        )}

        {tool === "mosaic" && (
          <label className="flex items-center gap-2 text-xs text-white/80">
            马赛克强度
            <input
              type="range"
              min={18}
              max={120}
              step={6}
              value={mosaicSize}
              onChange={(event) => onMosaicSizeChange(Number(event.target.value))}
            />
          </label>
        )}

        {tool !== "mosaic" && tool !== "text" && (
          <div className="flex items-center gap-1">
            {STROKE_CHOICES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={clsx(
                  "rounded-lg px-2 py-1 text-xs transition-all",
                  strokeWidth === item.value
                    ? "bg-white text-[rgba(18,27,43,0.9)] font-semibold"
                    : "bg-[rgba(255,255,255,0.14)] text-white/80 hover:bg-[rgba(255,255,255,0.24)]"
                )}
                onClick={() => onStrokeWidthChange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {tool === "text" && (
          <div className="flex items-center gap-1">
            {TEXT_SIZE_CHOICES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={clsx(
                  "rounded-lg px-2 py-1 text-xs transition-all",
                  textSize === item.value
                    ? "bg-white text-[rgba(18,27,43,0.9)] font-semibold"
                    : "bg-[rgba(255,255,255,0.14)] text-white/80 hover:bg-[rgba(255,255,255,0.24)]"
                )}
                onClick={() => onTextSizeChange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={actionGroupClass}>
        <button
          type="button"
          className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
          onClick={onUndo}
          disabled={operationsCount === 0}
        >
          撤销
        </button>
        <button
          type="button"
          className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
          onClick={onReset}
          disabled={operationsCount === 0 && !hasDraftOperation}
        >
          重置
        </button>
        <button
          type="button"
          className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
          onClick={onCancel}
          disabled={isExporting}
        >
          取消
        </button>
        {variant === "full" && confirmButton}
      </div>

      {variant === "inline" && confirmButton}
    </div>
  );
}
