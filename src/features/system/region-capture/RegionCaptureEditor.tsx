import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject
} from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import type { CaptureSuccessPayload } from "./regionCaptureTypes";

type EditorTool = "line" | "rectangle" | "circle" | "pen" | "mosaic" | "text";

type Point = {
  x: number;
  y: number;
};

type LineOperation = {
  kind: "line";
  color: string;
  width: number;
  start: Point;
  end: Point;
};

type RectangleOperation = {
  kind: "rectangle";
  color: string;
  width: number;
  start: Point;
  end: Point;
};

type CircleOperation = {
  kind: "circle";
  color: string;
  width: number;
  start: Point;
  end: Point;
};

type PenOperation = {
  kind: "pen";
  color: string;
  width: number;
  points: Point[];
};

type MosaicOperation = {
  kind: "mosaic";
  size: number;
  points: Point[];
};

type TextOperation = {
  kind: "text";
  color: string;
  fontSize: number;
  position: Point;
  text: string;
  align: "left" | "center";
};

type DrawOperation =
  | LineOperation
  | RectangleOperation
  | CircleOperation
  | PenOperation
  | MosaicOperation
  | TextOperation;

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RegionCaptureEditorProps = {
  payload: CaptureSuccessPayload;
  onConfirm: (dataUrl: string) => Promise<void> | void;
  onCancel: () => void;
  onRetake: () => void;
  mode?: "full" | "inline";
  overlayRef?: RefObject<HTMLDivElement | null>;
  selectionRect?: SelectionRect | null;
  overlaySize?: { width: number; height: number } | null;
  dockOffset?: number;
};

const TOOL_LABELS: Record<EditorTool, string> = {
  line: "画线",
  rectangle: "矩形",
  circle: "圈选",
  pen: "画笔",
  mosaic: "马赛克",
  text: "文字"
};

const TOOL_ORDER: EditorTool[] = [
  "line",
  "rectangle",
  "circle",
  "pen",
  "mosaic",
  "text"
];

const COLOR_CHOICES = ["#ff4d4f", "#ffc53d", "#4096ff", "#36cfc9", "#ffffff"];

const STROKE_CHOICES = [
  { label: "细", value: 2 },
  { label: "中", value: 4 },
  { label: "粗", value: 6 }
];

const DEFAULT_MOSAIC_SIZE = 42;
const TOOLBAR_MARGIN = 12;
const TEXT_SIZE_CHOICES = [
  { label: "小", value: 20 },
  { label: "中", value: 28 },
  { label: "大", value: 36 }
];

