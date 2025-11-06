import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RegionCaptureEditor } from "../RegionCaptureEditor";
import {
  COLOR_CHOICES,
  DEFAULT_MOSAIC_SIZE,
  STROKE_CHOICES,
  TEXT_SIZE_CHOICES
} from "../editor/constants";
import type {
  CaptureSuccessPayload,
  OverlayMetadata
} from "../regionCaptureTypes";
import { MIN_SELECTION_SIZE, RESIZE_HANDLES } from "./RegionCaptureOverlayConstants";
import {
  clampNumber,
  computeRect,
  createMoveInteraction,
  enforceMinimumSize,
  getActiveRect,
  getHandleCursor,
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
import type { EditorTool, RegionCaptureEditorBridge } from "../editor/types";
import { EditorToolbarControls } from "../editor/components/EditorToolbarControls";

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
  const [pendingTool, setPendingTool] = useState<EditorTool | null>(null);
  const [pendingStrokeColor, setPendingStrokeColor] = useState<string>(COLOR_CHOICES[0]);
  const [pendingStrokeWidth, setPendingStrokeWidth] = useState<number>(STROKE_CHOICES[1]?.value ?? 4);
  const [pendingMosaicSize, setPendingMosaicSize] = useState<number>(DEFAULT_MOSAIC_SIZE);
  const [pendingTextSize, setPendingTextSize] = useState<number>(TEXT_SIZE_CHOICES[1]?.value ?? 28);
  const [editorBridge, setEditorBridge] = useState<RegionCaptureEditorBridge | null>(null);
  const [editorInitialTool, setEditorInitialTool] = useState<EditorTool>("rectangle");
  const [editorInitialStrokeColor, setEditorInitialStrokeColor] = useState<string>(COLOR_CHOICES[0]);
  const [editorInitialStrokeWidth, setEditorInitialStrokeWidth] = useState<number>(4);
  const [editorInitialMosaicSize, setEditorInitialMosaicSize] = useState<number>(DEFAULT_MOSAIC_SIZE);
  const [editorInitialTextSize, setEditorInitialTextSize] = useState<number>(28);
  const toolPanelRef = useRef<HTMLDivElement | null>(null);
  const [toolPanelPlacement, setToolPanelPlacement] = useState<{
    top: number;
    left: number;
    translateX: string;
    translateY: string;
    mode: "outside" | "inside";
  } | null>(null);
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
    updateSelection(null);
    setCapturedRect(null);
    setDraftSelection(null);
    setDragStart(null);
    setInteraction(null);
    setPhase("idle");
    setError(null);
    setPendingTool(null);
    setPendingStrokeColor(COLOR_CHOICES[0]);
    setPendingStrokeWidth(STROKE_CHOICES[1]?.value ?? 4);
    setPendingMosaicSize(DEFAULT_MOSAIC_SIZE);
    setPendingTextSize(TEXT_SIZE_CHOICES[1]?.value ?? 28);
    setEditorInitialTool("rectangle");
    setEditorInitialStrokeColor(COLOR_CHOICES[0]);
    setEditorInitialStrokeWidth(4);
    setEditorInitialMosaicSize(DEFAULT_MOSAIC_SIZE);
    setEditorInitialTextSize(28);
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

  type CaptureIntent =
    | {
        kind: "edit";
        tool: EditorTool;
        strokeColor: string;
        strokeWidth: number;
        mosaicSize: number;
        textSize: number;
      }
    | { kind: "finalize" };

  const beginCapture = useCallback(
    async (rect: Rect, intent: CaptureIntent) => {
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

      setPhase("capturing");
      setCapturedRect(rect);
      setError(null);
      try {
        const payload = await invoke<CaptureSuccessPayload>("capture_region", { region });
        if (intent.kind === "edit") {
          setCaptureResult(payload);
          setEditorInitialTool(intent.tool);
          setEditorInitialStrokeColor(intent.strokeColor);
          setEditorInitialStrokeWidth(intent.strokeWidth);
          setEditorInitialMosaicSize(intent.mosaicSize);
          setEditorInitialTextSize(intent.textSize);
          setPhase("editing");
        } else {
          setPhase("finalizing");
          await invoke<CaptureSuccessPayload>("finalize_region_capture", {
            request: {
              path: payload.path,
              base64: payload.base64,
              width: payload.width,
              height: payload.height,
              logical_width: payload.logical_width,
              logical_height: payload.logical_height
            }
          });
          window.close();
        }
      } catch (issue) {
        if (intent.kind === "edit") {
          setCaptureResult(null);
        }
        setCapturedRect(null);
        const fallback =
          intent.kind === "edit" ? "截图失败，请重试。" : "保存截图失败，请重试。";
        const message =
          issue instanceof Error
            ? issue.message
            : typeof issue === "string"
              ? issue
              : fallback;
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
        return;
      }

      if (interaction && interaction.pointerId === event.pointerId) {
        setInteraction(null);
        setPhase("selected");
      }
    },
    [draftSelection, dragStart, interaction, metadata, phase, resetSelection, updateSelection]
  );

  const handleToolSelect = useCallback(
    (tool: EditorTool) => {
      setPendingTool(tool);
      if (phase === "selected") {
        const current = selectionRef.current;
        if (!current) {
          setError("请先框选有效区域。");
          return;
        }
        setEditorInitialTool(tool);
        setEditorInitialStrokeColor(pendingStrokeColor);
        setEditorInitialStrokeWidth(pendingStrokeWidth);
        setEditorInitialMosaicSize(pendingMosaicSize);
        setEditorInitialTextSize(pendingTextSize);
        void beginCapture(current, {
          kind: "edit",
          tool,
          strokeColor: pendingStrokeColor,
          strokeWidth: pendingStrokeWidth,
          mosaicSize: pendingMosaicSize,
          textSize: pendingTextSize
        });
      } else if (phase === "editing") {
        setEditorInitialTool(tool);
        editorBridge?.setTool(tool);
      }
    },
    [
      beginCapture,
      editorBridge,
      pendingMosaicSize,
      pendingStrokeColor,
      pendingStrokeWidth,
      pendingTextSize,
      phase
    ]
  );

  const handleStrokeColorChange = useCallback(
    (color: string) => {
      setPendingStrokeColor(color);
      if (phase === "selected") {
        setEditorInitialStrokeColor(color);
      } else if (phase === "editing") {
        setEditorInitialStrokeColor(color);
        editorBridge?.setStrokeColor(color);
      }
    },
    [editorBridge, phase]
  );

  const handleStrokeWidthChange = useCallback(
    (width: number) => {
      setPendingStrokeWidth(width);
      if (phase === "selected") {
        setEditorInitialStrokeWidth(width);
      } else if (phase === "editing") {
        setEditorInitialStrokeWidth(width);
        editorBridge?.setStrokeWidth(width);
      }
    },
    [editorBridge, phase]
  );

  const handleMosaicSizeChange = useCallback(
    (size: number) => {
      setPendingMosaicSize(size);
      if (phase === "selected") {
        setEditorInitialMosaicSize(size);
      } else if (phase === "editing") {
        setEditorInitialMosaicSize(size);
        editorBridge?.setMosaicSize(size);
      }
    },
    [editorBridge, phase]
  );

  const handleTextSizeChange = useCallback(
    (size: number) => {
      setPendingTextSize(size);
      if (phase === "selected") {
        setEditorInitialTextSize(size);
      } else if (phase === "editing") {
        setEditorInitialTextSize(size);
        editorBridge?.setTextSize(size);
      }
    },
    [editorBridge, phase]
  );

  const handleQuickFinalize = useCallback(() => {
    if (phase === "selected") {
      const current = selectionRef.current;
      if (!current) {
        setError("请先框选有效区域。");
        return;
      }
      void beginCapture(current, { kind: "finalize" });
    } else if (phase === "editing") {
      void editorBridge?.confirm();
    }
  }, [beginCapture, editorBridge, phase]);

  const handleToolbarUndo = useCallback(() => {
    if (phase === "editing") {
      editorBridge?.undo?.();
    }
  }, [editorBridge, phase]);

  const handleToolbarReset = useCallback(() => {
    if (phase === "editing") {
      editorBridge?.reset?.();
    } else if (phase === "selected") {
      resetSelection();
    }
  }, [editorBridge, phase, resetSelection]);

  const handleToolbarConfirm = useCallback(() => {
    handleQuickFinalize();
  }, [handleQuickFinalize]);

  useEffect(() => {
    if (phase !== "selected") {
      return;
    }
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleQuickFinalize();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleQuickFinalize, phase]);

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

  const handleToolbarCancel = useCallback(() => {
    if (phase === "editing") {
      editorBridge?.cancel?.();
    } else {
      void handleCancel();
    }
  }, [editorBridge, handleCancel, phase]);

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

  useEffect(() => {
    if (phase === "editing" && editorBridge) {
      setPendingTool(editorBridge.tool);
      setPendingStrokeColor(editorBridge.strokeColor);
      setPendingStrokeWidth(editorBridge.strokeWidth);
      setPendingMosaicSize(editorBridge.mosaicSize);
      setPendingTextSize(editorBridge.textSize);
      setEditorInitialTool(editorBridge.tool);
      setEditorInitialStrokeColor(editorBridge.strokeColor);
      setEditorInitialStrokeWidth(editorBridge.strokeWidth);
      setEditorInitialMosaicSize(editorBridge.mosaicSize);
      setEditorInitialTextSize(editorBridge.textSize);
    }
  }, [editorBridge, phase]);

  useLayoutEffect(() => {
    const referenceRect =
      phase === "editing" && capturedRect ? capturedRect : selection;

    if (!referenceRect || !overlaySize) {
      setToolPanelPlacement(null);
      return;
    }

    const margin = 12;
    const panel = toolPanelRef.current;
    const panelHeight = panel?.offsetHeight ?? 0;
    const panelWidth = panel?.offsetWidth ?? 0;
    const anchorBottom = referenceRect.y + referenceRect.height;
    const availableBelow = overlaySize.height - anchorBottom - margin;

    let top: number;
    let translateY: string;
    let mode: "outside" | "inside";

    if (panelHeight > 0 && availableBelow >= panelHeight) {
      top = anchorBottom + margin;
      translateY = "0";
      mode = "outside";
    } else {
      const anchor = anchorBottom - margin;
      if (!panel || panelHeight === 0) {
        top = anchor;
        translateY = "-100%";
        mode = "inside";
      } else {
        const panelTop = anchor - panelHeight;
        const minTop = referenceRect.y + margin;
        const delta = panelTop < minTop ? minTop - panelTop : 0;
        top = anchor;
        translateY = delta > 0 ? `calc(-100% + ${delta}px)` : "-100%";
        mode = "inside";
      }
    }

    const anchorCenterX = referenceRect.x + referenceRect.width / 2;
    const availableWidth = overlaySize.width;
    let left: number;
    let translateX = "-50%";

    if (panel && panelWidth > 0) {
      const minLeft = margin;
      const maxLeft = Math.max(minLeft, availableWidth - margin - panelWidth);
      const desiredLeft = anchorCenterX - panelWidth / 2;
      left = clampNumber(desiredLeft, minLeft, maxLeft);
      translateX = "0";
    } else {
      const minLeft = margin;
      const maxLeft = Math.max(minLeft, availableWidth - margin);
      left = clampNumber(anchorCenterX, minLeft, maxLeft);
      translateX = "-50%";
    }

    setToolPanelPlacement((previous) => {
      if (
        previous &&
        previous.top === top &&
        previous.left === left &&
        previous.translateX === translateX &&
        previous.translateY === translateY &&
        previous.mode === mode
      ) {
        return previous;
      }
      return {
        top,
        left,
        translateX,
        translateY,
        mode
      };
    });
  }, [capturedRect, overlaySize, phase, pendingTool, selection]);

  const activeRect = getActiveRect(selection, draftSelection);

  const overlayMask = useMemo(() => {
    const baseClass = "pointer-events-none absolute z-10 bg-[rgba(0,0,0,0.35)]";
    if (!overlaySize || !activeRect) {
      return <div className={`${baseClass} inset-0`} />;
    }

    const segments: ReactNode[] = [];
    const totalWidth = overlaySize.width;
    const totalHeight = overlaySize.height;
    const { x, y, width, height } = activeRect;
    const rightWidth = Math.max(0, totalWidth - (x + width));
    const bottomHeight = Math.max(0, totalHeight - (y + height));

    if (y > 0) {
      segments.push(
        <div
          key="shade-top"
          className={baseClass}
          style={{ top: 0, left: 0, width: totalWidth, height: y }}
        />
      );
    }

    if (bottomHeight > 0) {
      segments.push(
        <div
          key="shade-bottom"
          className={baseClass}
          style={{ top: y + height, left: 0, width: totalWidth, height: bottomHeight }}
        />
      );
    }

    if (x > 0 && height > 0) {
      segments.push(
        <div
          key="shade-left"
          className={baseClass}
          style={{ top: y, left: 0, width: x, height }}
        />
      );
    }

    if (rightWidth > 0 && height > 0) {
      segments.push(
        <div
          key="shade-right"
          className={baseClass}
          style={{ top: y, left: x + width, width: rightWidth, height }}
        />
      );
    }

    if (segments.length === 0) {
      return <div className={`${baseClass} inset-0`} />;
    }

    return segments;
  }, [activeRect, overlaySize]);

  const selectionStyle = activeRect
    ? {
        left: `${activeRect.x}px`,
        top: `${activeRect.y}px`,
        width: `${activeRect.width}px`,
        height: `${activeRect.height}px`,
        cursor: selection && phase === "selected" ? "move" : undefined
      }
    : undefined;

  const inlineRect = capturedRect;
  const toolbarAnchorRect =
    phase === "editing" && capturedRect ? capturedRect : activeRect;
  const toolbarAnchorCenter =
    toolbarAnchorRect ? toolbarAnchorRect.x + toolbarAnchorRect.width / 2 : 0;
  const toolPanelStyle = toolPanelPlacement
    ? {
        left: `${toolPanelPlacement.left}px`,
        top: `${toolPanelPlacement.top}px`,
        transform: `translate(${toolPanelPlacement.translateX}, ${toolPanelPlacement.translateY})`
      }
    : undefined;
  const isEditingPhase = phase === "editing";
  const toolbarExporting =
    isEditingPhase ? Boolean(editorBridge?.isExporting) : phase === "capturing" || phase === "finalizing";
  const toolbarCanUndo = isEditingPhase ? Boolean(editorBridge?.canUndo) : false;
  const toolbarHasDraft = isEditingPhase ? Boolean(editorBridge?.canReset) : false;
  const shouldShowToolbar =
    Boolean(toolbarAnchorRect) &&
    (phase === "selected" || phase === "editing" || phase === "capturing");
  const isToolbarLocked = phase === "capturing" || phase === "finalizing";

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
      {overlayMask}

      {!isEditing && (
        <div className="pointer-events-auto absolute right-6 top-6 flex gap-2 text-xs">
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

      {activeRect && (
        <div
          className={clsx(
            "absolute bg-transparent",
            phase === "selected" ? "pointer-events-auto" : "pointer-events-none",
            phase === "editing" ? "z-30" : "z-20"
          )}
          style={{
            ...(selectionStyle ?? {}),
            outline: "2px solid rgba(80,160,255,0.95)",
            outlineOffset: 0
          }}
          onPointerDown={
            selection && phase === "selected" ? handleSelectionPointerDown : undefined
          }
        >
          {selection && phase === "selected" &&
            RESIZE_HANDLES.map((handle) => (
              <div
                key={handle}
                onPointerDown={handleResizePointerDown(handle)}
                className={getHandleClass(handle)}
                style={{ cursor: getHandleCursor(handle) }}
              />
            ))}
        </div>
      )}

      {shouldShowToolbar ? (
        <div
          ref={toolPanelRef}
          className={clsx(
            "pointer-events-auto absolute z-30 w-max max-w-[min(95vw,1280px)] overflow-x-auto rounded-2xl px-4 py-3 text-xs text-white shadow-lg backdrop-blur",
            toolPanelPlacement?.mode === "inside"
              ? "bg-[rgba(18,27,43,0.88)]"
              : "bg-[rgba(18,27,43,0.86)]",
            isToolbarLocked && "pointer-events-none"
          )}
          style={
            toolPanelStyle ?? {
              left: `${toolbarAnchorCenter}px`,
              top: `${toolPanelPlacement?.top ?? 0}px`,
              transform: `translate(-50%, ${toolPanelPlacement?.translateY ?? "0"})`
            }
          }
          onPointerDown={(event) => event.stopPropagation()}
        >
          <EditorToolbarControls
            variant="inline"
            className="gap-4"
            tool={pendingTool}
            onToolChange={handleToolSelect}
            strokeColor={pendingStrokeColor}
            onStrokeColorChange={handleStrokeColorChange}
            strokeWidth={pendingStrokeWidth}
            onStrokeWidthChange={handleStrokeWidthChange}
            mosaicSize={pendingMosaicSize}
            onMosaicSizeChange={handleMosaicSizeChange}
            textSize={pendingTextSize}
            onTextSizeChange={handleTextSizeChange}
            operationsCount={toolbarCanUndo ? 1 : 0}
            hasDraftOperation={toolbarHasDraft}
            isExporting={toolbarExporting}
            onUndo={handleToolbarUndo}
            onReset={handleToolbarReset}
            onCancel={handleToolbarCancel}
            onConfirm={handleToolbarConfirm}
          />
        </div>
      ) : (
        phase === "selected" && (
          <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 rounded-2xl bg-[rgba(18,27,43,0.78)] px-4 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur">
            <p>拖动鼠标框选区域，可直接拖动边框微调大小。</p>
            <p className="mt-1 text-[11px] text-white/75">选区完成后可在下方面板选择工具与样式，点击任意工具会自动进入编辑。</p>
          </div>
        )
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
        <div className="pointer-events-none absolute inset-0 z-10">
          <div
            className="pointer-events-auto absolute rounded-[18px]"
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
              mode="inline"
              overlayRef={overlayRef}
              selectionRect={inlineRect}
              overlaySize={overlaySize}
              dockOffset={dockOffset}
              initialTool={editorInitialTool}
              initialStrokeColor={editorInitialStrokeColor}
              initialStrokeWidth={editorInitialStrokeWidth}
              initialMosaicSize={editorInitialMosaicSize}
              initialTextSize={editorInitialTextSize}
              onToolbarBridgeChange={setEditorBridge}
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
            initialTool={editorInitialTool}
            initialStrokeColor={editorInitialStrokeColor}
            initialStrokeWidth={editorInitialStrokeWidth}
            initialMosaicSize={editorInitialMosaicSize}
            initialTextSize={editorInitialTextSize}
            onToolbarBridgeChange={setEditorBridge}
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
