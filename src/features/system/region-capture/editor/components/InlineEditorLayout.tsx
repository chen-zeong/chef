import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, RefObject } from "react";
import clsx from "clsx";
import { TOOLBAR_MARGIN } from "../constants";
import { clampNumber } from "../operations";
import type {
  EditorTool,
  SelectionRect,
  ToolbarPlacement
} from "../types";
import type { CaptureSuccessPayload } from "../../regionCaptureTypes";
import { EditorToolbarControls } from "./EditorToolbarControls";

type InlineEditorLayoutProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  payload: CaptureSuccessPayload;
  canvasStyle: CSSProperties;
  error: string | null;
  overlayRef: RefObject<HTMLDivElement | null> | undefined;
  selectionRect: SelectionRect | null | undefined;
  overlaySize: { width: number; height: number } | null | undefined;
  toolbarPlacement: ToolbarPlacement | null;
  toolbarMaxWidth: number | undefined;
  toolbarRef: RefObject<HTMLDivElement | null>;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
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
  onRetake: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  textInputOverlay: ReactNode;
};

export function InlineEditorLayout({
  canvasRef,
  payload,
  canvasStyle,
  error,
  overlayRef,
  selectionRect,
  overlaySize,
  toolbarPlacement,
  toolbarMaxWidth,
  toolbarRef,
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
  onRetake,
  onCancel,
  onConfirm,
  textInputOverlay
}: InlineEditorLayoutProps) {
  const overlayElement = overlayRef?.current ?? null;
  const placementInfo = toolbarPlacement;
  const toolbarVisible = Boolean(overlayElement && selectionRect && placementInfo);
  const fallbackPosition =
    selectionRect && overlaySize
      ? (() => {
          const estimatedWidth = Math.max(
            240,
            Math.min(overlaySize.width - TOOLBAR_MARGIN * 2, toolbarMaxWidth ?? 720)
          );
          const maxLeft = Math.max(TOOLBAR_MARGIN, overlaySize.width - estimatedWidth - TOOLBAR_MARGIN);
          const centeredLeft = selectionRect.x + selectionRect.width / 2 - estimatedWidth / 2;
          return {
            left: clampNumber(centeredLeft, TOOLBAR_MARGIN, maxLeft),
            top: selectionRect.y + selectionRect.height + TOOLBAR_MARGIN
          };
        })()
      : { left: TOOLBAR_MARGIN, top: TOOLBAR_MARGIN };

  const toolbarPosition = placementInfo?.position ?? fallbackPosition;
  const effectivePlacement = placementInfo?.placement ?? "outside";

  const toolbarNode =
    toolbarVisible && overlayElement
      ? createPortal(
          <div
            ref={toolbarRef}
            className={clsx(
              "absolute z-[60] select-none rounded-2xl bg-[rgba(13,23,42,0.82)] px-4 py-3 text-white shadow-[0_20px_44px_rgba(8,15,30,0.55)] backdrop-blur",
              effectivePlacement === "inside" ? "border border-[rgba(255,255,255,0.18)]" : null
            )}
            data-placement={effectivePlacement}
            style={{
              left: `${toolbarPosition.left}px`,
              top: `${toolbarPosition.top}px`,
              opacity: toolbarVisible ? 1 : 0,
              transition: "top 0.2s ease, left 0.2s ease, opacity 0.2s ease",
              maxWidth: toolbarMaxWidth ? `${toolbarMaxWidth}px` : "min(94vw, 1280px)"
            }}
          >
            <EditorToolbarControls
              variant="inline"
              tool={tool}
              onToolChange={onToolChange}
              strokeColor={strokeColor}
              onStrokeColorChange={onStrokeColorChange}
              strokeWidth={strokeWidth}
              onStrokeWidthChange={onStrokeWidthChange}
              mosaicSize={mosaicSize}
              onMosaicSizeChange={onMosaicSizeChange}
              textSize={textSize}
              onTextSizeChange={onTextSizeChange}
              operationsCount={operationsCount}
              hasDraftOperation={hasDraftOperation}
              isExporting={isExporting}
              onUndo={onUndo}
              onReset={onReset}
              onRetake={onRetake}
              onCancel={onCancel}
              onConfirm={onConfirm}
            />
          </div>,
          overlayElement
        )
      : null;

  return (
    <>
      <div className="relative h-full w-full select-none">
        <canvas
          ref={canvasRef}
          width={payload.width}
          height={payload.height}
          className="h-full w-full touch-none"
          style={canvasStyle}
        />

        <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-[rgba(13,23,42,0.75)] px-3 py-1 text-[11px] text-white/85 backdrop-blur">
          {payload.width} × {payload.height} / 逻辑尺寸 {payload.logical_width} × {payload.logical_height}
        </div>

        {error && (
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-xl bg-[rgba(240,60,60,0.28)] px-3 py-2 text-xs text-[#ffd7d7] shadow-lg backdrop-blur">
            {error}
          </div>
        )}
      </div>
      {toolbarNode}
      {textInputOverlay}
    </>
  );
}
