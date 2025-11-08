import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Check, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_CONTAINER,
  PANEL_ERROR,
  PANEL_INPUT
} from "../../ui/styles";
import { generatePlatformAsset, PlatformId, sanitizeFileName } from "./utils/iconGenerator";

type PlatformState = "idle" | "loading" | "done";

type PlatformCard = {
  id: PlatformId;
  title: string;
  description: string;
  output: string;
  action: string;
  preview: {
    wrapper: string;
    device: string;
    image: string;
  };
};

const PLATFORM_CARDS: PlatformCard[] = [
  {
    id: "android",
    title: "Android",
    description: "输出 mipmap 目录以及 Play 商店图标。",
    output: "ZIP · PNG × 6",
    action: "生成 Android 资源",
    preview: {
      wrapper: "bg-gradient-to-br from-[#0c3b2c] via-[#062016] to-[#030b08]",
      device:
        "h-28 w-28 rounded-[32%] bg-white/95 p-3 shadow-[0_30px_60px_rgba(0,0,0,0.45)] border border-white/40",
      image: "rounded-[32%]"
    }
  },
  {
    id: "ios",
    title: "iOS",
    description: "生成完整 AppIcon.appiconset 与 Contents.json。",
    output: "ZIP · PNG × 17",
    action: "生成 iOS 资源",
    preview: {
      wrapper: "bg-gradient-to-br from-[#0f1b34] via-[#0d1527] to-[#070b15]",
      device:
        "h-28 w-28 rounded-[38%] bg-gradient-to-br from-white to-[#f0f0f0] p-4 shadow-[0_30px_60px_rgba(15,23,42,0.45)] border border-white/60",
      image: "rounded-[32%]"
    }
  },
  {
    id: "macos",
    title: "macOS",
    description: "导出带 16-1024px 切片的 ICNS 文件。",
    output: "ICNS",
    action: "导出 macOS (icns)",
    preview: {
      wrapper: "bg-gradient-to-br from-[#06070c] via-[#0c1320] to-[#05070e]",
      device:
        "h-28 w-36 rounded-[1.2rem] border border-white/10 bg-gradient-to-b from-[#1f2937] to-[#0f172a] p-4 shadow-[0_30px_60px_rgba(0,0,0,0.55)]",
      image: "rounded-[20%]"
    }
  },
  {
    id: "windows",
    title: "Windows",
    description: "ICO 内含 16/32/64/96/128/256px PNG。",
    output: "ICO · 6 尺寸",
    action: "导出 Windows (ico)",
    preview: {
      wrapper: "bg-gradient-to-br from-[#02060f] via-[#071326] to-[#02050b]",
      device:
        "h-28 w-36 rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-[#1f2a37] to-[#101726] p-4 shadow-[0_30px_60px_rgba(2,6,15,0.6)]",
      image: "rounded-xl"
    }
  },
  {
    id: "web",
    title: "Web",
    description: "轻量 favicon，包含 16/32/48px。",
    output: "ICO · 3 尺寸",
    action: "导出 Web (ico)",
    preview: {
      wrapper: "bg-gradient-to-br from-[#15051c] via-[#240c3d] to-[#08030d]",
      device:
        "h-24 w-24 rounded-full border border-white/30 bg-white/90 p-3 shadow-[0_25px_50px_rgba(0,0,0,0.5)]",
      image: "rounded-full"
    }
  }
];

const DEFAULT_PLATFORM_STATE: Record<PlatformId, PlatformState> = {
  android: "idle",
  ios: "idle",
  macos: "idle",
  windows: "idle",
  web: "idle"
};

