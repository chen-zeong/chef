import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import md5 from "crypto-js/md5";
import {
  BUTTON_GHOST,
  PANEL_BLOCK,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";

type DigestVariant = {
  id: string;
  label: string;
  value: string;
};

const emptyMessage = "输入内容即可生成 MD5 摘要。";

export function Md5Tool() {
  const [input, setInput] = useState<string>("Chef Toolbox");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);
  const [resultsMaxHeight, setResultsMaxHeight] = useState<number | null>(null);

  const digestVariants = useMemo<DigestVariant[]>(() => {
    if (!input) {
      return [];
    }
    const hash = md5(input).toString();
    const lower32 = hash.toLowerCase();
    const upper32 = hash.toUpperCase();
    const lower16 = lower32.substring(8, 24);
    const upper16 = upper32.substring(8, 24);
    return [
      { id: "32-lower", label: "32 位 · 小写", value: lower32 },
      { id: "32-upper", label: "32 位 · 大写", value: upper32 },
      { id: "16-lower", label: "16 位 · 小写", value: lower16 },
      { id: "16-upper", label: "16 位 · 大写", value: upper16 }
    ];
  }, [input]);
  const rows = digestVariants;

  useEffect(() => {
    if (!copiedKey) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedKey(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    if (copiedKey && !rows.some((row) => row.id === copiedKey)) {
      setCopiedKey(null);
    }
  }, [copiedKey, rows]);

  useEffect(() => {
    const updateMaxHeight = () => {
      if (!resultContainerRef.current) {
        return;
      }
      const rect = resultContainerRef.current.getBoundingClientRect();
      const available = window.innerHeight - rect.top - 40;
      setResultsMaxHeight(Math.max(220, available));
    };
    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    return () => window.removeEventListener("resize", updateMaxHeight);
  }, []);

  const handleCopy = async (value: string, key: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Hash</p>
          <h3 className={PANEL_TITLE}>MD5 摘要生成器</h3>
        </div>
        <motion.button
          type="button"
          className={BUTTON_GHOST}
          whileTap={{ scale: 0.94 }}
          onClick={() => setInput("")}
        >
          清空
        </motion.button>
      </header>

      <div className={PANEL_GRID}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>输入文本</label>
          <textarea
            className="scroll-area min-h-[160px] resize-none rounded-md border border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            spellCheck={false}
            value={input}
            placeholder="请输入要加密的内容"
            onChange={(event) => setInput(event.target.value)}
          />
        </div>

        <div className={clsx(PANEL_BLOCK, "min-h-0")}>
          <label className={PANEL_LABEL}>摘要结果</label>
          {rows.length > 0 ? (
            <div
              ref={resultContainerRef}
              className="scroll-area flex-1 min-h-[220px] overflow-auto pr-2"
              style={resultsMaxHeight ? { maxHeight: `${resultsMaxHeight}px` } : undefined}
            >
              <div className="flex flex-col gap-3">
                {rows.map((row) => (
                  <ResultRow
                    key={row.id}
                    label={row.label}
                    value={row.value}
                    copyKey={row.id}
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className={clsx(PANEL_RESULT, "text-sm", PANEL_MUTED)}>{emptyMessage}</div>
          )}
        </div>
      </div>

    </div>
  );
}

type ResultRowProps = {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void;
};

function ResultRow({ label, value, copyKey, copiedKey, onCopy }: ResultRowProps) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-3"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
        <span className="font-mono text-sm text-[var(--text-primary)] break-all">{value}</span>
      </div>
      <motion.button
        type="button"
        className={clsx(BUTTON_GHOST, "px-3 py-1 text-xs")}
        whileTap={{ scale: value ? 0.95 : 1 }}
        disabled={!value}
        onClick={() => value && onCopy(value, copyKey)}
      >
        {copiedKey === copyKey ? "已复制" : "复制"}
      </motion.button>
    </div>
  );
}
