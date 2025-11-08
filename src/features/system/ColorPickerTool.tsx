import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { Check, Copy, Pipette, Trash2 } from "lucide-react";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_CONTAINER,
  PANEL_DESCRIPTION,
  PANEL_TITLE
} from "../../ui/styles";

const COLOR_HISTORY_KEY = "chef-color-history";
const MAX_HISTORY = 24;
const DEFAULT_COLOR = "#2563EB";

type ColorHistoryEntry = {
  value: string;
  pickedAt: number;
};

type NativeSamplerResponse = {
  hex: string;
  r: number;
  g: number;
  b: number;
  a: number;
};

type NativePickerState = "unknown" | "available" | "unavailable";

const loadStoredHistory = (): ColorHistoryEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(COLOR_HISTORY_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "value" in item &&
          "pickedAt" in item &&
          typeof (item as ColorHistoryEntry).value === "string" &&
          typeof (item as ColorHistoryEntry).pickedAt === "number"
        ) {
          return item as ColorHistoryEntry;
        }
        return null;
      })
      .filter((entry): entry is ColorHistoryEntry => !!entry);
  } catch {
    return [];
  }
};

const saveHistory = (entries: ColorHistoryEntry[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* 忽略存储失败，让历史记录为 best-effort */
  }
};

const isHexColor = (value: string) => /^#([0-9a-fA-F]{6})$/.test(value.trim());

const normalizeHex = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed.startsWith("#")) {
    return `#${trimmed}`;
  }
  return trimmed;
};

const getContrastColor = (hex: string) => {
  if (!isHexColor(hex)) {
    return "#fff";
  }
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6 ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.92)";
};

