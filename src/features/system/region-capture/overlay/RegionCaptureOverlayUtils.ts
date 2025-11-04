import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  InteractionState,
  Point,
  Rect,
  ResizeHandle
} from "./RegionCaptureOverlayTypes";
import { MIN_SELECTION_SIZE } from "./RegionCaptureOverlayConstants";
import type { OverlayMetadata } from "../regionCaptureTypes";

export function readMetadataFromQuery(): OverlayMetadata | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("window") !== "overlay") {
    return null;
  }
  return normalizeMetadata({
    origin_x: params.get("origin_x"),
    origin_y: params.get("origin_y"),
    width: params.get("width"),
    height: params.get("height"),
    scale_factor: params.get("scale") ?? params.get("scale_factor"),
    logical_origin_x: params.get("logical_origin_x"),
    logical_origin_y: params.get("logical_origin_y"),
    logical_width: params.get("logical_width"),
    logical_height: params.get("logical_height")
  });
}

export function normalizeMetadata(input: unknown): OverlayMetadata | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as Record<string, unknown>;

  const originX = toNumber(candidate.originX ?? candidate.origin_x);
  const originY = toNumber(candidate.originY ?? candidate.origin_y);
  const width = toNumber(candidate.width);
  const height = toNumber(candidate.height);
  const scaleFactor =
    toNumber(candidate.scaleFactor ?? candidate.scale_factor ?? candidate.scale) ||
    window.devicePixelRatio ||
    1;
  const logicalOriginX =
    toNumber(candidate.logicalOriginX ?? candidate.logical_origin_x) ??
    (originX !== null ? originX / scaleFactor : null);
  const logicalOriginY =
    toNumber(candidate.logicalOriginY ?? candidate.logical_origin_y) ??
    (originY !== null ? originY / scaleFactor : null);
  const logicalWidth =
    toNumber(candidate.logicalWidth ?? candidate.logical_width) ??
    (width !== null ? width / scaleFactor : null);
  const logicalHeight =
    toNumber(candidate.logicalHeight ?? candidate.logical_height) ??
    (height !== null ? height / scaleFactor : null);

  if (
    originX === null ||
    originY === null ||
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0 ||
    logicalOriginX === null ||
    logicalOriginY === null ||
    logicalWidth === null ||
    logicalHeight === null ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return null;
  }

  return {
    originX,
    originY,
    width,
    height,
    scaleFactor,
    logicalOriginX,
    logicalOriginY,
    logicalWidth,
    logicalHeight
  };
}

export function toNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function computeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { x, y, width, height };
}

export function enforceMinimumSize(rect: Rect, minSize: number): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, minSize),
    height: Math.max(rect.height, minSize)
  };
}

export function toLocalPoint(
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement | null
): Point {
  if (!element) {
    return { x: event.clientX, y: event.clientY };
  }
  const bounds = element.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const x = clampNumber(event.clientX - bounds.left, 0, width);
  const y = clampNumber(event.clientY - bounds.top, 0, height);
  return { x, y };
}

