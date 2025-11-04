import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import clsx from "clsx";
import type { CaptureSuccessPayload } from "./regionCaptureTypes";

type EditorTool = "line" | "rectangle" | "circle" | "pen" | "mosaic";

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

type DrawOperation =
  | LineOperation
  | RectangleOperation
  | CircleOperation
  | PenOperation
  | MosaicOperation;

type RegionCaptureEditorProps = {
  payload: CaptureSuccessPayload;
  onConfirm: (dataUrl: string) => Promise<void> | void;
  onCancel: () => void;
  onRetake: () => void;
};

const TOOL_LABELS: Record<EditorTool, string> = {
  line: "画线",
  rectangle: "矩形",
  circle: "圈选",
  pen: "画笔",
  mosaic: "马赛克"
};

const COLOR_CHOICES = ["#ff4d4f", "#ffc53d", "#4096ff", "#36cfc9", "#ffffff"];

const STROKE_CHOICES = [
  { label: "细", value: 2 },
  { label: "中", value: 4 },
  { label: "粗", value: 6 }
];

const DEFAULT_MOSAIC_SIZE = 42;

export function RegionCaptureEditor({
  payload,
  onConfirm,
  onCancel,
  onRetake
}: RegionCaptureEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const helperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerActiveRef = useRef(false);
  const [operations, setOperations] = useState<DrawOperation[]>([]);
  const [draftOperation, setDraftOperation] = useState<DrawOperation | null>(null);
  const draftRef = useRef<DrawOperation | null>(null);
  const [tool, setTool] = useState<EditorTool>("rectangle");
  const [strokeColor, setStrokeColor] = useState(COLOR_CHOICES[0]);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [mosaicSize, setMosaicSize] = useState<number>(DEFAULT_MOSAIC_SIZE);
  const [isExporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

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
    const updateScale = () => {
      const marginX = 160;
      const marginY = 200;
      const availableWidth = Math.max(320, window.innerWidth - marginX);
      const availableHeight = Math.max(240, window.innerHeight - marginY);
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
  }, [payload.width, payload.height]);

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

  const handleUndo = useCallback(() => {
    setOperations((prev) => prev.slice(0, -1));
    setDraftOperation(null);
  }, []);

  const handleReset = useCallback(() => {
    setOperations([]);
    setDraftOperation(null);
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
    const displayWidth = Math.round(payload.width * scale);
    const displayHeight = Math.round(payload.height * scale);
    return {
      width: `${displayWidth}px`,
      height: `${displayHeight}px`
    };
  }, [payload.height, payload.width, scale]);

  return (
    <div className="flex h-full w-full flex-col items-center gap-6 px-10 py-8">
      <div className="flex w-full max-w-[min(1080px,100%)] flex-wrap items-center justify-between gap-4 rounded-2xl bg-[rgba(18,27,43,0.82)] px-5 py-4 text-sm text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="flex items-center gap-2">
          {(["line", "rectangle", "circle", "pen", "mosaic"] as EditorTool[]).map(
            (current) => (
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
            )
          )}
        </div>

        <div className="flex items-center gap-3">
          {tool !== "mosaic" && (
            <>
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
            </>
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
            className="max-h-[80vh] max-w-[80vw] rounded-[18px] shadow-inner"
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
    default:
      break;
  }
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
