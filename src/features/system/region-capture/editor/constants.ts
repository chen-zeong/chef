import type { EditorTool } from "./types";

export const TOOL_LABELS: Record<EditorTool, string> = {
  line: "画线",
  rectangle: "矩形",
  circle: "圈选",
  pen: "画笔",
  arrow: "箭头",
  mosaic: "马赛克",
  text: "文字"
};

export const TOOL_ORDER: EditorTool[] = [
  "line",
  "rectangle",
  "circle",
  "pen",
  "arrow",
  "mosaic",
  "text"
];

export const COLOR_CHOICES = ["#ff4d4f", "#ffc53d", "#4096ff", "#36cfc9", "#ffffff"];

export const STROKE_CHOICES = [
  { label: "细", value: 2 },
  { label: "中", value: 4 },
  { label: "粗", value: 6 }
];

export const DEFAULT_MOSAIC_SIZE = 42;
export const TOOLBAR_MARGIN = 12;
export const TEXT_SIZE_CHOICES = [
  { label: "小", value: 20 },
  { label: "中", value: 28 },
  { label: "大", value: 36 }
];
