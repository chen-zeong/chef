import { useMemo, useState } from "react";
import { motion, type Transition } from "framer-motion";
import clsx from "clsx";

type ParseMode = "pretty" | "compact";

const sampleJson = `{
  "name": "Chef Toolbox",
  "modules": [
    { "id": "json-parser", "title": "JSON 解析器" },
    { "id": "md5", "title": "MD5 摘要" }
  ],
  "active": true,
  "meta": { "createdAt": "2025-10-16T07:00:00Z" }
}`;

type ParseResult = {
  mode: ParseMode;
  value: string;
  timestamp: number;
};

const animationTransition: Transition = { type: "spring", stiffness: 260, damping: 26 };

export function JsonParser() {
  const [input, setInput] = useState<string>(sampleJson);
  const [result, setResult] = useState<ParseResult>(() => ({
    mode: "pretty",
    value: prettify(sampleJson),
    timestamp: Date.now()
  }));
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const statusLabel = useMemo(() => {
    if (error) {
      return "解析失败";
    }
    return result.mode === "pretty" ? "已格式化" : "已压缩";
  }, [error, result]);

  const handleParse = (mode: ParseMode) => {
    try {
      const parsed = JSON.parse(input);
      const nextValue = mode === "pretty" ? prettify(parsed) : compact(parsed);
      setResult({
        mode,
        value: nextValue,
        timestamp: Date.now()
      });
      setError(null);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.value);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1800);
    } catch (clipError) {
      setError(
        clipError instanceof Error
          ? clipError.message
          : "复制失败，请检查系统权限。"
      );
    }
  };

  return (
    <div className="parser">
      <div className="parser__columns">
        <div className="parser__column">
          <header className="parser__column-header">
            <div>
              <span className="parser__eyebrow">原始 JSON</span>
              <h3>输入</h3>
            </div>
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              className="btn btn--ghost"
              onClick={() => setInput(prettify(sampleJson))}
            >
              重置示例
            </motion.button>
          </header>
          <textarea
            className="parser__textarea"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder='例如: { "name": "Chef" }'
          />
        </div>

        <div className="parser__column">
          <header className="parser__column-header">
            <div>
              <span className="parser__eyebrow">解析结果</span>
              <h3>输出</h3>
            </div>
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              className="btn btn--ghost"
              onClick={handleCopy}
            >
              {isCopied ? "已复制" : "复制"}
            </motion.button>
          </header>
          <textarea
            className="parser__textarea parser__textarea--output"
            spellCheck={false}
            value={result.value}
            readOnly
          />
        </div>
      </div>

      <div className="parser__actions">
        <div className="parser__status">
          <motion.span
            className={clsx("parser__status-dot", { "parser__status-dot--error": !!error })}
            animate={{ scale: error ? [1, 1.25, 1] : [0.96, 1.04, 0.96] }}
            transition={{ repeat: Infinity, duration: error ? 1.6 : 2.4 }}
          />
          <span className="parser__status-text">
            {error ?? `${statusLabel} · ${new Date(result.timestamp).toLocaleTimeString()}`}
          </span>
        </div>
        <div className="parser__buttons">
          <motion.button
            type="button"
            className={clsx("btn", { "btn--primary": result.mode === "pretty" })}
            whileTap={{ scale: 0.96 }}
            transition={animationTransition}
            onClick={() => handleParse("pretty")}
          >
            格式化
          </motion.button>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--primary": result.mode === "compact" })}
            whileTap={{ scale: 0.96 }}
            transition={animationTransition}
            onClick={() => handleParse("compact")}
          >
            压缩
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function prettify(value: unknown): string {
  try {
    if (typeof value === "string") {
      return JSON.stringify(JSON.parse(value), null, 2);
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function compact(value: unknown): string {
  try {
    if (typeof value === "string") {
      return JSON.stringify(JSON.parse(value));
    }
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
