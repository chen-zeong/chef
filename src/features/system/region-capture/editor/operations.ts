import type { MutableRefObject } from "react";
import type {
  CircleOperation,
  DrawOperation,
  LineOperation,
  MosaicOperation,
  PenOperation,
  Point,
  RectangleOperation,
  TextOperation
} from "./types";

export function drawOperation(
  ctx: CanvasRenderingContext2D,
  operation: DrawOperation,
  image: HTMLImageElement,
  helperCanvasRef: MutableRefObject<HTMLCanvasElement | null>
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

export function drawText(ctx: CanvasRenderingContext2D, operation: TextOperation) {
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

export function drawLine(ctx: CanvasRenderingContext2D, operation: LineOperation) {
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

export function drawRectangle(ctx: CanvasRenderingContext2D, operation: RectangleOperation) {
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

export function drawCircle(ctx: CanvasRenderingContext2D, operation: CircleOperation) {
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

export function drawPen(ctx: CanvasRenderingContext2D, operation: PenOperation) {
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

export function drawMosaic(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  operation: MosaicOperation,
  helperCanvasRef: MutableRefObject<HTMLCanvasElement | null>
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

export function clampNumber(value: number, min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function maybeAppendPoint(points: Point[], point: Point, threshold: number) {
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

export function normalizeDraftOperation(operation: DrawOperation): DrawOperation | null {
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