export function clampNumber(value: number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function getScale(metadata: OverlayMetadata, element: HTMLDivElement | null) {
  const fallback =
    (metadata.scaleFactor && metadata.scaleFactor > 0
      ? metadata.scaleFactor
      : window.devicePixelRatio || 1) ?? 1;

  const domWidth = element?.clientWidth ?? 0;
  const domHeight = element?.clientHeight ?? 0;

  const logicalWidth = metadata.logicalWidth || domWidth;
  const logicalHeight = metadata.logicalHeight || domHeight;

  const baseWidth = logicalWidth > 0 ? logicalWidth : domWidth;
  const baseHeight = logicalHeight > 0 ? logicalHeight : domHeight;

  const scaleX =
    metadata.width > 0 && baseWidth > 0 ? metadata.width / baseWidth : fallback;
  const scaleY =
    metadata.height > 0 && baseHeight > 0 ? metadata.height / baseHeight : fallback;

  return {
    scaleX: scaleX > 0 ? scaleX : fallback,
    scaleY: scaleY > 0 ? scaleY : fallback
  };
}

export function getOverlayBounds(element: HTMLDivElement | null) {
  if (!element) {
    return null;
  }
  return {
    width: element.clientWidth,
    height: element.clientHeight
  };
}

export function moveRect(
  initial: Rect,
  point: Point,
  offset: Point,
  bounds: { width: number; height: number }
): Rect {
  const maxX = Math.max(0, bounds.width - initial.width);
  const maxY = Math.max(0, bounds.height - initial.height);
  const x = clampNumber(point.x - offset.x, 0, maxX);
  const y = clampNumber(point.y - offset.y, 0, maxY);
  return {
    x,
    y,
    width: initial.width,
    height: initial.height
  };
}

export function resizeRect(
  initial: Rect,
  point: Point,
  handle: ResizeHandle,
  bounds: { width: number; height: number }
): Rect {
  let { x, y, width, height } = initial;
  const right = x + width;
  const bottom = y + height;

  let newLeft = x;
  let newTop = y;
  let newRight = right;
  let newBottom = bottom;

  switch (handle) {
    case "n":
      newTop = clampNumber(point.y, 0, bottom - MIN_SELECTION_SIZE);
      break;
    case "s":
      newBottom = clampNumber(point.y, y + MIN_SELECTION_SIZE, bounds.height);
      break;
    case "w":
      newLeft = clampNumber(point.x, 0, right - MIN_SELECTION_SIZE);
      break;
    case "e":
      newRight = clampNumber(point.x, x + MIN_SELECTION_SIZE, bounds.width);
      break;
    case "nw":
      newLeft = clampNumber(point.x, 0, right - MIN_SELECTION_SIZE);
      newTop = clampNumber(point.y, 0, bottom - MIN_SELECTION_SIZE);
      break;
    case "ne":
      newRight = clampNumber(point.x, x + MIN_SELECTION_SIZE, bounds.width);
      newTop = clampNumber(point.y, 0, bottom - MIN_SELECTION_SIZE);
      break;
    case "sw":
      newLeft = clampNumber(point.x, 0, right - MIN_SELECTION_SIZE);
      newBottom = clampNumber(point.y, y + MIN_SELECTION_SIZE, bounds.height);
      break;
    case "se":
      newRight = clampNumber(point.x, x + MIN_SELECTION_SIZE, bounds.width);
      newBottom = clampNumber(point.y, y + MIN_SELECTION_SIZE, bounds.height);
      break;
    default:
      break;
  }

  const clampedWidth = clampNumber(newRight - newLeft, MIN_SELECTION_SIZE, bounds.width);
  const clampedHeight = clampNumber(
    newBottom - newTop,
    MIN_SELECTION_SIZE,
    bounds.height
  );

  newLeft = clampNumber(newLeft, 0, bounds.width - clampedWidth);
  newTop = clampNumber(newTop, 0, bounds.height - clampedHeight);

  return {
    x: newLeft,
    y: newTop,
    width: clampedWidth,
    height: clampedHeight
  };
}

export function getHandleClass(handle: ResizeHandle) {
  const base =
    "absolute h-3 w-3 rounded-full border border-white bg-[rgba(80,160,255,0.95)] shadow-md";
  switch (handle) {
    case "n":
      return `${base} left-1/2 top-[-7px] -translate-x-1/2`;
    case "s":
      return `${base} left-1/2 bottom-[-7px] -translate-x-1/2`;
    case "e":
      return `${base} top-1/2 right-[-7px] -translate-y-1/2`;
    case "w":
      return `${base} top-1/2 left-[-7px] -translate-y-1/2`;
    case "ne":
      return `${base} right-[-7px] top-[-7px]`;
    case "nw":
      return `${base} left-[-7px] top-[-7px]`;
    case "se":
      return `${base} right-[-7px] bottom-[-7px]`;
    case "sw":
      return `${base} left-[-7px] bottom-[-7px]`;
    default:
      return base;
  }
}

export function isPointWithinRect(point: Point, rect: Rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function getActiveRect(selection: Rect | null, draftSelection: Rect | null) {
  if (selection) {
    return selection;
  }
  return draftSelection;
}

export function createMoveInteraction(
  pointerId: number,
  point: Point,
  selection: Rect
): InteractionState {
  return {
    mode: "move",
    pointerId,
    initial: selection,
    offset: {
      x: point.x - selection.x,
      y: point.y - selection.y
    }
  };
}