export function RegionCaptureEditor({
  payload,
  onConfirm,
  onCancel,
  onRetake,
  mode = "full",
  overlayRef,
  selectionRect,
  overlaySize,
  dockOffset = 0
}: RegionCaptureEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const helperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerActiveRef = useRef(false);
  const isInline = mode === "inline";
  const [operations, setOperations] = useState<DrawOperation[]>([]);
  const [draftOperation, setDraftOperation] = useState<DrawOperation | null>(null);
  const draftRef = useRef<DrawOperation | null>(null);
  const [tool, setTool] = useState<EditorTool>("rectangle");
  const [strokeColor, setStrokeColor] = useState(COLOR_CHOICES[0]);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [mosaicSize, setMosaicSize] = useState<number>(DEFAULT_MOSAIC_SIZE);
  const [textSize, setTextSize] = useState<number>(28);
  const [isExporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [bottomInset, setBottomInset] = useState(0);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState<{ width: number; height: number } | null>(null);
  const toolbarMaxWidth = useMemo(() => {
    if (!overlaySize) {
      return undefined;
    }
    const available = Math.max(overlaySize.width - TOOLBAR_MARGIN * 2, 320);
    return Math.max(Math.min(available, 1280), 360);
  }, [overlaySize]);
  const [textEntry, setTextEntry] = useState<{
    canvasPoint: Point;
    clientX: number;
    clientY: number;
    value: string;
  } | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (textEntry) {
      requestAnimationFrame(() => {
        textInputRef.current?.focus();
      });
    }
  }, [textEntry]);

  useEffect(() => {
    if (tool !== "text") {
      setTextEntry(null);
    }
  }, [tool]);

  const containerStyle = useMemo(() => {
    if (isInline) {
      return undefined;
    }
    const inset = Math.max(0, Math.round(bottomInset));
    return {
      paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${inset}px + 32px)`
    };
  }, [bottomInset, isInline]);

  useEffect(() => {
    if (isInline) {
      setBottomInset(0);
      return;
    }
    const computeDockInset = () => {
      const { screen, visualViewport } = window;
      const rawHeight = screen?.height ?? window.innerHeight;
      const availHeight = screen?.availHeight ?? window.innerHeight;
      const availTop = (screen as { availTop?: number }).availTop ?? 0;
      const dockHeight = Math.max(0, rawHeight - availTop - availHeight);
      const scale = window.devicePixelRatio || 1;
      const viewportInset =
        visualViewport && typeof visualViewport.height === "number"
          ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
          : 0;
      const normalized = Math.max(dockHeight / scale, viewportInset);
      setBottomInset(normalized);
    };

    computeDockInset();
    window.addEventListener("resize", computeDockInset);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", computeDockInset);
    return () => {
      window.removeEventListener("resize", computeDockInset);
      viewport?.removeEventListener("resize", computeDockInset);
    };
  }, [isInline]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      baseImageRef.current = image;
      renderCanvas();
    };
    image.src = `data:image/png;base64,${payload.base64}`;
    return () => {
      baseImageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.base64]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = payload.width;
      canvas.height = payload.height;
    }
    if (isInline) {
      setScale(1);
      return;
    }
    const updateScale = () => {
      const marginX = 160;
      const marginY = 200;
      const maxWidth = window.innerWidth - marginX;
      const maxHeight = window.innerHeight - marginY;
      const availableWidth = Math.max(
        160,
        Math.min(window.innerWidth - 40, Math.max(320, maxWidth))
      );
      const availableHeight = Math.max(
        160,
        Math.min(window.innerHeight - 40, Math.max(240, maxHeight))
      );
      const nextScale = Math.min(
        1,
        availableWidth / payload.width,
        availableHeight / payload.height
      );
      setScale(nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [payload.width, payload.height, isInline]);

  useLayoutEffect(() => {
    if (!isInline) {
      return;
    }
    const element = toolbarRef.current;
    if (!element) {
      return;
    }
    const updateSize = () => {
      const node = toolbarRef.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      setToolbarSize((previous) => {
        if (
          previous &&
          Math.abs(previous.width - rect.width) < 0.5 &&
          Math.abs(previous.height - rect.height) < 0.5
        ) {
          return previous;
        }
        return {
          width: rect.width,
          height: rect.height
        };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isInline]);

  const computeToolbarPlacement = useCallback(() => {
    if (!selectionRect || !overlaySize || !toolbarSize) {
      return null;
    }
    const { width: overlayWidth, height: overlayHeight } = overlaySize;
    const { width: toolbarWidth, height: toolbarHeight } = toolbarSize;
    const halfWidth = selectionRect.width / 2;
    const centerX = selectionRect.x + halfWidth;

    const targetLeft = centerX - toolbarWidth / 2;
    const maxLeft = Math.max(TOOLBAR_MARGIN, overlayWidth - toolbarWidth - TOOLBAR_MARGIN);
    const clampedLeft = clampNumber(targetLeft, TOOLBAR_MARGIN, maxLeft);

    const bottomLimit = overlayHeight - dockOffset - TOOLBAR_MARGIN;
    const outsideTop = selectionRect.y + selectionRect.height + TOOLBAR_MARGIN;
    const hasOutsideSpace = outsideTop + toolbarHeight <= bottomLimit;

    if (hasOutsideSpace) {
      return {
        placement: "outside" as const,
        position: {
          left: clampedLeft,
          top: outsideTop
        }
      };
    }

    const insideTopBase = selectionRect.y + selectionRect.height - toolbarHeight - TOOLBAR_MARGIN;
    const insideTopWithinSelection = Math.max(selectionRect.y, insideTopBase);
    const insideTop = clampNumber(insideTopWithinSelection, TOOLBAR_MARGIN, bottomLimit - toolbarHeight);

    return {
      placement: "inside" as const,
      position: {
        left: clampedLeft,
        top: insideTop
      }
    };
  }, [selectionRect, overlaySize, toolbarSize, dockOffset]);

  const toolbarPlacement = useMemo(() => {
    if (!isInline) {
      return null;
    }
    if (toolbarSize) {
      return computeToolbarPlacement();
    }

    if (!selectionRect || !overlaySize) {
      return null;
    }

    const estimatedSize = {
      width: Math.max(
        240,
        Math.min(overlaySize.width - TOOLBAR_MARGIN * 2, toolbarMaxWidth ?? 960)
      ),
      height: 64
    };
    const overlayWidth = overlaySize.width;
    const overlayHeight = overlaySize.height;
    const bottomLimit = overlayHeight - dockOffset - TOOLBAR_MARGIN;

    const centerX = selectionRect.x + selectionRect.width / 2;
    const maxLeft = Math.max(
      TOOLBAR_MARGIN,
      overlaySize.width - estimatedSize.width - TOOLBAR_MARGIN
    );
    const provisionalLeft = clampNumber(
      centerX - estimatedSize.width / 2,
      TOOLBAR_MARGIN,
      maxLeft
    );

    const outsideTop = selectionRect.y + selectionRect.height + TOOLBAR_MARGIN;
    const hasOutsideSpace = outsideTop + estimatedSize.height <= bottomLimit;

    const fallbackTop = hasOutsideSpace
      ? outsideTop
      : clampNumber(
          Math.max(
            selectionRect.y,
            selectionRect.y + selectionRect.height - estimatedSize.height - TOOLBAR_MARGIN
          ),
          TOOLBAR_MARGIN,
          bottomLimit - estimatedSize.height
        );

    return {
      placement: hasOutsideSpace ? "outside" : "inside",
      position: {
        left: provisionalLeft,
        top: fallbackTop
      }
    };
  }, [isInline, selectionRect, overlaySize, toolbarSize, dockOffset, computeToolbarPlacement, toolbarMaxWidth]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = baseImageRef.current;
    if (!canvas || !image) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    operations.forEach((operation) => {
      drawOperation(ctx, operation, image, helperCanvasRef);
    });
    if (draftOperation) {
      drawOperation(ctx, draftOperation, image, helperCanvasRef);
    }
  }, [draftOperation, operations]);

  useEffect(() => {
    renderCanvas();
  }, [operations, draftOperation, renderCanvas]);

  const startPointRef = useRef<Point | null>(null);

  const toCanvasPoint = useCallback((event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    return {
      x: clampNumber(x, 0, canvas.width),
      y: clampNumber(y, 0, canvas.height)
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || isExporting) {
        return;
      }
      if (tool === "text") {
        event.preventDefault();
        const point = toCanvasPoint(event);
        setTextEntry({
          canvasPoint: point,
          clientX: event.clientX,
          clientY: event.clientY,
          value: ""
        });
        pointerActiveRef.current = false;
        return;
      }
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const start = toCanvasPoint(event);
      startPointRef.current = start;
      pointerActiveRef.current = true;

      let nextDraft: DrawOperation | null = null;
      switch (tool) {
        case "line":
          nextDraft = {
            kind: "line",
            color: strokeColor,
            width: strokeWidth,
            start,
            end: start
          };
          break;
        case "rectangle":
          nextDraft = {
            kind: "rectangle",
            color: strokeColor,
            width: strokeWidth,
            start,
            end: start
          };
          break;
        case "circle":
          nextDraft = {
            kind: "circle",
            color: strokeColor,
            width: strokeWidth,
            start,
            end: start
          };
          break;
        case "pen":
          nextDraft = {
            kind: "pen",
            color: strokeColor,
            width: strokeWidth,
            points: [start]
          };
          break;
        case "mosaic":
          nextDraft = {
            kind: "mosaic",
            size: mosaicSize,
            points: [start]
          };
          break;
        default:
          break;
      }
      setDraftOperation(nextDraft);
      draftRef.current = nextDraft;
    },
    [mosaicSize, strokeColor, strokeWidth, toCanvasPoint, tool, isExporting]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!pointerActiveRef.current || !draftRef.current) {
        return;
      }
      event.preventDefault();
      const position = toCanvasPoint(event);
      setDraftOperation((previous) => {
        if (!previous) {
          return previous;
        }
        switch (previous.kind) {
          case "line":
          case "rectangle":
          case "circle":
            draftRef.current = {
              ...previous,
              end: position
            };
            return draftRef.current;
          case "pen": {
            const points = [
              ...previous.points,
              position
            ];
            draftRef.current = {
              ...previous,
              points
            };
            return draftRef.current;
          }
          case "mosaic": {
            const points = maybeAppendPoint(previous.points, position, previous.size / 3);
            draftRef.current = {
              ...previous,
              points
            };
            return draftRef.current;
          }
          default:
            return previous;
        }
      });
    },
    [toCanvasPoint]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      pointerActiveRef.current = false;
      const currentDraft = draftRef.current;
      if (!currentDraft) {
        startPointRef.current = null;
        draftRef.current = null;
        return;
      }

      const finalized = normalizeDraftOperation(currentDraft);
      if (finalized) {
        setOperations((prev) => [...prev, finalized]);
      }
      setDraftOperation(null);
      draftRef.current = null;
      startPointRef.current = null;
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const down = (event: PointerEvent) => handlePointerDown(event);
    const move = (event: PointerEvent) => handlePointerMove(event);
    const up = (event: PointerEvent) => handlePointerUp(event);
    const cancel = (event: PointerEvent) => handlePointerUp(event);

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);

    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  useEffect(() => {
    draftRef.current = draftOperation;
  }, [draftOperation]);

  const confirmTextEntry = useCallback(() => {
    setTextEntry((current) => {
      if (!current) {
        return current;
      }
      const trimmed = current.value.trim();
      if (trimmed) {
        const operation: TextOperation = {
          kind: "text",
          color: strokeColor,
          fontSize: textSize,
          position: current.canvasPoint,
          text: trimmed,
          align: "left"
        };
        setOperations((prev) => [...prev, operation]);
      }
      return null;
    });
  }, [strokeColor, textSize]);

  const cancelTextEntry = useCallback(() => {
    setTextEntry(null);
  }, []);

  const handleTextInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setTextEntry((previous) => (previous ? { ...previous, value } : previous));
  }, []);

  const handleTextInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        confirmTextEntry();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelTextEntry();
      }
    },
    [cancelTextEntry, confirmTextEntry]
  );

  const handleUndo = useCallback(() => {
    setOperations((prev) => prev.slice(0, -1));
    setDraftOperation(null);
  }, []);

  const handleReset = useCallback(() => {
    setOperations([]);
    setDraftOperation(null);
    setTextEntry(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || isExporting) {
      return;
    }
    try {
      setExporting(true);
      setError(null);
      const dataUrl = canvas.toDataURL("image/png");
      await onConfirm(dataUrl);
    } catch (issue) {
      const message =
        issue instanceof Error ? issue.message : "导出截图失败，请重试。";
      setError(message);
    } finally {
      setExporting(false);
    }
  }, [isExporting, onConfirm]);

  const canvasStyle = useMemo(() => {
    if (isInline) {
      return {
        width: "100%",
        height: "100%"
      };
    }
    const displayWidth = Math.round(payload.width * scale);
    const displayHeight = Math.round(payload.height * scale);
    return {
      width: `${displayWidth}px`,
      height: `${displayHeight}px`
    };
  }, [payload.height, payload.width, scale, isInline]);

  let textInputOverlay: JSX.Element | null = null;
  if (textEntry) {
    let left = textEntry.clientX;
    let top = textEntry.clientY;
    if (typeof window !== "undefined") {
      left = clampNumber(left, 16, window.innerWidth - 280);
      top = clampNumber(top, 16, window.innerHeight - 140);
    }
    const trimmed = textEntry.value.trim();
    textInputOverlay = (
      <div className="fixed inset-0 z-[80] pointer-events-none">
        <div
          className="pointer-events-auto flex w-[280px] flex-col gap-2 rounded-xl bg-[rgba(18,27,43,0.9)] px-4 py-3 text-xs text-white shadow-[0_20px_44px_rgba(8,15,30,0.6)] backdrop-blur"
          style={{ position: "fixed", left: `${left}px`, top: `${top}px` }}
        >
          <input
            ref={textInputRef}
            value={textEntry.value}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            className="w-full rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-[rgba(18,27,43,0.9)] placeholder:text-[rgba(18,27,43,0.45)] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            placeholder="输入文字"
            maxLength={120}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg bg-[rgba(255,255,255,0.16)] px-3 py-1.5 text-white/85 transition hover:bg-[rgba(255,255,255,0.25)]"
              onClick={cancelTextEntry}
            >
              取消
            </button>
            <button
              type="button"
              className={clsx(
                "rounded-lg px-3 py-1.5 font-semibold transition",
                trimmed
                  ? "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                  : "bg-[rgba(255,255,255,0.35)] text-[rgba(18,27,43,0.6)]"
              )}
              onClick={confirmTextEntry}
              disabled={!trimmed}
            >
              完成
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>字号 {textSize}px</span>
            <span>Enter 完成 / Esc 取消</span>
          </div>
        </div>
      </div>
    );
  }

  if (isInline) {
    const overlayElement = overlayRef?.current ?? null;
    const placementInfo = toolbarPlacement;
    const toolbarVisible = Boolean(overlayElement && selectionRect && placementInfo);
    const fallbackPosition =
      selectionRect && overlaySize
        ? (() => {
            const estimatedWidth = Math.max(
              240,
              Math.min(overlaySize.width - TOOLBAR_MARGIN * 2, 720)
            );
            const maxLeft = Math.max(
              TOOLBAR_MARGIN,
              overlaySize.width - estimatedWidth - TOOLBAR_MARGIN
            );
            const centeredLeft =
              selectionRect.x + selectionRect.width / 2 - estimatedWidth / 2;
            return {
              left: clampNumber(centeredLeft, TOOLBAR_MARGIN, maxLeft),
              top: selectionRect.y + selectionRect.height + TOOLBAR_MARGIN
            };
          })()
        : { left: TOOLBAR_MARGIN, top: TOOLBAR_MARGIN };
    const toolbarPosition = placementInfo?.position ?? fallbackPosition;
    const effectivePlacement = placementInfo?.placement ?? "outside";

    const toolbarNode =
      toolbarVisible && overlayElement
        ? createPortal(
            <div
              ref={toolbarRef}
              className="absolute z-[60] select-none rounded-2xl bg-[rgba(13,23,42,0.82)] px-4 py-3 text-white shadow-[0_20px_44px_rgba(8,15,30,0.55)] backdrop-blur"
              data-placement={effectivePlacement}
              style={{
                left: `${toolbarPosition.left}px`,
                top: `${toolbarPosition.top}px`,
                opacity: toolbarVisible ? 1 : 0,
                transition: "top 0.2s ease, left 0.2s ease, opacity 0.2s ease",
                maxWidth: toolbarMaxWidth
                  ? `${toolbarMaxWidth}px`
                  : "min(94vw, 1280px)"
              }}
            >
              <div className="flex flex-nowrap items-center gap-3 text-xs text-white/90 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {TOOL_ORDER.map((current) => (
                    <button
                      key={current}
                      type="button"
                      className={clsx(
                        "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                        tool === current
                          ? "bg-[rgba(255,255,255,0.92)] text-[rgba(18,27,43,0.9)] shadow"
                          : "bg-[rgba(255,255,255,0.16)] text-white/80 hover:bg-[rgba(255,255,255,0.28)]"
                      )}
                      onClick={() => setTool(current)}
                    >
                      {TOOL_LABELS[current]}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {tool !== "mosaic" && (
                    <div className="flex items-center gap-2">
                      {COLOR_CHOICES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={clsx(
                            "h-6 w-6 rounded-full border-2 transition-all duration-150",
                            strokeColor === color
                              ? "border-white scale-110 shadow-lg"
                              : "border-transparent opacity-80 hover:opacity-100"
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => setStrokeColor(color)}
                          aria-label={`选择颜色 ${color}`}
                        />
                      ))}
                    </div>
                  )}

                  {tool === "mosaic" && (
                    <label className="flex items-center gap-2 text-xs text-white/80">
                      马赛克强度
                      <input
                        type="range"
                        min={18}
                        max={120}
                        step={6}
                        value={mosaicSize}
                        onChange={(event) => setMosaicSize(Number(event.target.value))}
                      />
                    </label>
                  )}

                  {tool !== "mosaic" && tool !== "text" && (
                    <div className="flex items-center gap-1">
                      {STROKE_CHOICES.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={clsx(
                            "rounded-lg px-2 py-1 text-xs transition-all",
                            strokeWidth === item.value
                              ? "bg-white text-[rgba(18,27,43,0.9)] font-semibold"
                              : "bg-[rgba(255,255,255,0.14)] text-white/80 hover:bg-[rgba(255,255,255,0.24)]"
                          )}
                          onClick={() => setStrokeWidth(item.value)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {tool === "text" && (
                    <div className="flex items-center gap-1">
                      {TEXT_SIZE_CHOICES.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          className={clsx(
                            "rounded-lg px-2 py-1 text-xs transition-all",
                            textSize === item.value
                              ? "bg-white text-[rgba(18,27,43,0.9)] font-semibold"
                              : "bg-[rgba(255,255,255,0.14)] text-white/80 hover:bg-[rgba(255,255,255,0.24)]"
                          )}
                          onClick={() => setTextSize(item.value)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ml-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
                    onClick={handleUndo}
                    disabled={operations.length === 0}
                  >
                    撤销
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
                    onClick={handleReset}
                    disabled={operations.length === 0 && !draftOperation}
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
                    onClick={onRetake}
                    disabled={isExporting}
                  >
                    调整选区
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
                    onClick={onCancel}
                    disabled={isExporting}
                  >
                    取消
                  </button>
                </div>

                <button
                  type="button"
                  className={clsx(
                    "rounded-lg px-4 py-2 font-semibold transition",
                    isExporting
                      ? "bg-[rgba(255,255,255,0.45)] text-[rgba(18,27,43,0.7)]"
                      : "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
                  )}
                  onClick={handleConfirm}
                >
                  {isExporting ? "保存中…" : "完成"}
                </button>
              </div>
            </div>,
            overlayElement
          )
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

          <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-[rgba(13,23,42,0.75)] px-3 py-1 text-[11px] text-white/85 backdrop-blur">
            {payload.width} × {payload.height} / 逻辑尺寸 {payload.logical_width} ×{" "}
            {payload.logical_height}
          </div>

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

  return (
    <>
      <div
        className="flex h-full w-full flex-col items-center gap-6 overflow-y-auto px-10 py-8"
        style={containerStyle}
      >
      <div className="flex w-full max-w-[min(1080px,100%)] flex-wrap items-center justify-between gap-4 rounded-2xl bg-[rgba(18,27,43,0.82)] px-5 py-4 text-sm text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="flex items-center gap-2">
          {TOOL_ORDER.map((current) => (
            <button
              key={current}
              type="button"
              className={clsx(
                "rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150",
                tool === current
                  ? "bg-[rgba(255,255,255,0.92)] text-[rgba(18,27,43,0.9)] shadow"
                  : "bg-[rgba(255,255,255,0.16)] text-white/80 hover:bg-[rgba(255,255,255,0.28)]"
              )}
              onClick={() => setTool(current)}
            >
              {TOOL_LABELS[current]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {tool !== "mosaic" && (
            <div className="flex items-center gap-2">
              {COLOR_CHOICES.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={clsx(
                    "h-7 w-7 rounded-full border-2 transition-all duration-150",
                    strokeColor === color
                      ? "border-white scale-110 shadow-lg"
                      : "border-transparent opacity-80 hover:opacity-100"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setStrokeColor(color)}
                  aria-label={`选择颜色 ${color}`}
                />
              ))}
            </div>
          )}

          {tool === "mosaic" && (
            <label className="flex items-center gap-2 text-xs text-white/80">
              马赛克强度
              <input
                type="range"
                min={18}
                max={120}
                step={6}
                value={mosaicSize}
                onChange={(event) => setMosaicSize(Number(event.target.value))}
              />
            </label>
          )}

          {tool !== "mosaic" && tool !== "text" && (
            <div className="flex items-center gap-1">
              {STROKE_CHOICES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={clsx(
                    "rounded-lg px-2 py-1 text-xs transition-all",
                    strokeWidth === item.value
                      ? "bg-white text-[rgba(18,27,43,0.9)] font-semibold"
                      : "bg-[rgba(255,255,255,0.14)] text-white/80 hover:bg-[rgba(255,255,255,0.24)]"
                  )}
                  onClick={() => setStrokeWidth(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {tool === "text" && (
            <div className="flex items-center gap-1">
              {TEXT_SIZE_CHOICES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={clsx(
                    "rounded-lg px-2 py-1 text-xs transition-all",
                    textSize === item.value
                      ? "bg-white text-[rgba(18,27,43,0.9)] font-semibold"
                      : "bg-[rgba(255,255,255,0.14)] text-white/80 hover:bg-[rgba(255,255,255,0.24)]"
                  )}
                  onClick={() => setTextSize(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
            onClick={handleUndo}
            disabled={operations.length === 0}
          >
            撤销
          </button>
          <button
            type="button"
            className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
            onClick={handleReset}
            disabled={operations.length === 0 && !draftOperation}
          >
            重置
          </button>
          <button
            type="button"
            className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
            onClick={onRetake}
            disabled={isExporting}
          >
            调整选区
          </button>
          <button
            type="button"
            className="rounded-lg bg-[rgba(255,255,255,0.14)] px-3 py-2 text-white/90 transition hover:bg-[rgba(255,255,255,0.24)]"
            onClick={onCancel}
            disabled={isExporting}
          >
            取消
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-lg px-4 py-2 font-semibold transition",
              isExporting
                ? "bg-[rgba(255,255,255,0.45)] text-[rgba(18,27,43,0.7)]"
                : "bg-[#3b82f6] text-white hover:bg-[#2563eb]"
            )}
            onClick={handleConfirm}
          >
            {isExporting ? "保存中…" : "完成"}
          </button>
        </div>
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
          {payload.width} × {payload.height} / 逻辑尺寸 {payload.logical_width} ×{" "}
          {payload.logical_height}
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

function drawOperation(
  ctx: CanvasRenderingContext2D,
  operation: DrawOperation,
  image: HTMLImageElement,
  helperCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>
) {
  switch (operation.kind) {
    case "line":
      drawLine(ctx, operation);
      break;
    case "rectangle":
      drawRectangle(ctx, operation);
      break;
    case "circle":
      drawCircle(ctx, operation);
      break;
    case "pen":
      drawPen(ctx, operation);
      break;
    case "mosaic":
      drawMosaic(ctx, image, operation, helperCanvasRef);
      break;
    case "text":
      drawText(ctx, operation);
      break;
    default:
      break;
  }
}

function drawText(ctx: CanvasRenderingContext2D, operation: TextOperation) {
  const lines = operation.text.split(/\r?\n/);
  const lineHeight = operation.fontSize * 1.25;
  ctx.save();
  ctx.fillStyle = operation.color;
  ctx.font = `${operation.fontSize}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = operation.align === "center" ? "center" : "left";
  const baseX = operation.position.x;
  const baseY = operation.position.y;
  lines.forEach((line, index) => {
    const content = line.length > 0 ? line : " ";
    ctx.fillText(content, baseX, baseY + index * lineHeight);
  });
  ctx.restore();
}

function drawLine(ctx: CanvasRenderingContext2D, operation: LineOperation) {
  ctx.save();
  ctx.strokeStyle = operation.color;
  ctx.lineWidth = operation.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(operation.start.x, operation.start.y);
  ctx.lineTo(operation.end.x, operation.end.y);
  ctx.stroke();
  ctx.restore();
}

function drawRectangle(ctx: CanvasRenderingContext2D, operation: RectangleOperation) {
  const x = Math.min(operation.start.x, operation.end.x);
  const y = Math.min(operation.start.y, operation.end.y);
  const width = Math.abs(operation.start.x - operation.end.x);
  const height = Math.abs(operation.start.y - operation.end.y);
  ctx.save();
  ctx.strokeStyle = operation.color;
  ctx.lineWidth = operation.width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawCircle(ctx: CanvasRenderingContext2D, operation: CircleOperation) {
  const centerX = (operation.start.x + operation.end.x) / 2;
  const centerY = (operation.start.y + operation.end.y) / 2;
  const radiusX = Math.abs(operation.start.x - operation.end.x) / 2;
  const radiusY = Math.abs(operation.start.y - operation.end.y) / 2;
  ctx.save();
  ctx.strokeStyle = operation.color;
  ctx.lineWidth = operation.width;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPen(ctx: CanvasRenderingContext2D, operation: PenOperation) {
  if (operation.points.length < 2) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = operation.color;
  ctx.lineWidth = operation.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(operation.points[0].x, operation.points[0].y);
  for (let index = 1; index < operation.points.length; index += 1) {
    const point = operation.points[index];
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMosaic(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  operation: MosaicOperation,
  helperCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>
) {
  if (!helperCanvasRef.current) {
    helperCanvasRef.current = document.createElement("canvas");
  }
  const helper = helperCanvasRef.current;
  const helperCtx = helper.getContext("2d");
  if (!helperCtx) {
    return;
  }
  helperCtx.imageSmoothingEnabled = false;

  const blockSize = Math.max(8, Math.round(operation.size / 3));

  operation.points.forEach((point) => {
    const targetSize = Math.max(operation.size, 12);
    const half = targetSize / 2;
    const sourceX = Math.max(0, Math.round(point.x - half));
    const sourceY = Math.max(0, Math.round(point.y - half));
    const sourceWidth = Math.min(targetSize, ctx.canvas.width - sourceX);
    const sourceHeight = Math.min(targetSize, ctx.canvas.height - sourceY);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }
    const scaledWidth = Math.max(1, Math.round(sourceWidth / blockSize));
    const scaledHeight = Math.max(1, Math.round(sourceHeight / blockSize));
    helper.width = scaledWidth;
    helper.height = scaledHeight;
    helperCtx.clearRect(0, 0, scaledWidth, scaledHeight);
    helperCtx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      scaledWidth,
      scaledHeight
    );
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      helper,
      0,
      0,
      scaledWidth,
      scaledHeight,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight
    );
    ctx.restore();
  });
}

function clampNumber(value: number, min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function maybeAppendPoint(points: Point[], point: Point, threshold: number) {
  if (points.length === 0) {
    return [point];
  }
  const last = points[points.length - 1];
  const distance = Math.hypot(point.x - last.x, point.y - last.y);
  if (distance < threshold) {
    return points;
  }
  return [...points, point];
}

function normalizeDraftOperation(operation: DrawOperation): DrawOperation | null {
  if (operation.kind === "pen" && operation.points.length > 1) {
    return operation;
  }
  if (operation.kind === "mosaic" && operation.points.length > 0) {
    return operation;
  }
  if (
    (operation.kind === "line" ||
      operation.kind === "rectangle" ||
      operation.kind === "circle") &&
    (operation.start.x !== operation.end.x || operation.start.y !== operation.end.y)
  ) {
    return operation;
  }
  return null;
}
