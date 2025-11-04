import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RegionCaptureEditor } from "./RegionCaptureEditor";
import type {
  CaptureSuccessPayload,
  OverlayMetadata
} from "./regionCaptureTypes";

type OverlayPhase =
  | "idle"
  | "drawing"
  | "selected"
  | "capturing"
  | "editing"
  | "finalizing";

type Point = {
  x: number;
  y: number;
};

type Rect = Point & {
  width: number;
  height: number;
};

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type InteractionState =
  | {
      mode: "move";
      pointerId: number;
      offset: Point;
      initial: Rect;
    }
  | {
      mode: "resize";
      pointerId: number;
      handle: ResizeHandle;
      initial: Rect;
    };

const HIDDEN_CLASS = "region-capture-overlay--hidden";
const MIN_SELECTION_SIZE = 6;
const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function RegionCaptureOverlay() {
  const [metadata, setMetadata] = useState<OverlayMetadata | null>(() =>
    readMetadataFromQuery()
  );
  const [phase, setPhase] = useState<OverlayPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [draftSelection, setDraftSelection] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureSuccessPayload | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const selectionRef = useRef<Rect | null>(null);

  const isEditing = phase === "editing" && captureResult;

  useEffect(() => {
    const { classList } = document.body;
    classList.add("region-capture-overlay");

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        await invoke("cancel_region_capture").catch(() => undefined);
        window.close();
      }
    };

    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", preventContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", preventContextMenu);
      classList.remove("region-capture-overlay");
      classList.remove(HIDDEN_CLASS);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const setupListener = async () => {
      const unlisten = await listen("overlay-metadata", (event) => {
        if (!mounted) {
          return;
        }
        const parsed = normalizeMetadata(event.payload);
        if (parsed) {
          setMetadata(parsed);
        }
      });
      return unlisten;
    };

    let disposer: (() => void) | undefined;
    setupListener()
      .then((unlisten) => {
        disposer = unlisten;
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      if (typeof disposer === "function") {
        disposer();
      }
    };
  }, []);

  const updateSelection = useCallback((next: Rect | null) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const resetSelection = useCallback(() => {
    document.body.classList.remove(HIDDEN_CLASS);
    updateSelection(null);
    setDraftSelection(null);
    setDragStart(null);
    setInteraction(null);
    setPhase("idle");
    setError(null);
  }, [updateSelection]);

  const handleOverlayPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isEditing || phase === "capturing" || phase === "finalizing") {
        return;
      }
      if (selection && isPointWithinRect(toLocalPoint(event, overlayRef.current), selection)) {
        return;
      }
      setPhase("drawing");
      setError(null);
      const point = toLocalPoint(event, overlayRef.current);
      activePointerIdRef.current = event.pointerId;
      overlayRef.current?.setPointerCapture(event.pointerId);
      setDragStart(point);
      setDraftSelection({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0
      });
      updateSelection(null);
    },
    [isEditing, phase, selection, updateSelection]
  );

  const handleOverlayPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (phase === "editing" || phase === "capturing" || phase === "finalizing") {
        return;
      }

      const point = toLocalPoint(event, overlayRef.current);

      if (phase === "drawing" && dragStart && activePointerIdRef.current === event.pointerId) {
        setDraftSelection(computeRect(dragStart, point));
        return;
      }

      if (interaction && interaction.pointerId === event.pointerId && selection) {
        const bounds = getOverlayBounds(overlayRef.current);
        if (!bounds) {
          return;
        }
        if (interaction.mode === "move") {
          const next = moveRect(interaction.initial, point, interaction.offset, bounds);
          updateSelection(next);
        } else if (interaction.mode === "resize") {
          const next = resizeRect(interaction.initial, point, interaction.handle, bounds);
          updateSelection(next);
        }
      }
    },
    [dragStart, interaction, phase, selection, updateSelection]
  );

  const beginCapture = useCallback(
    async (rect: Rect) => {
      if (!metadata || phase === "capturing" || phase === "finalizing") {
        return;
      }

      const { scaleX, scaleY } = getScale(metadata, overlayRef.current);

      const logicalMonitorRight = metadata.logicalOriginX + metadata.logicalWidth;
      const logicalMonitorBottom = metadata.logicalOriginY + metadata.logicalHeight;

      const logicalLeft = clampNumber(
        metadata.logicalOriginX + rect.x,
        metadata.logicalOriginX,
        logicalMonitorRight
      );
      const logicalTop = clampNumber(
        metadata.logicalOriginY + rect.y,
        metadata.logicalOriginY,
        logicalMonitorBottom
      );
      const logicalRight = clampNumber(
        logicalLeft + rect.width,
        logicalLeft,
        logicalMonitorRight
      );
      const logicalBottom = clampNumber(
        logicalTop + rect.height,
        logicalTop,
        logicalMonitorBottom
      );

      const logicalWidth = Math.round(logicalRight - logicalLeft);
      const logicalHeight = Math.round(logicalBottom - logicalTop);

      if (logicalWidth < 1 || logicalHeight < 1) {
        setError("选区尺寸无效，请重新调整。");
        setPhase("selected");
        return;
      }

      const region = {
        x: Math.round(logicalLeft),
        y: Math.round(logicalTop),
        width: Math.max(1, logicalWidth),
        height: Math.max(1, logicalHeight),
        scaleX,
        scaleY
      };

      document.body.classList.add(HIDDEN_CLASS);
      setPhase("capturing");
      try {
        const payload = await invoke<CaptureSuccessPayload>("capture_region", { region });
        document.body.classList.remove(HIDDEN_CLASS);
        setCaptureResult(payload);
        setPhase("editing");
        setError(null);
      } catch (issue) {
        document.body.classList.remove(HIDDEN_CLASS);
        const message =
          issue instanceof Error
            ? issue.message
            : typeof issue === "string"
              ? issue
              : "截图失败，请重试。";
        setError(message);
        setPhase("selected");
      }
    },
    [metadata, phase]
  );

  const handleOverlayPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
        overlayRef.current.releasePointerCapture(event.pointerId);
      }

      if (phase === "drawing" && dragStart && draftSelection && activePointerIdRef.current === event.pointerId) {
        activePointerIdRef.current = null;
        if (!metadata) {
          setError("未能获取显示器信息，请取消后重试。");
          resetSelection();
          return;
        }
        if (
          draftSelection.width < MIN_SELECTION_SIZE ||
          draftSelection.height < MIN_SELECTION_SIZE
        ) {
          setError("选区太小，请重新拖拽。");
          resetSelection();
          return;
        }
        const rect = enforceMinimumSize(draftSelection, MIN_SELECTION_SIZE);
        updateSelection(rect);
        setDraftSelection(null);
        setPhase("selected");
        setDragStart(null);
        void beginCapture(rect);
        return;
      }

      if (interaction && interaction.pointerId === event.pointerId) {
        setInteraction(null);
        setPhase("selected");
        const current = selectionRef.current;
        if (current) {
          void beginCapture(current);
        }
      }
    },
    [beginCapture, draftSelection, dragStart, interaction, metadata, phase, resetSelection, updateSelection]
  );

  const handleSelectionPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!selection || phase !== "selected" || event.button !== 0) {
        return;
      }
      event.stopPropagation();
      const point = toLocalPoint(event, overlayRef.current);
      overlayRef.current?.setPointerCapture(event.pointerId);
      setInteraction({
        mode: "move",
        pointerId: event.pointerId,
        initial: selection,
        offset: {
          x: point.x - selection.x,
          y: point.y - selection.y
        }
      });
    },
    [phase, selection]
  );

  const handleResizePointerDown = useCallback(
    (handle: ResizeHandle) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!selection || phase !== "selected" || event.button !== 0) {
        return;
      }
      event.stopPropagation();
      const point = toLocalPoint(event, overlayRef.current);
      overlayRef.current?.setPointerCapture(event.pointerId);
      setInteraction({
        mode: "resize",
        pointerId: event.pointerId,
        handle,
        initial: selection
      });
    },
    [phase, selection]
  );

  const handleCancel = useCallback(async () => {
    await invoke("cancel_region_capture").catch(() => undefined);
    window.close();
  }, []);

  const handleFinalize = useCallback(
    async (dataUrl: string) => {
      if (!captureResult || phase !== "editing") {
        return;
      }
      setPhase("finalizing");
      try {
        await invoke<CaptureSuccessPayload>("finalize_region_capture", {
          request: {
            path: captureResult.path,
            base64: dataUrl,
            width: captureResult.width,
            height: captureResult.height,
            logical_width: captureResult.logical_width,
            logical_height: captureResult.logical_height
          }
        });
        window.close();
      } catch (issue) {
        const message =
          issue instanceof Error
            ? issue.message
            : typeof issue === "string"
              ? issue
              : "保存截图失败，请重试。";
        setError(message);
        setPhase("editing");
      }
    },
    [captureResult, phase]
  );

  const handleRetake = useCallback(() => {
    setCaptureResult(null);
    setPhase("selected");
    document.body.classList.remove(HIDDEN_CLASS);
    setError(null);
  }, []);

  const sizeLabel = useMemo(() => {
    if (!selection || !metadata) {
      return null;
    }
    const { scaleX, scaleY } = getScale(metadata, overlayRef.current);
    const width = Math.round(selection.width * scaleX);
    const height = Math.round(selection.height * scaleY);
    return `${width} × ${height}`;
  }, [metadata, selection]);

  const activeRect = selection ?? draftSelection;

  const selectionStyle = activeRect
    ? {
        left: `${activeRect.x}px`,
        top: `${activeRect.y}px`,
        width: `${activeRect.width}px`,
        height: `${activeRect.height}px`
      }
    : undefined;

  return (
    <div
      ref={overlayRef}
      role="presentation"
      className="relative flex h-full w-full select-none touch-none"
      onPointerDown={handleOverlayPointerDown}
      onPointerMove={handleOverlayPointerMove}
      onPointerUp={handleOverlayPointerUp}
      onPointerCancel={handleOverlayPointerUp}
    >
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.35)]" />

      {!isEditing && (
        <div className="pointer-events-auto absolute right-6 top-6 flex gap-2 text-xs">
          {selection && (
            <button
              type="button"
              className="rounded-lg bg-[rgba(255,255,255,0.18)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.3)]"
              onClick={resetSelection}
              disabled={phase === "capturing" || phase === "finalizing"}
            >
              重新框选
            </button>
          )}
          <button
            type="button"
            className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.25)]"
            onClick={handleCancel}
            disabled={phase === "capturing" || phase === "finalizing"}
          >
            取消
          </button>
        </div>
      )}

      {!isEditing && activeRect && (
        <div
          className="absolute border-2 border-[rgba(80,160,255,0.95)] bg-[rgba(80,160,255,0.18)] shadow-[0_0_0_1px_rgba(255,255,255,0.4)] backdrop-blur-sm"
          style={selectionStyle}
          onPointerDown={selection ? handleSelectionPointerDown : undefined}
        >
          {selection && sizeLabel && (
            <div className="pointer-events-none absolute -top-8 left-0 rounded-lg bg-[rgba(18,27,43,0.78)] px-2 py-1 text-xs font-semibold text-white shadow-lg">
              {sizeLabel}
            </div>
          )}
          {selection &&
            RESIZE_HANDLES.map((handle) => (
              <div
                key={handle}
                onPointerDown={handleResizePointerDown(handle)}
                className={getHandleClass(handle)}
              />
            ))}
        </div>
      )}

      {!isEditing && phase !== "capturing" && phase !== "finalizing" && (
        <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 rounded-2xl bg-[rgba(18,27,43,0.78)] px-4 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur">
          <p>拖动鼠标框选区域，松开后自动进入编辑工具。</p>
          <p className="mt-1 text-[11px] text-white/75">
            拖动框体边缘可微调大小，按 Esc 可随时取消。
          </p>
        </div>
      )}

      {phase === "capturing" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
          正在生成截图…
        </div>
      )}

      {phase === "finalizing" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
          正在保存编辑结果…
        </div>
      )}

      {isEditing && captureResult && (
        <div className="absolute inset-0 bg-[rgba(12,19,31,0.68)] backdrop-blur-md">
          <RegionCaptureEditor
            payload={captureResult}
            onConfirm={handleFinalize}
            onCancel={handleCancel}
            onRetake={handleRetake}
          />
        </div>
      )}

      {error && !isEditing && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl bg-[rgba(240,60,60,0.18)] px-3 py-2 text-sm text-[#ffd7d7] backdrop-blur">
          {error}
        </div>
      )}

      {error && isEditing && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-[rgba(240,60,60,0.24)] px-4 py-2 text-sm text-[#ffd7d7] backdrop-blur">
          {error}
        </div>
      )}
    </div>
  );
}

function readMetadataFromQuery(): OverlayMetadata | null {
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

function normalizeMetadata(input: unknown): OverlayMetadata | null {
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

function toNumber(value: unknown): number | null {
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

function computeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { x, y, width, height };
}

function enforceMinimumSize(rect: Rect, minSize: number): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, minSize),
    height: Math.max(rect.height, minSize)
  };
}

function toLocalPoint(
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

function clampNumber(value: number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function getScale(metadata: OverlayMetadata, element: HTMLDivElement | null) {
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

function getOverlayBounds(element: HTMLDivElement | null) {
  if (!element) {
    return null;
  }
  return {
    width: element.clientWidth,
    height: element.clientHeight
  };
}

function moveRect(
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

function resizeRect(
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

function getHandleClass(handle: ResizeHandle) {
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

function isPointWithinRect(point: Point, rect: Rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
