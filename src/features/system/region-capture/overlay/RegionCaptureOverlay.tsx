import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Search } from "lucide-react";
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
  OverlayMetadata,
  WindowSnapTarget
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
import type {
  CaptureExportOptions,
  EditorTool,
  RegionCaptureEditorBridge
} from "../editor/types";
import { EditorToolbarControls } from "../editor/components/EditorToolbarControls";

const SNAP_EDGE_TOLERANCE = 12;
const SNAP_COVERAGE_THRESHOLD = 0.9;
const SNAP_POINTER_TOLERANCE_MULTIPLIER = 1.5;
const SNAP_REFRESH_INTERVAL = 1200;
const HOVER_SNAP_CLICK_TOLERANCE = 4;

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
  const hoverSnapCandidateRef = useRef<{
    rect: Rect;
    pointerId: number;
    startPoint: Point;
    hasMoved: boolean;
  } | null>(null);
  const [snapTargets, setSnapTargets] = useState<WindowSnapTarget[]>([]);
  const [hoverRect, setHoverRect] = useState<(Rect & { id: number; name: string }) | null>(null);
  const [finalizingMode, setFinalizingMode] = useState<"save" | "ocr">("save");
  const [ocrResultText, setOcrResultText] = useState<string | null>(null);
  const [ocrCopyLabel, setOcrCopyLabel] = useState("复制全部");
  const [ocrSearchQuery, setOcrSearchQuery] = useState("");
  const ocrCopyTimeoutRef = useRef<number | null>(null);
  const lineCopyTimeoutRef = useRef<number | null>(null);
  const [copiedLine, setCopiedLine] = useState<string | null>(null);
  const ocrSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState(
    () => (typeof document !== "undefined" && document.body.classList.contains("theme-dark")) ?? false
  );

  const isEditing = phase === "editing" && captureResult;
  const resetOcrResult = useCallback(() => {
    if (ocrCopyTimeoutRef.current) {
      window.clearTimeout(ocrCopyTimeoutRef.current);
      ocrCopyTimeoutRef.current = null;
    }
    setOcrCopyLabel("复制全部");
    setOcrResultText(null);
    setOcrSearchQuery("");
  }, []);

  useEffect(() => {
    void invoke("set_current_window_always_on_top", {
      allow_input_panel: Boolean(isEditing)
    }).catch(() => undefined);
  }, [isEditing]);

  useEffect(() => {
    if (phase === "ocr-result") {
      ocrSearchInputRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    const body = document.body;
    if (!body) {
      return;
    }
    const syncTheme = () => {
      setIsDarkTheme(body.classList.contains("theme-dark"));
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);


  useLayoutEffect(() => {
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
    return () => {
      if (ocrCopyTimeoutRef.current) {
        window.clearTimeout(ocrCopyTimeoutRef.current);
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

  useEffect(() => {
    let disposed = false;
    const fetchTargets = async () => {
      try {
        const result = await invoke<WindowSnapTarget[]>("list_window_snap_targets");
        if (!disposed) {
          setSnapTargets(result ?? []);
        }
      } catch {
        if (!disposed) {
          setSnapTargets([]);
        }
      }
    };

    fetchTargets();
    const timer = window.setInterval(fetchTargets, SNAP_REFRESH_INTERVAL);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "idle" || selection || draftSelection) {
      setHoverRect(null);
    }
  }, [draftSelection, phase, selection]);

  const updateSelection = useCallback((next: Rect | null) => {
    selectionRef.current = next;
    setSelection(next);
    if (next) {
      setHoverRect(null);
    }
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

  const localSnapTargets = useMemo<Array<Rect & { id: number; name: string }>>(() => {
    if (!metadata || !overlaySize || snapTargets.length === 0) {
      return [];
    }
    const overlayScaleX =
      metadata.logicalWidth > 0 ? overlaySize.width / metadata.logicalWidth : 1;
    const overlayScaleY =
      metadata.logicalHeight > 0 ? overlaySize.height / metadata.logicalHeight : 1;
    const { width: overlayWidth, height: overlayHeight } = overlaySize;
    return snapTargets
      .map((target) => {
        // Window bounds already use a top-left origin, so just offset by the overlay origin.
        const localTop = target.y - metadata.logicalOriginY;
        const localLeft = target.x - metadata.logicalOriginX;
        const projectedWidth = target.width;
        const projectedHeight = target.height;
        const left = localLeft * overlayScaleX;
        const top = localTop * overlayScaleY;
        const right = left + projectedWidth * overlayScaleX;
        const bottom = top + projectedHeight * overlayScaleY;
        const clippedLeft = clampNumber(left, 0, overlayWidth);
        const clippedTop = clampNumber(top, 0, overlayHeight);
        const clippedRight = clampNumber(right, clippedLeft, overlayWidth);
        const clippedBottom = clampNumber(bottom, clippedTop, overlayHeight);
        const clippedWidth = clippedRight - clippedLeft;
        const clippedHeight = clippedBottom - clippedTop;
        if (clippedWidth < MIN_SELECTION_SIZE || clippedHeight < MIN_SELECTION_SIZE) {
          return null;
        }
        return {
          id: target.id,
          name: target.name,
          x: clippedLeft,
          y: clippedTop,
          width: clippedWidth,
          height: clippedHeight
        };
      })
      .filter((rect): rect is Rect & { id: number; name: string } => Boolean(rect));
  }, [metadata, overlaySize, snapTargets]);

  const applyWindowSnap = useCallback(
    (rect: Rect, point: Point | null) => {
      if (!localSnapTargets.length) {
        return rect;
      }
      let snapped: Rect | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const target of localSnapTargets) {
        if (target.width <= 0 || target.height <= 0) {
          continue;
        }
        const pointerInside = point ? isPointWithinRect(point, target) : false;
        const intersection = rectIntersectionArea(rect, target);
        const coverage =
          intersection > 0 ? intersection / (target.width * target.height) : 0;
        if (!pointerInside && coverage < SNAP_COVERAGE_THRESHOLD) {
          continue;
        }
        const leftDiff = Math.abs(rect.x - target.x);
        const topDiff = Math.abs(rect.y - target.y);
        const rightDiff = Math.abs(
          rect.x + rect.width - (target.x + target.width)
        );
        const bottomDiff = Math.abs(
          rect.y + rect.height - (target.y + target.height)
        );
        const edgeScore = Math.max(leftDiff, topDiff, rightDiff, bottomDiff);
        const tolerance = pointerInside
          ? SNAP_EDGE_TOLERANCE * SNAP_POINTER_TOLERANCE_MULTIPLIER
          : SNAP_EDGE_TOLERANCE;
        if (edgeScore > tolerance) {
          continue;
        }
        if (edgeScore < bestScore) {
          bestScore = edgeScore;
          snapped = target;
        }
      }
      if (snapped) {
        return {
          x: snapped.x,
          y: snapped.y,
          width: snapped.width,
          height: snapped.height
        };
      }
      return rect;
    },
    [localSnapTargets]
  );

  const handleOverlayPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isEditing || phase === "capturing" || phase === "finalizing") {
        return;
      }
      const point = toLocalPoint(event, overlayRef.current);
      let hoverSnapPayload: {
        rect: Rect;
        pointerId: number;
        startPoint: Point;
        hasMoved: boolean;
      } | null = null;
      const canHoverSnapCommit =
        hoverRect &&
        phase === "idle" &&
        !selection &&
        !draftSelection &&
        isPointWithinRect(point, hoverRect);
      if (canHoverSnapCommit && hoverRect) {
        const { id: _ignored, name: _ignoredName, ...rest } = hoverRect;
        const rectWithoutMeta: Rect = rest;
        hoverSnapPayload = {
          rect: rectWithoutMeta,
          pointerId: event.pointerId,
          startPoint: point,
          hasMoved: false
        };
      }

      if (hoverSnapPayload) {
        hoverSnapCandidateRef.current = hoverSnapPayload;
        setHoverRect(null);
      } else {
        hoverSnapCandidateRef.current = null;
      }
      if (selection && isPointWithinRect(point, selection)) {
        return;
      }
      setPhase("drawing");
      setError(null);
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
    [draftSelection, hoverRect, isEditing, phase, selection, updateSelection]
  );

  const handleOverlayPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (phase === "editing" || phase === "capturing" || phase === "finalizing") {
        return;
      }

      const point = toLocalPoint(event, overlayRef.current);

      if (phase === "drawing" && dragStart && activePointerIdRef.current === event.pointerId) {
        const draft = computeRect(dragStart, point);
        setDraftSelection(applyWindowSnap(draft, point));
        const candidate = hoverSnapCandidateRef.current;
        if (
          candidate &&
          candidate.pointerId === event.pointerId &&
          !candidate.hasMoved &&
          (Math.abs(point.x - candidate.startPoint.x) > HOVER_SNAP_CLICK_TOLERANCE ||
            Math.abs(point.y - candidate.startPoint.y) > HOVER_SNAP_CLICK_TOLERANCE)
        ) {
          hoverSnapCandidateRef.current = {
            ...candidate,
            hasMoved: true
          };
        }
        return;
      }

      if (interaction && interaction.pointerId === event.pointerId && selection) {
        const bounds = getOverlayBounds(overlayRef.current);
        if (!bounds) {
          return;
        }
        if (interaction.mode === "move") {
          let next = moveRect(interaction.initial, point, interaction.offset, bounds);
          next = applyWindowSnap(next, point);
          updateSelection(next);
        } else if (interaction.mode === "resize") {
          let next = resizeRect(interaction.initial, point, interaction.handle, bounds);
          next = applyWindowSnap(next, point);
          updateSelection(next);
        }
        return;
      }

      if (
        phase === "idle" &&
        !dragStart &&
        !selection &&
        !draftSelection &&
        !interaction
      ) {
        const hovered = localSnapTargets.find((target) => isPointWithinRect(point, target)) ?? null;
        setHoverRect((current) => {
          if (!hovered && !current) {
            return current;
          }
          if (hovered && current && hovered.id === current.id) {
            return current;
          }
          return hovered;
        });
      } else if (hoverRect) {
        setHoverRect(null);
      }
    },
    [
      applyWindowSnap,
      draftSelection,
      dragStart,
      hoverRect,
      interaction,
      localSnapTargets,
      phase,
      selection,
      updateSelection
    ]
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
    | { kind: "finalize"; runOcr: boolean };

  const beginCapture = useCallback(
    async (rect: Rect, intent: CaptureIntent) => {
      if (!metadata || phase === "capturing" || phase === "finalizing") {
        return;
      }
      resetOcrResult();

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
          if (intent.runOcr) {
            resetOcrResult();
          }
          setFinalizingMode(intent.runOcr ? "ocr" : "save");
          setPhase("finalizing");
          const finalized = await invoke<CaptureSuccessPayload>("finalize_region_capture", {
            request: {
              path: payload.path,
              base64: payload.base64,
              width: payload.width,
              height: payload.height,
              logical_width: payload.logical_width,
              logical_height: payload.logical_height,
              run_ocr: intent.runOcr
            }
          });
          if (intent.runOcr) {
            setOcrResultText(finalized.ocr_text ?? "");
            setOcrCopyLabel("复制全部");
            setPhase("ocr-result");
          } else {
            window.close();
          }
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
        resetOcrResult();
        setFinalizingMode("save");
      }
    },
    [metadata, phase, resetOcrResult]
  );

  const handleOverlayPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
        overlayRef.current.releasePointerCapture(event.pointerId);
      }

      if (phase === "drawing" && dragStart && draftSelection && activePointerIdRef.current === event.pointerId) {
        activePointerIdRef.current = null;
        const candidate = hoverSnapCandidateRef.current;
        if (
          candidate &&
          candidate.pointerId === event.pointerId &&
          !candidate.hasMoved
        ) {
          hoverSnapCandidateRef.current = null;
          setDraftSelection(null);
          setDragStart(null);
          setError(null);
          updateSelection(candidate.rect);
          setPhase("selected");
          return;
        }
        hoverSnapCandidateRef.current = null;
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
      if (hoverSnapCandidateRef.current?.pointerId === event.pointerId) {
        hoverSnapCandidateRef.current = null;
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

  const handleQuickFinalize = useCallback(
    (options?: CaptureExportOptions) => {
      const shouldRunOcr = Boolean(options?.runOcr);
      if (phase === "selected") {
        const current = selectionRef.current;
        if (!current) {
          setError("请先框选有效区域。");
          return;
        }
        void beginCapture(current, { kind: "finalize", runOcr: shouldRunOcr });
      } else if (phase === "editing") {
        void editorBridge?.confirm({ runOcr: shouldRunOcr });
      }
    },
    [beginCapture, editorBridge, phase]
  );

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

  const handleToolbarOcr = useCallback(() => {
    handleQuickFinalize({ runOcr: true });
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
    async (dataUrl: string, options?: CaptureExportOptions) => {
      if (!captureResult || phase !== "editing") {
        return;
      }
      resetOcrResult();
      const shouldRunOcr = Boolean(options?.runOcr);
      setFinalizingMode(shouldRunOcr ? "ocr" : "save");
      setPhase("finalizing");
      try {
        const finalized = await invoke<CaptureSuccessPayload>("finalize_region_capture", {
          request: {
            path: captureResult.path,
            base64: dataUrl,
            width: captureResult.width,
            height: captureResult.height,
            logical_width: captureResult.logical_width,
            logical_height: captureResult.logical_height,
            run_ocr: shouldRunOcr
          }
        });
        if (shouldRunOcr) {
          setOcrResultText(finalized.ocr_text ?? "");
          setOcrCopyLabel("复制全部");
          setPhase("ocr-result");
        } else {
          window.close();
        }
      } catch (issue) {
        const message =
          issue instanceof Error
            ? issue.message
            : typeof issue === "string"
              ? issue
              : "保存截图失败，请重试。";
        setError(message);
        setPhase("editing");
        setFinalizingMode("save");
        resetOcrResult();
      }
    },
    [captureResult, phase, resetOcrResult]
  );

  const handleCopyOcrResult = useCallback(async () => {
    if (!ocrResultText || !ocrResultText.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(ocrResultText);
      setOcrCopyLabel("已复制");
    } catch {
      setOcrCopyLabel("复制失败");
    }
    if (ocrCopyTimeoutRef.current) {
      window.clearTimeout(ocrCopyTimeoutRef.current);
    }
    ocrCopyTimeoutRef.current = window.setTimeout(() => {
      setOcrCopyLabel("复制全部");
      ocrCopyTimeoutRef.current = null;
    }, 2000);
  }, [ocrResultText]);

  const handleCopyLine = useCallback((line: string) => {
    if (!line.trim()) {
      return;
    }
    void navigator.clipboard.writeText(line).catch(() => undefined);
    setCopiedLine(line);
    if (lineCopyTimeoutRef.current) {
      window.clearTimeout(lineCopyTimeoutRef.current);
    }
    lineCopyTimeoutRef.current = window.setTimeout(() => {
      setCopiedLine(null);
      lineCopyTimeoutRef.current = null;
    }, 1500);
  }, []);

  const handleDismissOcrPanel = useCallback(() => {
    resetOcrResult();
    setOcrCopyLabel("复制全部");
    setCopiedLine(null);
    setFinalizingMode("save");
    setCaptureResult(null);
    setCapturedRect(null);
    setInteraction(null);
    setError(null);
    const hasSelection = Boolean(selectionRef.current);
    setPhase(hasSelection ? "selected" : "idle");
  }, [resetOcrResult]);

  useEffect(() => {
    return () => {
      if (lineCopyTimeoutRef.current) {
        window.clearTimeout(lineCopyTimeoutRef.current);
      }
    };
  }, []);

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

  const activeRect = getActiveRect(selection ?? hoverRect ?? null, draftSelection);

  const overlayMask = useMemo(() => {
    const baseClass = "pointer-events-none absolute z-10 bg-[rgba(0,0,0,0.5)]";
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

  const hoverLabel =
    hoverRect &&
    !selection &&
    !draftSelection &&
    phase === "idle" &&
    overlaySize ? (
      <div
        className="pointer-events-none absolute z-30 max-w-[60vw] truncate rounded-full bg-[rgba(18,27,43,0.9)] px-3 py-1 text-xs text-white shadow-md"
        style={{
          left: `${clampNumber(hoverRect.x + 12, 8, overlaySize.width - 8)}px`,
          top: `${clampNumber(hoverRect.y - 28, 8, overlaySize.height - 24)}px`
        }}
      >
        {hoverRect.name}
      </div>
    ) : null;

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
  const showOcrPanel =
    (phase === "finalizing" && finalizingMode === "ocr") || phase === "ocr-result";
  const isOcrLoading = phase === "finalizing" && finalizingMode === "ocr";
  const isNightMode = isDarkTheme;
  const normalizedOcrSearch = ocrSearchQuery.trim();
  const normalizedOcrSearchLower = normalizedOcrSearch.toLowerCase();
  const ocrPanelClasses = useMemo(
    () => ({
      panel: clsx(
        "w-[min(360px,calc(100vw-48px))] rounded-[22px] border backdrop-blur-2xl transition-[background-color,border-color,box-shadow] duration-300",
        isDarkTheme
          ? "border-white/12 bg-[rgba(8,10,24,0.92)] text-white shadow-[0_26px_70px_rgba(0,0,0,0.6)]"
          : "border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.98)] text-[rgba(15,23,42,0.95)] shadow-[0_22px_48px_rgba(15,23,42,0.18)]"
      ),
      heading: isDarkTheme ? "text-white" : "text-[rgba(17,27,45,0.92)]",
      subheading: isDarkTheme ? "text-white/70" : "text-[rgba(17,27,45,0.62)]",
      pill: clsx(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]",
        isDarkTheme
          ? "border-white/12 text-white/65"
          : "border-[rgba(17,27,45,0.12)] text-[rgba(17,27,45,0.65)]"
      ),
      searchFloating: clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition focus-within:ring-2 focus-within:ring-offset-0",
        isDarkTheme
          ? "border-white/12 bg-white/5 focus-within:ring-white/20"
          : "border-[rgba(17,27,45,0.14)] bg-white/90 shadow-[0_6px_16px_rgba(15,23,42,0.08)] focus-within:ring-[rgba(59,130,246,0.35)]"
      ),
      searchInput: clsx(
        "bg-transparent text-[12px] focus:outline-none placeholder:text-[12px]",
        isDarkTheme ? "text-white placeholder:text-white/55" : "text-[rgba(17,27,45,0.85)] placeholder:text-[rgba(17,27,45,0.45)]"
      ),
      searchClear: clsx(
        "rounded-full px-1.5 text-sm leading-none transition hover:scale-105",
        isDarkTheme ? "text-white/60 hover:text-white/90" : "text-[rgba(17,27,45,0.45)] hover:text-[rgba(17,27,45,0.75)]"
      ),
      actionCopy: clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60",
        isDarkTheme
          ? "border-white/15 bg-[rgba(59,130,246,0.18)] text-white hover:border-white/35 hover:bg-[rgba(59,130,246,0.28)] focus-visible:ring-white/30"
          : "border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.12)] text-[rgba(30,64,175,0.95)] hover:bg-[rgba(59,130,246,0.2)] focus-visible:ring-[rgba(59,130,246,0.35)]"
      ),
      surface: clsx(
        "px-1 py-1 text-sm leading-6",
        isDarkTheme ? "text-white/90" : "text-[rgba(17,27,45,0.85)]"
      ),
      listItem: clsx(
        "flex items-start justify-between gap-2 py-1 text-[12px]",
        isDarkTheme ? "text-white/90" : "text-[rgba(15,23,42,0.8)]"
      ),
      lineCopy: clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
        isDarkTheme
          ? "border-white/18 text-white/70 hover:border-white/35 hover:bg-white/10 focus-visible:ring-white/25"
          : "border-[rgba(37,99,235,0.25)] text-[rgba(37,99,235,0.85)] hover:border-[rgba(37,99,235,0.45)] hover:bg-[rgba(59,130,246,0.12)] focus-visible:ring-[rgba(59,130,246,0.35)]"
      ),
      lineCopyActive: isDarkTheme
        ? "border-white/35 bg-white/10 text-white"
        : "border-[rgba(37,99,235,0.5)] bg-[rgba(59,130,246,0.16)] text-[rgba(17,27,45,0.8)]",
      noResult: isDarkTheme ? "text-white/60" : "text-[rgba(17,27,45,0.6)]",
      closeButton: clsx(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
        isDarkTheme
          ? "border-white/20 text-white/80 hover:bg-white/10 focus-visible:ring-white/20"
         : "border-[rgba(17,27,45,0.14)] text-[rgba(17,27,45,0.7)] hover:bg-[rgba(17,27,45,0.05)] focus-visible:ring-[rgba(59,130,246,0.25)]"
      )
    }),
    [isDarkTheme]
  );
  const ocrPanelPlacement = useMemo(() => {
    if (!showOcrPanel || !overlaySize) {
      return null;
    }

    const anchorRect = capturedRect ?? activeRect;
    const margin = 18;
    const estimatedHeight = isOcrLoading ? 180 : 260;
    const availableWidth = Math.max(overlaySize.width - margin * 2, 180);
    const widthMin = Math.min(260, availableWidth);
    const widthMax = Math.min(380, availableWidth);
    const desiredWidth = overlaySize.width * 0.28;
    const width = clampNumber(desiredWidth, widthMin, widthMax);

    if (!anchorRect) {
      return {
        left: overlaySize.width / 2,
        top: overlaySize.height - margin,
        translateX: "-50%",
        translateY: "-100%",
        width
      };
    }

    const centerY = anchorRect.y + anchorRect.height / 2;
    const minCenterY = estimatedHeight / 2 + margin;
    const maxCenterY = overlaySize.height - estimatedHeight / 2 - margin;
    const clampedCenterY = clampNumber(centerY, minCenterY, maxCenterY);
    let left = anchorRect.x + anchorRect.width + margin;
    let translateX: string = "0";

    if (left + width > overlaySize.width - margin) {
      left = anchorRect.x - margin;
      translateX = "-100%";

      if (left - width < margin) {
        const anchorCenterX = anchorRect.x + anchorRect.width / 2;
        const minCenterX = width / 2 + margin;
        const maxCenterX = overlaySize.width - width / 2 - margin;
        left = clampNumber(anchorCenterX, minCenterX, maxCenterX);
        translateX = "-50%";
      }
    }

    return {
      left,
      top: clampedCenterY,
      translateX,
      translateY: "-50%",
      width
    };
  }, [activeRect, capturedRect, isOcrLoading, overlaySize, showOcrPanel]);
  const ocrLines = useMemo(() => {
    if (!ocrResultText) {
      return [];
    }
    return ocrResultText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+$/, ""))
      .filter((line) => line.length > 0);
  }, [ocrResultText]);
  const filteredOcrLines = useMemo(() => {
    if (!normalizedOcrSearchLower) {
      return ocrLines;
    }
    return ocrLines.filter((line) => line.toLowerCase().includes(normalizedOcrSearchLower));
  }, [normalizedOcrSearchLower, ocrLines]);
  const renderHighlightedLine = useCallback(
    (line: string, lineIndex: number): ReactNode => {
      if (!normalizedOcrSearch) {
        return line;
      }
      const regex = new RegExp(`(${escapeRegExp(normalizedOcrSearch)})`, "gi");
      const segments = line.split(regex);
      return segments.map((segment, index) =>
        index % 2 === 1 ? (
          <span
            key={`match-${lineIndex}-${index}`}
            className={clsx(
              "rounded px-1 font-medium",
              isDarkTheme
                ? "bg-white/30 text-white"
                : "bg-[rgba(79,70,229,0.15)] text-[rgba(55,48,163,0.95)]"
            )}
          >
            {segment}
          </span>
        ) : (
          <span key={`text-${lineIndex}-${index}`}>{segment}</span>
        )
      );
    },
    [isDarkTheme, normalizedOcrSearch]
  );
  const hasFilteredResults = filteredOcrLines.length > 0;
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
  const hasOcrResultText = Boolean(ocrResultText && ocrResultText.trim().length > 0);
  const ocrCardClassName = clsx(
    "relative overflow-hidden",
    ocrPanelClasses.panel,
    !isNightMode && "group",
    isNightMode && "ocr-night-card",
    isOcrLoading && "ocr-loading-scan"
  );

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
      {hoverLabel}

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
            onOcr={handleToolbarOcr}
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

      {phase === "finalizing" && finalizingMode === "save" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
          正在保存编辑结果…
        </div>
      )}

      <AnimatePresence initial={false}>
        {showOcrPanel && (
          <motion.div
            className="pointer-events-auto absolute z-40"
            style={
              ocrPanelPlacement
                ? {
                    left: `${ocrPanelPlacement.left}px`,
                    top: `${ocrPanelPlacement.top}px`,
                    width: `${ocrPanelPlacement.width}px`,
                    transform: `translate(${ocrPanelPlacement.translateX}, ${ocrPanelPlacement.translateY})`
                  }
                : overlaySize
                  ? {
                      left: `${overlaySize.width / 2}px`,
                      top: `${overlaySize.height - 24}px`,
                      transform: "translate(-50%, -100%)",
                      width: `${Math.min(Math.max(overlaySize.width - 36, 220), 360)}px`
                    }
                  : undefined
            }
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <motion.div
              className={ocrCardClassName}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              {isNightMode ? (
                <div aria-hidden className="ocr-night-glow" />
              ) : (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition duration-300 group-hover:opacity-70"
                  style={{
                    background: "radial-gradient(circle at 80% 0%, rgba(79,70,229,0.18), transparent 55%)"
                  }}
                />
              )}
              <div className="relative z-[1] flex flex-col gap-4 px-5 py-4">
                {isOcrLoading ? (
                  <div className="flex flex-col gap-4">
                    <div
                      className={clsx(
                        "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                        isNightMode
                          ? "ocr-night-status"
                          : isDarkTheme
                            ? "border-white/12 bg-white/5"
                            : "border-[rgba(15,23,42,0.08)] bg-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            "grid h-12 w-12 place-items-center rounded-2xl border",
                            isNightMode
                              ? "ocr-night-loader"
                              : isDarkTheme
                                ? "border-white/15 bg-white/5"
                                : "border-[rgba(37,99,235,0.18)] bg-white"
                          )}
                          aria-hidden="true"
                        >
                          <span
                            className={clsx(
                              "inline-block",
                              isNightMode
                                ? "ocr-night-spinner"
                                : "h-6 w-6 rounded-full border-2 border-transparent border-t-[rgba(102,240,255,0.9)] border-l-[rgba(92,124,250,0.65)] animate-spin"
                            )}
                          />
                        </div>
                        <div
                          className={clsx(
                            "flex flex-col text-sm",
                            isNightMode ? "text-white/80" : undefined
                          )}
                        >
                          <p className={clsx("font-semibold tracking-wide", ocrPanelClasses.heading)}>正在解析文本</p>
                          <p className={clsx("text-xs", ocrPanelClasses.subheading)}>文字检测 · 语言建模 · 语义优化</p>
                        </div>
                      </div>
                      <button type="button" className={ocrPanelClasses.closeButton} onClick={handleDismissOcrPanel}>
                        关闭
                      </button>
                    </div>
                    <div
                      className={clsx(
                        "rounded-2xl border px-4 py-4",
                        isNightMode
                          ? "ocr-night-result"
                          : isDarkTheme
                            ? "border-white/8 bg-white/[0.04]"
                            : "border-[rgba(15,23,42,0.06)] bg-white"
                      )}
                    >
                      {isNightMode && <div aria-hidden className="ocr-night-result-glow" />}
                      <div className="relative z-[1] space-y-3">
                        {[0, 1, 2, 3].map((index) => (
                          <div
                            key={`ocr-loading-stripe-${index}`}
                            className="ocr-loading-stripe"
                            style={{ animationDelay: `${index * 140}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={clsx("text-base font-semibold", ocrPanelClasses.heading)}>OCR 识别结果</p>
                      <label className={clsx("flex-1 min-w-[160px]", ocrPanelClasses.searchFloating)}>
                        <Search
                          size={14}
                          strokeWidth={1.8}
                          className={clsx(
                            "shrink-0",
                            isDarkTheme ? "text-white/65" : "text-[rgba(17,27,45,0.55)]"
                          )}
                        />
                        <input
                          ref={ocrSearchInputRef}
                          type="search"
                          inputMode="search"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          className={ocrPanelClasses.searchInput}
                          aria-label="搜索识别结果"
                          placeholder="快速搜索"
                          value={ocrSearchQuery}
                          onChange={(event) => setOcrSearchQuery(event.target.value)}
                        />
                        {ocrSearchQuery && (
                          <button
                            type="button"
                            className={ocrPanelClasses.searchClear}
                            onClick={() => setOcrSearchQuery("")}
                            aria-label="清空搜索"
                          >
                            ×
                          </button>
                        )}
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={ocrPanelClasses.actionCopy}
                          onClick={handleCopyOcrResult}
                          disabled={!hasOcrResultText}
                        >
                          {ocrCopyLabel === "已复制" ? (
                            <Check size={14} className="opacity-80" />
                          ) : (
                            <Copy size={14} className="opacity-80" />
                          )}
                          {ocrCopyLabel}
                        </button>
                        <button type="button" className={ocrPanelClasses.closeButton} onClick={handleDismissOcrPanel}>
                          关闭
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {normalizedOcrSearch && hasOcrResultText && hasFilteredResults && (
                        <span className={ocrPanelClasses.pill}>筛选中</span>
                      )}
                      {!hasFilteredResults && hasOcrResultText && normalizedOcrSearch && (
                        <span
                          className={clsx(
                            ocrPanelClasses.pill,
                            isDarkTheme
                              ? "border-red-200/50 text-red-200"
                              : "border-[rgba(248,113,113,0.5)] text-[rgba(185,28,28,0.85)]"
                          )}
                        >
                          未匹配
                        </span>
                      )}
                    </div>
                    <div
                      className={clsx(
                        "ocr-scroll-area relative max-h-[220px] overflow-y-auto text-xs leading-6",
                        ocrPanelClasses.surface
                      )}
                    >
                      <div>
                        {hasOcrResultText ? (
                          hasFilteredResults ? (
                            <div className="space-y-2">
                              {filteredOcrLines.map((line, lineIndex) => (
                                <div key={`ocr-line-${lineIndex}-${line}`} className={ocrPanelClasses.listItem}>
                                  <div className="min-w-0 flex-1 break-words">
                                    {renderHighlightedLine(line, lineIndex)}
                                  </div>
                                  <button
                                    type="button"
                                    className={clsx(
                                      ocrPanelClasses.lineCopy,
                                      copiedLine === line && ocrPanelClasses.lineCopyActive
                                    )}
                                    onClick={() => handleCopyLine(line)}
                                  >
                                    {copiedLine === line ? (
                                      <>
                                        <Check size={12} />
                                        已复制
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={12} />
                                        复制
                                      </>
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className={clsx("flex h-32 items-center justify-center text-xs", ocrPanelClasses.noResult)}>
                              未找到匹配结果
                            </div>
                          )
                        ) : (
                          <div className={clsx("flex h-32 items-center justify-center text-xs", ocrPanelClasses.noResult)}>
                            未识别到文字
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function rectIntersectionArea(a: Rect, b: Rect) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return width * height;
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
