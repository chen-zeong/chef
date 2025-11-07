import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_PRIMARY,
  PANEL_CONTAINER,
  PANEL_DESCRIPTION,
  PANEL_TITLE
} from "../../ui/styles";
import type { CaptureSuccessPayload } from "./region-capture/regionCaptureTypes";

export function ScreenshotTool() {
  const [isLaunching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<CaptureSuccessPayload | null>(null);

  const handleStartCapture = async () => {
    setError(null);
    setLaunching(true);
    try {
      await invoke("show_region_capture_overlay");
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "启动框选窗口失败，请稍后再试。"
      );
    } finally {
      setLaunching(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      const unlisten = await listen<CaptureSuccessPayload>("region-capture-complete", (event) => {
        if (!mounted) {
          return;
        }
        setLastCapture(event.payload);
        setError(null);
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

  const capturePreviewSrc = lastCapture
    ? `data:image/png;base64,${lastCapture.base64}`
    : null;

  return (
    <section className={clsx(PANEL_CONTAINER, "gap-4")}>
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
          Region Capture
        </span>
        <h3 className={PANEL_TITLE}>框选截图</h3>
      </header>

      <p className={PANEL_DESCRIPTION}>
        点击按钮进入框选模式，拖动鼠标即可选取任意区域，松开后自动生成截图并回传到此处。
      </p>

      <motion.button
        type="button"
        className={clsx(BUTTON_PRIMARY, "w-full justify-center")}
        whileTap={{ scale: 0.97 }}
        disabled={isLaunching}
        onClick={handleStartCapture}
      >
        启动框选遮罩
      </motion.button>

      <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-4 text-sm text-[var(--text-secondary)]">
        <h4 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          使用提示
        </h4>
        <ul className="list-inside list-disc space-y-2">
          <li>按住鼠标左键拖拽完成框选，松开后立即进入标注模式。</li>
          <li>工具栏支持画线、矩形、圈选、画笔与马赛克效果，可逐步撤销。</li>
          <li>按 Esc 可随时取消并退出截屏模式。</li>
          <li>截图会保存在系统临时目录，并在下方展示预览与路径。</li>
        </ul>
      </div>

      {capturePreviewSrc && lastCapture && (
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-white/70 p-4 shadow-inner">
          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
            <span className="font-medium text-[var(--text-secondary)]">
              最近截图
            </span>
            <span>
              {lastCapture.width} × {lastCapture.height}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-[rgba(15,23,42,0.08)] bg-[var(--surface-alt-bg)]">
            <img
              src={capturePreviewSrc}
              alt="最近截图"
              className="max-h-[260px] w-full object-contain"
            />
          </div>
          <div className="rounded-lg bg-[var(--surface-alt-bg)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
            <div>
              物理像素：{lastCapture.width} × {lastCapture.height}
            </div>
            <div>
              逻辑尺寸：{lastCapture.logical_width} × {lastCapture.logical_height}
            </div>
          </div>
          <div className="rounded-lg bg-[var(--surface-alt-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <span className="block truncate font-mono text-[11px]">
              {lastCapture.path}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[rgba(220,38,38,0.2)] bg-[rgba(254,226,226,0.6)] px-3 py-2 text-sm text-[var(--negative)]">
          {error}
        </div>
      )}
    </section>
  );
}
