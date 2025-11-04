import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type OverlayMetadata = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  scaleFactor: number;
  logicalOriginX: number;
  logicalOriginY: number;
  logicalWidth: number;
  logicalHeight: number;
};

type Point = {
  x: number;
  y: number;
};

type Rect = Point & {
  width: number;
  height: number;
};

const HIDDEN_CLASS = "region-capture-overlay--hidden";

export function RegionCaptureOverlay() {
  const [metadata, setMetadata] = useState<OverlayMetadata | null>(() =>
    readMetadataFromQuery()
  );
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [status, setStatus] = useState<"idle" | "dragging" | "capturing">("idle");
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

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
    let isMounted = true;
    const setupListener = async () => {
      const unlisten = await listen("overlay-metadata", (event) => {
        if (!isMounted) {
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
      isMounted = false;
      if (typeof disposer === "function") {
        disposer();
      }
    };
  }, []);

  const effectiveSelection = useMemo(() => {
    if (!dragStart || !currentPoint) {
      return null;
    }
    return computeRect(dragStart, currentPoint);
  }, [dragStart, currentPoint]);

  useEffect(() => {
    if (effectiveSelection) {
      setSelection(effectiveSelection);
    }
  }, [effectiveSelection]);

  const resetSelection = useCallback(() => {
    const { classList } = document.body;
    classList.remove(HIDDEN_CLASS);
    setDragStart(null);
    setCurrentPoint(null);
    setSelection(null);
    setStatus("idle");
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (status === "capturing" || event.button !== 0) {
        return;
      }
      event.preventDefault();
      overlayRef.current?.setPointerCapture(event.pointerId);
      const point = toLocalPoint(event, overlayRef.current);
      setDragStart(point);
      setCurrentPoint(point);
      setSelection({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0
      });
      setStatus("dragging");
      setError(null);
    },
    [status]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragStart) {
        return;
      }
      setCurrentPoint(toLocalPoint(event, overlayRef.current));
    },
    [dragStart]
  );

  const handlePointerUp = useCallback(
    async (event: ReactPointerEvent<HTMLDivElement>) => {
      if (status === "capturing") {
        overlayRef.current?.releasePointerCapture(event.pointerId);
        return;
      }

      if (!dragStart) {
        overlayRef.current?.releasePointerCapture(event.pointerId);
        resetSelection();
        return;
      }

      overlayRef.current?.releasePointerCapture(event.pointerId);

      const endPoint = toLocalPoint(event, overlayRef.current);
      setCurrentPoint(endPoint);
      const rect = computeRect(dragStart, endPoint);

      if (!metadata) {
        setError("未能获取显示器信息，请取消后重试。");
        resetSelection();
        return;
      }

      const minSize = 4;
      if (rect.width < minSize || rect.height < minSize) {
        setError("选区太小，请再次拖拽。");
        resetSelection();
        return;
      }

      setSelection(rect);
      setStatus("capturing");

      const logicalMonitorRight = metadata.logicalOriginX + metadata.logicalWidth;
      const logicalMonitorBottom = metadata.logicalOriginY + metadata.logicalHeight;

      const logicalStartX = metadata.logicalOriginX + rect.x;
      const logicalStartY = metadata.logicalOriginY + rect.y;
      const logicalEndX = metadata.logicalOriginX + rect.x + rect.width;
      const logicalEndY = metadata.logicalOriginY + rect.y + rect.height;

      const logicalLeft = clampNumber(
        logicalStartX,
        metadata.logicalOriginX,
        logicalMonitorRight
      );
      const logicalTop = clampNumber(
        logicalStartY,
        metadata.logicalOriginY,
        logicalMonitorBottom
      );
      const logicalRight = clampNumber(logicalEndX, logicalLeft, logicalMonitorRight);
      const logicalBottom = clampNumber(logicalEndY, logicalTop, logicalMonitorBottom);

      const logicalWidth = Math.round(logicalRight - logicalLeft);
      const logicalHeight = Math.round(logicalBottom - logicalTop);

      if (logicalWidth <= 0 || logicalHeight <= 0) {
        setError("选区超出当前显示器范围，请重新选择。");
        resetSelection();
        return;
      }

      const { scaleX, scaleY } = getScale(metadata, overlayRef.current);
      const region = {
        x: Math.round(logicalLeft),
        y: Math.round(logicalTop),
        width: Math.max(1, logicalWidth),
        height: Math.max(1, logicalHeight),
        scaleX,
        scaleY
      };

      document.body.classList.add(HIDDEN_CLASS);

      try {
        await invoke("capture_region", { region });
        window.close();
      } catch (issue) {
        const message =
          issue instanceof Error
            ? issue.message
            : typeof issue === "string"
              ? issue
              : "截图失败，请重试。";
        setError(message);
        resetSelection();
      }
    },
    [dragStart, metadata, resetSelection, status]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      overlayRef.current?.releasePointerCapture(event.pointerId);
      resetSelection();
    },
    [resetSelection]
  );

  const selectionLabel = useMemo(() => {
    if (!selection || !metadata) {
      return null;
    }
    const { scaleX, scaleY } = getScale(metadata, overlayRef.current);
    const width = Math.round(selection.width * scaleX);
    const height = Math.round(selection.height * scaleY);
    return `${width} × ${height}`;
  }, [metadata, selection]);

  return (
    <div
      ref={overlayRef}
      role="presentation"
      className="relative flex h-full w-full select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.35)]" />

      {selection && (
        <div
          className="pointer-events-none absolute border-2 border-[rgba(80,160,255,0.95)] bg-[rgba(80,160,255,0.18)] shadow-[0_0_0_1px_rgba(255,255,255,0.5)] backdrop-blur-sm"
          style={{
            left: `${selection.x}px`,
            top: `${selection.y}px`,
            width: `${selection.width}px`,
            height: `${selection.height}px`
          }}
        >
          {selectionLabel && (
            <div className="absolute -top-8 left-0 rounded-lg bg-[rgba(18,27,43,0.78)] px-2 py-1 text-xs font-semibold text-white shadow-lg">
              {selectionLabel}
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 rounded-2xl bg-[rgba(18,27,43,0.78)] px-4 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur">
        <p>拖动鼠标框选区域，松开后自动截图。</p>
        <p className="mt-1 text-[11px] text-white/75">按 Esc 取消，截图过程中请勿切换窗口。</p>
      </div>

      {status === "capturing" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
          正在生成截图…
        </div>
      )}

      {error && status !== "capturing" && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl bg-[rgba(240,60,60,0.18)] px-3 py-2 text-sm text-[#ffd7d7] backdrop-blur">
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