export function IconConverterTool() {
  const [source, setSource] = useState<string>("");
  const [name, setName] = useState<string>("app-icon");
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [platformState, setPlatformState] = useState<Record<PlatformId, PlatformState>>({
    ...DEFAULT_PLATFORM_STATE
  });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const timeoutRef = useRef<Partial<Record<PlatformId, number>>>({});
  const sanitizedName = useMemo(() => sanitizeFileName(name), [name]);
  const isReady = Boolean(source && imgRef.current);

  const clearPlatformTimers = () => {
    (Object.keys(timeoutRef.current) as PlatformId[]).forEach((platform) => {
      const timer = timeoutRef.current[platform];
      if (timer) {
        window.clearTimeout(timer);
        timeoutRef.current[platform] = undefined;
      }
    });
  };

  useEffect(
    () => () => {
      clearPlatformTimers();
    },
    []
  );

  const updateImageInfo = (width: number, height: number) => {
    setInfo((prev) => {
      if (prev && prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  };

  const handleFile = (file: File) => {
    if (!file?.type?.startsWith("image/")) {
      setError("请选择 PNG / JPG / SVG / WebP 等图片文件。");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        setSource(result);
        setInfo(null);
        setError(null);
        clearPlatformTimers();
        setPlatformState({ ...DEFAULT_PLATFORM_STATE });
      }
    };
    reader.readAsDataURL(file);
  };

  const resetImage = () => {
    clearPlatformTimers();
    setSource("");
    setInfo(null);
    setPlatformState({ ...DEFAULT_PLATFORM_STATE });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const updatePlatformState = (platform: PlatformId, state: PlatformState) => {
    setPlatformState((prev) => ({ ...prev, [platform]: state }));
    if (timeoutRef.current[platform]) {
      window.clearTimeout(timeoutRef.current[platform]);
      timeoutRef.current[platform] = undefined;
    }
    if (state === "done") {
      timeoutRef.current[platform] = window.setTimeout(() => {
        setPlatformState((prev) => ({ ...prev, [platform]: "idle" }));
        timeoutRef.current[platform] = undefined;
      }, 2000);
    }
  };

  const handleGenerate = async (platform: PlatformId) => {
    if (!imgRef.current) {
      setError("请先上传一张图片。");
      return;
    }
    try {
      setError(null);
      updatePlatformState(platform, "loading");
      const asset = await generatePlatformAsset(platform, imgRef.current, sanitizedName);
      downloadBlob(asset.blob, asset.filename);
      updatePlatformState(platform, "done");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "生成失败，请重试。";
      setError(message);
      updatePlatformState(platform, "idle");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className={clsx(PANEL_CONTAINER, "flex-1 gap-6")}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Icon Kit</span>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">图标预览与转换</h3>
            <p className="text-sm text-[var(--text-secondary)]">上传一张图片，预览多端效果并按需导出。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {source && (
              <button
                type="button"
                className={clsx(BUTTON_GHOST, "gap-2 px-4 py-2 text-sm")}
                onClick={resetImage}
              >
                <RefreshCcw className="h-4 w-4" />
                重置
              </button>
            )}
            <label className={clsx(BUTTON_PRIMARY, "cursor-pointer gap-2 px-4 py-2 text-sm font-semibold")}>
              <UploadCloud className="h-4 w-4" />
              选择图片
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleFile(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </header>

        <div className="grid gap-5 md:grid-cols-2">
          <div
            className={clsx(
              "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4 text-center transition",
              dragActive && "border-[var(--accent)] bg-[rgba(37,99,235,0.08)]"
            )}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) {
                handleFile(file);
              }
            }}
          >
            {source ? (
              <div className="flex w-full flex-col items-center gap-3">
                <img
                  ref={(node) => {
                    imgRef.current = node;
                    if (node && node.complete) {
                      updateImageInfo(node.naturalWidth, node.naturalHeight);
                    }
                  }}
                  src={source}
                  alt="上传的原始图片"
                  className="max-h-64 w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] object-contain p-3"
                  onLoad={(event) => {
                    const target = event.currentTarget;
                    updateImageInfo(target.naturalWidth, target.naturalHeight);
                  }}
                />
                {info && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    原始尺寸：{info.width} × {info.height}
                  </span>
                )}
              </div>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-[var(--text-tertiary)]" />
                <div className="text-sm text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text-primary)]">拖拽图片至此或使用右上角按钮</p>
                  <p>支持 PNG、JPG、SVG、WebP，推荐 1024px 以上正方形图。</p>
                </div>
              </>
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
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-1 font-semibold tracking-[0.18em] text-[var(--text-secondary)]">
                导出文件名：{sanitizedName}
              </span>
              {info && (
                <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-1 font-semibold tracking-[0.18em] text-[var(--text-secondary)]">
                  纵横比：{info.width === info.height ? "1:1" : `${info.width}:${info.height}`}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">导出提示</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>每个平台单独生成，避免不必要的等待。</li>
                <li>窗口关闭前重复导出不会覆盖原始图片。</li>
                <li>若原图不为正方形，会自动居中裁切。</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {PLATFORM_CARDS.map((card) => {
            const state = platformState[card.id];
            const isLoading = state === "loading";
            const isDone = state === "done";
            return (
              <div
                key={card.id}
                className="flex flex-col gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div
                      className={clsx(
                        "relative flex h-36 w-full items-center justify-center overflow-hidden rounded-3xl border border-white/10 text-white",
                        card.preview.wrapper
                      )}
                    >
                      <div
                        className={clsx(
                          "flex items-center justify-center overflow-hidden",
                          card.preview.device,
                          source ? "" : "border-dashed border-white/40 bg-transparent"
                        )}
                      >
                        {source ? (
                          <img
                            src={source}
                            alt={`${card.title} 预览`}
                            className={clsx(
                              "h-full w-full object-cover shadow-[0_12px_32px_rgba(0,0,0,0.4)]",
                              card.preview.image
                            )}
                          />
                        ) : (
                          <span className="text-xs uppercase tracking-[0.2em] text-white/70">等待上传</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 sm:max-w-[45%]">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{card.title}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{card.description}</p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                      {card.output}
                    </span>
                  </div>
                </div>
                <motion.button
                  type="button"
                  className={clsx(
                    BUTTON_PRIMARY,
                    "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm",
                    "disabled:cursor-not-allowed"
                  )}
                  whileTap={{ scale: 0.97 }}
                  disabled={!isReady || isLoading}
                  onClick={() => handleGenerate(card.id)}
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isDone && !isLoading && <Check className="h-4 w-4" />}
                  {!isLoading && !isDone && null}
                  {isLoading ? "生成中..." : isDone ? "已保存" : card.action}
                </motion.button>
              </div>
            );
          })}
        </div>

        {error && <div className={PANEL_ERROR}>提示：{error}</div>}
      </div>
    </div>
  );
}
