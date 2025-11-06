import type { RefObject } from "react";
import type { CaptureSuccessPayload } from "../regionCaptureTypes";

export type EditorTool = "line" | "rectangle" | "circle" | "pen" | "mosaic" | "text";

export type Point = {
  x: number;
  y: number;
};

export type LineOperation = {
  kind: "line";
  color: string;
  width: number;
  start: Point;
  end: Point;
};

export type RectangleOperation = {
  kind: "rectangle";
  color: string;
  width: number;
  start: Point;
  end: Point;
};

export type CircleOperation = {
  kind: "circle";
  color: string;
  width: number;
  start: Point;
  end: Point;
};

export type PenOperation = {
  kind: "pen";
  color: string;
  width: number;
  points: Point[];
};

export type MosaicOperation = {
  kind: "mosaic";
  size: number;
  points: Point[];
};

export type TextOperation = {
  kind: "text";
  color: string;
  fontSize: number;
  position: Point;
  text: string;
  align: "left" | "center";
};

export type DrawOperation =
  | LineOperation
  | RectangleOperation
  | CircleOperation
  | PenOperation
  | MosaicOperation
  | TextOperation;

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RegionCaptureEditorProps = {
  payload: CaptureSuccessPayload;
  onConfirm: (dataUrl: string) => Promise<void> | void;
  onCancel: () => void;
  mode?: "full" | "inline";
  overlayRef?: RefObject<HTMLDivElement | null>;
  selectionRect?: SelectionRect | null;
  overlaySize?: { width: number; height: number } | null;
  dockOffset?: number;
  initialTool?: EditorTool;
  initialStrokeColor?: string;
  initialStrokeWidth?: number;
  initialMosaicSize?: number;
  initialTextSize?: number;
  onToolbarBridgeChange?: (bridge: RegionCaptureEditorBridge | null) => void;
};

export type TextEntryState = {
  canvasPoint: Point;
  clientX: number;
  clientY: number;
  value: string;
};

export type ToolbarPlacement = {
  placement: "inside" | "outside";
  position: {
    left: number;
    top: number;
  };
};

export type RegionCaptureEditorBridge = {
  tool: EditorTool;
  strokeColor: string;
  strokeWidth: number;
  mosaicSize: number;
  textSize: number;
  canUndo: boolean;
  canReset: boolean;
  isExporting: boolean;
  setTool: (tool: EditorTool) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setMosaicSize: (size: number) => void;
  setTextSize: (size: number) => void;
  undo: () => void;
  reset: () => void;
  cancel: () => void;
  confirm: () => void;
};
