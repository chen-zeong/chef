import type { CSSProperties, ReactNode, RefObject } from "react";
import { EditorToolbarControls } from "./EditorToolbarControls";
import type { EditorTool } from "../types";
import type { CaptureSuccessPayload } from "../../regionCaptureTypes";

type FullEditorLayoutProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  payload: CaptureSuccessPayload;
  canvasStyle: CSSProperties;
  containerStyle: CSSProperties | undefined;
  error: string | null;
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

export function FullEditorLayout({
  canvasRef,
  payload,
  canvasStyle,
  containerStyle,
  error,
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
}: FullEditorLayoutProps) {
  return (
    <>
      <div
        className="flex h-full w-full flex-col items-center gap-6 overflow-y-auto px-10 py-8"
        style={containerStyle}
      >
        <div className="flex w-full max-w-[min(1080px,100%)] flex-wrap items-center justify-between gap-4 rounded-2xl bg-[rgba(18,27,43,0.82)] px-5 py-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur">
          <EditorToolbarControls
            variant="full"
            className="w-full"
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
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-[26px] border border-[rgba(15,23,42,0.12)] bg-white/95 p-5 shadow-[0_30px_60px_rgba(15,23,42,0.3)]">
            <canvas
              ref={canvasRef}
              width={payload.width}
              height={payload.height}
              className="rounded-[18px] shadow-inner"
              style={canvasStyle}
            />
          </div>
          <div className="rounded-full bg-[rgba(18,27,43,0.82)] px-4 py-2 text-xs text-white/80">
            {payload.width} × {payload.height} / 逻辑尺寸 {payload.logical_width} × {payload.logical_height}
          </div>
          {error && (
            <div className="rounded-xl bg-[rgba(240,60,60,0.24)] px-4 py-2 text-xs text-[#ffd7d7]">
              {error}
            </div>
          )}
        </div>
      </div>
      {textInputOverlay}
    </>
  );
}
