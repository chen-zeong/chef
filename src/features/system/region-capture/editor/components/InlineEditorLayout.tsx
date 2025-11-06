import type { CSSProperties, ReactNode, RefObject } from "react";
import { TOOLBAR_MARGIN } from "../constants";
import { clampNumber } from "../operations";
import type {
  EditorTool,
  SelectionRect,
  ToolbarPlacement
} from "../types";
import type { CaptureSuccessPayload } from "../../regionCaptureTypes";

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
    toolbarVisible && overlayElement && toolbarPosition && effectivePlacement
      ? null
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
