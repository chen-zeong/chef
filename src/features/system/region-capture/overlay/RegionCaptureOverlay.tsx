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
import { RegionCaptureEditor } from "../RegionCaptureEditor";
import type {
  CaptureSuccessPayload,
  OverlayMetadata
} from "../regionCaptureTypes";
import {
  HIDDEN_CLASS,
  MIN_SELECTION_SIZE,
  RESIZE_HANDLES
} from "./RegionCaptureOverlayConstants";
import {
  clampNumber,
  computeRect,
  createMoveInteraction,
  enforceMinimumSize,
  getActiveRect,
  getHandleClass,
  getOverlayBounds,
  getScale,
  isPointWithinRect,
  moveRect,
  normalizeMetadata,
  readMetadataFromQuery,
  resizeRect,
  toLocalPoint
} from "./RegionCaptureOverlayUtils";
import type {
  InteractionState,
  OverlayPhase,
  Point,
  Rect,
  ResizeHandle
} from "./RegionCaptureOverlayTypes";

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
  const [capturedRect, setCapturedRect] = useState<Rect | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);
  const [dockOffset, setDockOffset] = useState(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const selectionRef = useRef<Rect | null>(null);

  const isEditing = phase === "editing" && captureResult;

  useEffect(() => {
    void invoke("set_current_window_always_on_top", {
      allow_input_panel: Boolean(isEditing)
    }).catch(() => undefined);
  }, [isEditing]);

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

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      const bounds = getOverlayBounds(element);
      if (bounds) {
        setOverlaySize(bounds);
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const computeDockOffset = () => {
      const { screen } = window;
      const rawHeight = screen?.height ?? window.innerHeight;
      const availHeight = screen?.availHeight ?? window.innerHeight;
      const availTop = (screen as { availTop?: number }).availTop ?? 0;
      const dockHeight = Math.max(0, rawHeight - availTop - availHeight);
      const scale = window.devicePixelRatio || 1;
      const normalized = dockHeight / scale;
      setDockOffset((previous) => {
        if (Math.abs(previous - normalized) < 0.5) {
          return previous;
        }
        return normalized;
      });
    };

    computeDockOffset();
    window.addEventListener("resize", computeDockOffset);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", computeDockOffset);
    return () => {
      window.removeEventListener("resize", computeDockOffset);
      viewport?.removeEventListener("resize", computeDockOffset);
    };
  }, []);

  const updateSelection = useCallback((next: Rect | null) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const resetSelection = useCallback(() => {
    document.body.classList.remove(HIDDEN_CLASS);
    updateSelection(null);
    setCapturedRect(null);
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
      setCapturedRect(rect);
      try {
        const payload = await invoke<CaptureSuccessPayload>("capture_region", { region });
        document.body.classList.remove(HIDDEN_CLASS);
        setCaptureResult(payload);
        setPhase("editing");
        setError(null);
      } catch (issue) {
        document.body.classList.remove(HIDDEN_CLASS);
        setCapturedRect(null);
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
      setInteraction(createMoveInteraction(event.pointerId, point, selection));
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
    setCapturedRect(null);
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

  const activeRect = getActiveRect(selection, draftSelection);

  const selectionStyle = activeRect
    ? {
        left: `${activeRect.x}px`,
        top: `${activeRect.y}px`,
        width: `${activeRect.width}px`,
        height: `${activeRect.height}px`
      }
    : undefined;

  const inlineRect = capturedRect;

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
          className="absolute border-2 border-[rgba(80,160,255,0.95)] bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.4)]"
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

      {isEditing && captureResult && inlineRect && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="pointer-events-auto absolute rounded-[18px] border border-[rgba(80,160,255,0.4)] shadow-[0_12px_30px_rgba(15,23,42,0.35)]"
            style={{
              left: `${inlineRect.x}px`,
              top: `${inlineRect.y}px`,
              width: `${inlineRect.width}px`,
              height: `${inlineRect.height}px`
            }}
          >
            <RegionCaptureEditor
              payload={captureResult}
              onConfirm={handleFinalize}
              onCancel={handleCancel}
              onRetake={handleRetake}
              mode="inline"
              overlayRef={overlayRef}
              selectionRect={inlineRect}
              overlaySize={overlaySize}
              dockOffset={dockOffset}
            />
          </div>
        </div>
      )}

      {isEditing && captureResult && !capturedRect && (
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