export function ColorPickerTool() {
  const [history, setHistory] = useState<ColorHistoryEntry[]>(() => loadStoredHistory());
  const [currentColor, setCurrentColor] = useState(() => history[0]?.value ?? DEFAULT_COLOR);
  const [manualHex, setManualHex] = useState(() => history[0]?.value ?? DEFAULT_COLOR);
  const [isPicking, setPicking] = useState(false);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasEyeDropper, setHasEyeDropper] = useState(false);
  const [nativePickerState, setNativePickerState] = useState<NativePickerState>("unknown");

  useEffect(() => {
    setHasEyeDropper(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    setManualHex(currentColor);
  }, [currentColor]);

  useEffect(() => {
    if (!copiedColor) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedColor(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedColor]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort((a, b) => b.pickedAt - a.pickedAt).slice(0, MAX_HISTORY),
    [history]
  );
  const showPickerWarning = nativePickerState === "unavailable" && !hasEyeDropper;

  const persistColor = useCallback((value: string) => {
    const normalized = normalizeHex(value);
    if (!isHexColor(normalized)) {
      return;
    }
    setCurrentColor(normalized);
    setHistory((prev) => {
      const deduped = prev.filter((entry) => entry.value !== normalized);
      return [{ value: normalized, pickedAt: Date.now() }, ...deduped].slice(
        0,
        MAX_HISTORY
      );
    });
  }, []);

  const handleManualHexChange = (raw: string) => {
    const normalized = raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
    setManualHex(normalized);
    if (normalized.length === 7 && isHexColor(normalized)) {
      persistColor(normalized);
    }
  };

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedColor(value);
    } catch {
      setError("复制失败，请手动复制。");
    }
  }, []);

  const handlePickColor = useCallback(async () => {
    if (isPicking) {
      return;
    }
    setError(null);
    setPicking(true);

    const runEyeDropperFallback = async () => {
      if (!hasEyeDropper || typeof window === "undefined") {
        throw new Error("当前环境暂未开放系统取色，建议使用手动拾色器。");
      }
      const EyeDropperCtor = (window as typeof window & {
        EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
      }).EyeDropper;
      if (!EyeDropperCtor) {
        setHasEyeDropper(false);
        throw new Error("当前环境暂未开放系统取色，建议使用手动拾色器。");
      }
      try {
        const result = await new EyeDropperCtor().open();
        if (result?.sRGBHex) {
          persistColor(result.sRGBHex);
        }
      } catch (issue) {
        if (issue instanceof DOMException && issue.name === "AbortError") {
          return;
        }
        throw new Error("启动系统取色失败，请稍后再试。");
      }
    };

    try {
      if (nativePickerState !== "unavailable") {
        try {
          const response = await invoke<NativeSamplerResponse | null>("pick_screen_color");
          setNativePickerState("available");
          if (response?.hex) {
            persistColor(response.hex);
          }
          return;
        } catch (issue) {
          const message =
            issue instanceof Error
              ? issue.message
              : typeof issue === "string"
                ? issue
                : "启动系统取色失败，请稍后再试。";
          const unsupported =
            message.includes("暂未支持") ||
            message.includes("not supported") ||
            message.includes("__TAURI_IPC__");
          if (!unsupported) {
            throw new Error(message || "启动系统取色失败，请稍后再试。");
          }
          setNativePickerState("unavailable");
        }
      }

      await runEyeDropperFallback();
    } catch (issue) {
      const fallbackMessage =
        issue instanceof Error ? issue.message : "启动系统取色失败，请稍后再试。";
      setError(fallbackMessage);
    } finally {
      setPicking(false);
    }
  }, [hasEyeDropper, isPicking, nativePickerState, persistColor]);

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleHistoryClick = (value: string) => {
    persistColor(value);
    handleCopy(value);
  };

  return (
    <section className={clsx(PANEL_CONTAINER, "gap-5")}>
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
          Color Picker
        </span>
        <h3 className={PANEL_TITLE}>取色器</h3>
      </header>

      <p className={PANEL_DESCRIPTION}>
        点击「启动取色」即可选取屏幕上的任意颜色，系统会自动记录最近拾取的色值并以方格展示，
        方便快速复制或回溯。
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4">
          <div
            className="relative flex h-48 w-full items-end rounded-2xl border border-[rgba(15,23,42,0.15)] bg-[var(--surface-alt-bg)] p-4 shadow-inner"
            style={{ backgroundColor: currentColor }}
          >
            <div className="flex flex-col gap-1 rounded-xl bg-[rgba(15,23,42,0.18)] px-3 py-2 backdrop-blur">
              <span className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
                Current
              </span>
              <span className="font-mono text-2xl font-semibold text-white">{currentColor}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-white/80 p-4">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">
              手动拾色
            </span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="color"
                value={currentColor}
                aria-label="拾色器"
                onChange={(event) => persistColor(event.target.value)}
                className="h-11 w-full rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-1 shadow-inner sm:w-20"
              />
              <input
                type="text"
                value={manualHex}
                placeholder="#RRGGBB"
                onChange={(event) => handleManualHexChange(event.target.value)}
                className="flex-1 rounded-xl border border-[color:var(--input-border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm uppercase tracking-wider text-[var(--text-primary)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.25)]"
              />
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">
              支持输入 #RRGGBB 格式，输入完成会自动加入历史列表。
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-white/90 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[var(--text-primary)]">系统取色</span>
              <span className="text-xs text-[var(--text-secondary)]">
                优先调用桌面端系统取色，不支持时自动回退到 EyeDropper。
              </span>
            </div>
            <button
              type="button"
              onClick={handlePickColor}
              disabled={isPicking}
              className={clsx(
                BUTTON_PRIMARY,
                "gap-2 whitespace-nowrap px-3 py-2 text-sm",
                isPicking && "cursor-wait"
              )}
            >
              <Pipette className="h-4 w-4" />
              {isPicking ? "取色中…" : "启动取色"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(currentColor)}
            className={clsx(BUTTON_GHOST, "gap-2 px-3 py-2 text-sm")}
          >
            {copiedColor === currentColor ? (
              <>
                <Check className="h-4 w-4 text-[var(--accent)]" />
                已复制
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                复制当前色值
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[var(--text-primary)]">拾色历史</span>
            <span className="text-xs text-[var(--text-secondary)]">
              点击色块可复制，同时设为当前颜色。
            </span>
          </div>
          {sortedHistory.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-tertiary)] transition hover:text-[var(--negative)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.2)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清除
            </button>
          )}
        </div>

        {sortedHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-10 text-center text-sm text-[var(--text-tertiary)]">
            还没有记录，先去取一个颜色吧～
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sortedHistory.map((entry) => (
              <motion.button
                layoutId={entry.value}
                key={entry.pickedAt}
                type="button"
                onClick={() => handleHistoryClick(entry.value)}
                className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.1)] shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.35)]"
                style={{ backgroundColor: entry.value }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgba(0,0,0,0.35)]" />
                <span
                  className="pointer-events-none absolute bottom-2 left-2 rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: getContrastColor(entry.value), backgroundColor: "rgba(0,0,0,0.28)" }}
                >
                  {entry.value}
                </span>
                {copiedColor === entry.value && (
                  <motion.span
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)] shadow"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </motion.span>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {showPickerWarning && (
        <div className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
          当前系统暂未提供系统取色或 EyeDropper 能力，推荐使用手动拾色或更新环境后再尝试。
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[rgba(220,38,38,0.2)] bg-[rgba(254,226,226,0.55)] px-3 py-2 text-sm text-[var(--negative)]">
          {error}
        </div>
      )}
    </section>
  );
}
