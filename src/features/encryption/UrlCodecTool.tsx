import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_PRIMARY,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  PANEL_BLOCK,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";

type CodecMode = "encode" | "decode";

const shellOptions = [
  { label: "编码", value: "encode" },
  { label: "解码", value: "decode" }
] as const;

export function UrlCodecTool() {
  const [mode, setMode] = useState<CodecMode>("encode");
  const [usePlus, setUsePlus] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => {
    if (!input) {
      setError(null);
      return "";
    }
    try {
      const trimmed = input.trim();
      const hashIndex = trimmed.indexOf("#");
      const fragment = hashIndex >= 0 ? trimmed.slice(hashIndex) : "";
      const withoutFragment = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

      const splitIndex = withoutFragment.indexOf("?");
      const hasQuery = splitIndex >= 0;
      const base = hasQuery ? withoutFragment.slice(0, splitIndex) : null;
      const query = hasQuery ? withoutFragment.slice(splitIndex + 1) : withoutFragment;
      const looksLikeUrl = withoutFragment.includes("://");

      const transformValue = (value: string) => {
        if (mode === "encode") {
          const encoded = encodeURIComponent(value);
          return usePlus ? encoded.replace(/%20/g, "+") : encoded;
        }
        return decodeURIComponent(value.replace(/\+/g, " "));
      };

      const processQuery = (text: string) => {
        if (!text) {
          return "";
        }
        return text
          .split("&")
          .map((segment) => {
            if (!segment) {
              return "";
            }
            const equalIndex = segment.indexOf("=");
            if (equalIndex === -1) {
              return transformValue(segment);
            }
            const key = segment.slice(0, equalIndex);
            const value = segment.slice(equalIndex + 1);
            return `${key}=${transformValue(value)}`;
          })
          .join("&");
      };

      const processed = processQuery(query);
      setError(null);
      if (hasQuery) {
        const rebuilt = processed ? `${base}?${processed}` : base ?? "";
        return `${rebuilt}${fragment}`;
      }
      if (looksLikeUrl) {
        return `${withoutFragment}${fragment}`;
      }
      return `${processed}${fragment}`;
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "转换失败，请检查输入格式。"
      );
      return "";
    }
  }, [input, mode, usePlus]);

  const handleCopy = async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "复制失败，请稍后重试。");
    }
  };

  const emptyMessage = mode === "encode" ? "输入原始文本后将显示编码结果。" : "输入已编码 URL 后将显示解码结果。";

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">URL</span>
          <h3 className={PANEL_TITLE}>{mode === "encode" ? "URL 编码" : "URL 解码"}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shellOptions.map((option) => (
            <motion.button
              key={option.value}
              type="button"
              className={clsx(BUTTON_TOGGLE, mode === option.value && BUTTON_TOGGLE_ACTIVE)}
              onClick={() => setMode(option.value)}
              whileTap={{ scale: 0.95 }}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
      </header>

      <div className={clsx(PANEL_GRID, "min-h-0")}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>{mode === "encode" ? "原始内容" : "编码内容"}</label>
          <textarea
            className="scroll-area min-h-[160px] resize-none rounded-md border border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            spellCheck={false}
            placeholder={mode === "encode" ? "请输入原始文本" : "请输入已编码的 URL"}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <div className={clsx(PANEL_BLOCK, "min-h-0 space-y-3")}>
          <label className={PANEL_LABEL}>{mode === "encode" ? "URL 编码结果" : "URL 解码结果"}</label>
          <div className={clsx(PANEL_RESULT, !output && PANEL_MUTED)}>{output || emptyMessage}</div>
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

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={usePlus}
            onChange={(event) => setUsePlus(event.target.checked)}
            disabled={mode === "decode"}
            className="h-4 w-4 rounded border border-[color:var(--border-subtle)] text-[var(--accent)] focus:ring-[var(--accent)]"
          />
          空格替换为 +
        </label>
        <span
          className={clsx("text-sm font-medium", error ? "text-[var(--negative)]" : "text-[var(--text-tertiary)]")}
        >
          {error ? `错误：${error}` : `字符 ${input.length} · 输出 ${output.length}`}
        </span>
      </div>
    </div>
  );
}
