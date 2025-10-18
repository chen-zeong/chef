import { useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  CHIP_ACTIVE,
  CHIP_BASE,
  PANEL_CONTAINER,
  PANEL_TEXTAREA
} from "../../ui/styles";

export function SvgPreviewTool() {
  const [code, setCode] = useState<string>(defaultSvg);
  const [background, setBackground] = useState<"grid" | "light" | "dark">("grid");

  const sanitizedCode = useMemo(() => code.trim(), [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sanitizedCode);
  };

  const modeButtonClass = (mode: typeof background) =>
    clsx(
      CHIP_BASE,
      "px-4 py-1.5 text-xs uppercase tracking-[0.18em]",
      mode === background && CHIP_ACTIVE
    );

  const stageStyles: Record<typeof background, CSSProperties> = {
    grid: {
      backgroundImage:
        "linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(180deg, rgba(148,163,184,0.15) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
      backgroundColor: "var(--surface-bg)"
    },
    light: {
      backgroundColor: "var(--surface-alt-bg)"
    },
    dark: {
      backgroundColor: "rgba(28,28,36,0.92)"
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className={clsx(PANEL_CONTAINER, "flex-1 gap-6")}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">SVG</span>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">SVG 代码预览</h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className={clsx(BUTTON_GHOST, "px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em]")}
            type="button"
            onClick={handleCopy}
            disabled={!sanitizedCode}
          >
            复制代码
          </motion.button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <textarea
            className={clsx(PANEL_TEXTAREA, "min-h-[320px] font-mono text-sm")}
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="<svg>...</svg>"
          />
          <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-[var(--text-secondary)]">
              <span>预览</span>
              <div className="flex items-center gap-2">
                <button type="button" className={modeButtonClass("grid")} onClick={() => setBackground("grid")}>
                  网格
                </button>
                <button type="button" className={modeButtonClass("light")} onClick={() => setBackground("light")}>
                  浅色
                </button>
                <button type="button" className={modeButtonClass("dark")} onClick={() => setBackground("dark")}>
                  深色
                </button>
              </div>
            </div>
            <div
              className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--border-subtle)]"
              style={stageStyles[background]}
            >
              {sanitizedCode ? (
                <div
                  className="grid h-full w-full place-items-center p-6"
                  dangerouslySetInnerHTML={{
                    __html: sanitizedCode
                  }}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                  粘贴 SVG 代码后立即预览。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const defaultSvg = `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" rx="24" fill="#EEF2FF"/>
  <path d="M48 20L72 34V62L48 76L24 62V34L48 20Z" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M48 56C53.5228 56 58 51.5228 58 46C58 40.4772 53.5228 36 48 36C42.4772 36 38 40.4772 38 46C38 51.5228 42.4772 56 48 56Z" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;
