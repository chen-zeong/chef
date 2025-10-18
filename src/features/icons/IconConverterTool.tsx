import { useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_PRIMARY,
  BUTTON_GHOST,
  CHIP_ACTIVE,
  CHIP_BASE,
  PANEL_CONTAINER,
  PANEL_ERROR,
  PANEL_INPUT
} from "../../ui/styles";

type ConvertedIcon = {
  size: number;
  dataUrl: string;
};

const AVAILABLE_SIZES = [16, 32, 64, 128, 256] as const;

export function IconConverterTool() {
  const [source, setSource] = useState<string>("");
  const [name, setName] = useState<string>("app-icon");
  const [activeSizes, setActiveSizes] = useState<number[]>([32, 64, 128, 256]);
  const [converted, setConverted] = useState<ConvertedIcon[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isReady = Boolean(source && imgRef.current);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件（PNG、JPEG、SVG 等）。");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        setSource(result);
        setConverted([]);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSizes = (size: number) => {
    setActiveSizes((prev) =>
      prev.includes(size) ? prev.filter((item) => item !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const convert = async () => {
    if (!imgRef.current) {
      setError("请先上传图片。");
      return;
    }
    setError(null);
    const image = imgRef.current;
    const results: ConvertedIcon[] = [];
    for (const size of activeSizes) {
      const canvas = document.createElement("canvas");
      const scale = Math.min(image.width, image.height);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        continue;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(
        image,
        (image.width - scale) / 2,
        (image.height - scale) / 2,
        scale,
        scale,
        0,
        0,
        size,
        size
      );
      const dataUrl = canvas.toDataURL("image/png");
      results.push({ size, dataUrl });
    }
    setConverted(results);
  };

  const handleDownload = (icon: ConvertedIcon) => {
    const link = document.createElement("a");
    link.href = icon.dataUrl;
    link.download = `${name || "icon"}-${icon.size}.png`;
    link.click();
  };

  return (
    <div className="flex h-full flex-col">
      <div className={clsx(PANEL_CONTAINER, "flex-1 gap-6")}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Icon</span>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">图片转图标</h3>
          </div>
          <label
            className={clsx(
              BUTTON_GHOST,
              "cursor-pointer px-4 py-2 text-sm font-semibold uppercase tracking-[0.1em]"
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleFile(file);
                  event.target.value = "";
                }
              }}
            />
            选择图片
          </label>
        </header>

        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4">
          {source ? (
            <div className="flex flex-col items-center gap-3">
              <img
                ref={(node) => {
                  imgRef.current = node;
                  if (node && node.complete) {
                    setInfo({ width: node.naturalWidth, height: node.naturalHeight });
                  }
                }}
                src={source}
                alt="待转换图片"
                className="max-h-64 w-full rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] object-contain p-3"
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setInfo({ width: target.naturalWidth, height: target.naturalHeight });
                  setConverted([]);
                }}
              />
              {info && (
                <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                  原始尺寸：{info.width} × {info.height}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-6 py-10 text-center text-sm text-[var(--text-secondary)]">
              <p>拖拽图片至此，或点击右上角按钮上传。</p>
              <p>支持 PNG / JPG / SVG / WebP 等常见格式。</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-5">
          <label className="flex flex-col gap-2 text-sm font-medium text-[var(--text-secondary)]">
            文件名前缀
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="app-icon"
              className={clsx(PANEL_INPUT, "py-2")}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {AVAILABLE_SIZES.map((size) => {
              const active = activeSizes.includes(size);
              return (
                <label
                  key={size}
                  className={clsx(
                    CHIP_BASE,
                    "cursor-pointer px-4 py-2 text-xs uppercase tracking-[0.18em]",
                    active && CHIP_ACTIVE
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={active}
                    onChange={() => handleSizes(size)}
                  />
                  {size}px
                </label>
              );
            })}
          </div>
          <motion.button
            type="button"
            className={clsx(BUTTON_PRIMARY, "self-start px-5")}
            whileTap={{ scale: 0.95 }}
            onClick={convert}
            disabled={!isReady || !activeSizes.length}
          >
            生成图标
          </motion.button>
        </div>

        {error && <div className={PANEL_ERROR}>提示：{error}</div>}

        {!!converted.length && (
          <div className="grid gap-3 md:grid-cols-2">
            {converted.map((icon) => (
              <div
                key={icon.size}
                className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={icon.dataUrl}
                    alt={`${icon.size}px 图标`}
                    className="h-12 w-12 rounded-lg border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] object-contain p-2"
                  />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {icon.size} × {icon.size}
                  </span>
                </div>
                <button
                  type="button"
                  className={clsx(
                    BUTTON_GHOST,
                    "px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em]"
                  )}
                  onClick={() => handleDownload(icon)}
                >
                  下载
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
