import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  PANEL_CONTAINER,
  PANEL_HEADER,
  PANEL_TEXTAREA,
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

  const output = useMemo(() => {
    if (!input) {
      setError(null);
      return "";
    }
    try {
      const trimmed = input.trim();
      const result =
        mode === "encode"
          ? encodeURIComponent(trimmed)
          : decodeURIComponent(trimmed.replace(/\+/g, " "));
      setError(null);
      return mode === "encode" && usePlus ? result.replace(/%20/g, "+") : result;
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "转换失败，请检查输入格式。"
      );
      return "";
    }
  }, [input, mode, usePlus]);

  const handleSwap = () => {
    setMode((prev) => (prev === "encode" ? "decode" : "encode"));
    if (output) {
      setInput(output);
    }
  };

  return (
    <div className={PANEL_CONTAINER}>
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
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.94 }}
            onClick={handleSwap}
          >
            对调输入与输出
          </motion.button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <textarea
          className={PANEL_TEXTAREA}
          spellCheck={false}
          placeholder={mode === "encode" ? "请输入原始文本" : "请输入已编码的 URL"}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <textarea
          className={clsx(PANEL_TEXTAREA, "bg-[var(--surface-alt-bg)] text-[var(--text-tertiary)]")}
          spellCheck={false}
          value={output}
          readOnly
          placeholder="结果将显示在这里"
        />
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
