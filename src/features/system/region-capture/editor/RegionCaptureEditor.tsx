import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
import {
  COLOR_CHOICES,
  DEFAULT_MOSAIC_SIZE,
  TOOLBAR_MARGIN
} from "./constants";
import {
  clampNumber,
  drawOperation,
  maybeAppendPoint,
  normalizeDraftOperation
} from "./operations";
import type {
  DrawOperation,
  EditorTool,
  Point,
  RegionCaptureEditorProps,
  TextEntryState,
  TextOperation,
  ToolbarPlacement
} from "./types";
import { TextInputOverlay } from "./components/TextInputOverlay";
import { InlineEditorLayout } from "./components/InlineEditorLayout";
import { FullEditorLayout } from "./components/FullEditorLayout";

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
  const [textEntry, setTextEntry] = useState<TextEntryState | null>(null);
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

  const computeToolbarPlacement = useCallback((): ToolbarPlacement | null => {
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

  const toolbarPlacement = useMemo<ToolbarPlacement | null>(() => {
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

  const textInputOverlay = (
    <TextInputOverlay
      entry={textEntry}
      textSize={textSize}
      inputRef={textInputRef}
      onChange={handleTextInputChange}
      onKeyDown={handleTextInputKeyDown}
      onCancel={cancelTextEntry}
      onConfirm={confirmTextEntry}
    />
  );

  if (isInline) {
    return (
      <InlineEditorLayout
        canvasRef={canvasRef}
        payload={payload}
        canvasStyle={canvasStyle}
        error={error}
        overlayRef={overlayRef}
        selectionRect={selectionRect}
        overlaySize={overlaySize}
        toolbarPlacement={toolbarPlacement}
        toolbarMaxWidth={toolbarMaxWidth}
        toolbarRef={toolbarRef}
        tool={tool}
        onToolChange={setTool}
        strokeColor={strokeColor}
        onStrokeColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        mosaicSize={mosaicSize}
        onMosaicSizeChange={setMosaicSize}
        textSize={textSize}
        onTextSizeChange={setTextSize}
        operationsCount={operations.length}
        hasDraftOperation={Boolean(draftOperation)}
        isExporting={isExporting}
        onUndo={handleUndo}
        onReset={handleReset}
        onRetake={onRetake}
        onCancel={onCancel}
        onConfirm={handleConfirm}
        textInputOverlay={textInputOverlay}
      />
    );
  }

  return (
    <FullEditorLayout
      canvasRef={canvasRef}
      payload={payload}
      canvasStyle={canvasStyle}
      containerStyle={containerStyle}
      error={error}
      tool={tool}
      onToolChange={setTool}
      strokeColor={strokeColor}
      onStrokeColorChange={setStrokeColor}
      strokeWidth={strokeWidth}
      onStrokeWidthChange={setStrokeWidth}
      mosaicSize={mosaicSize}
      onMosaicSizeChange={setMosaicSize}
      textSize={textSize}
      onTextSizeChange={setTextSize}
      operationsCount={operations.length}
      hasDraftOperation={Boolean(draftOperation)}
      isExporting={isExporting}
      onUndo={handleUndo}
      onReset={handleReset}
      onRetake={onRetake}
      onCancel={onCancel}
      onConfirm={handleConfirm}
      textInputOverlay={textInputOverlay}
    />
  );
}
