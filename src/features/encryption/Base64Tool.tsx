import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_PRIMARY,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  PANEL_BLOCK,
  PANEL_BUTTON_GROUP,
  PANEL_ERROR,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";

type Base64Mode = "encode" | "decode";

function encodeBase64(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

export function Base64Tool() {
  const [mode, setMode] = useState<Base64Mode>("encode");
  const [input, setInput] = useState("Chef Toolbox");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);
  const [resultsMaxHeight, setResultsMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    try {
      const result = mode === "encode" ? encodeBase64(input) : decodeBase64(input);
      setOutput(result);
      setError(null);
    } catch (convertError) {
      setOutput("");
      setError(
        convertError instanceof Error ? convertError.message : "无法处理当前输入，请检查格式。"
      );
    }
  }, [input, mode]);

  const rows = useMemo(() => {
    if (!output) {
      return [];
    }
    return [
      {
        id: "base64-result",
        label: mode === "encode" ? "编码结果" : "解码结果",
        value: output
      }
    ];
  }, [output, mode]);

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

  const handleCopy = async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "复制失败，请稍后重试。");
    }
  };

  const emptyMessage = mode === "encode" ? "输入内容后将显示编码结果。" : "输入 Base64 后将显示解码结果。";

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Codec</p>
          <h3 className={PANEL_TITLE}>Base64 编解码</h3>
        </div>
        <motion.div className={PANEL_BUTTON_GROUP} layout>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "encode" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("encode")}
          >
            编码
          </motion.button>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "decode" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("decode")}
          >
            解码
          </motion.button>
        </motion.div>
      </header>

      <div className={PANEL_GRID}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>{mode === "encode" ? "原始内容" : "Base64 字符串"}</label>
          <textarea
            className="scroll-area min-h-[160px] resize-none rounded-md border border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={mode === "encode" ? "请输入要编码的内容" : "请输入 Base64 字符串"}
          />
        </div>
        <div className={clsx(PANEL_BLOCK, "min-h-0")}>
          <label className={PANEL_LABEL}>{mode === "encode" ? "编码结果" : "解码结果"}</label>
          {rows.length > 0 ? (
            <div
              ref={resultContainerRef}
              className="scroll-area flex-1 min-h-[220px] overflow-auto pr-2"
              style={resultsMaxHeight ? { maxHeight: `${resultsMaxHeight}px` } : undefined}
            >
              <div className="flex flex-col gap-3">
                {rows.map((row) => (
                  <ResultRow key={row.id} label={row.label} value={row.value} />
                ))}
              </div>
            </div>
          ) : (
            <div className={clsx(PANEL_RESULT, "text-sm", PANEL_MUTED)}>{emptyMessage}</div>
          )}
          <motion.button
            type="button"
            className={BUTTON_PRIMARY}
            whileTap={{ scale: output ? 0.95 : 1 }}
            disabled={!output}
            onClick={handleCopy}
          >
            {copied ? "已复制" : "复制结果"}
          </motion.button>
        </div>
      </div>

      {error && <div className={PANEL_ERROR}>{error}</div>}
    </div>
  );
}

type ResultRowProps = {
  label: string;
  value: string;
};

function ResultRow({ label, value }: ResultRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
        <span className="font-mono text-sm text-[var(--text-primary)] break-all">{value}</span>
      </div>
    </div>
  );
}
