import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, type Transition } from "framer-motion";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";

type ParseMode = "pretty" | "compact";

type ParserOptions = {
  allowSingleQuotes: boolean;
  stripSlashes: boolean;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const sampleJson = `{
  "name": "Chef Toolbox",
  "modules": [
    { "id": "json-parser", "title": "JSON 解析器" },
    { "id": "md5", "title": "MD5 摘要" }
  ],
  "active": true,
  "meta": { "createdAt": "2025-10-16T07:00:00Z" }
}`;

const animationTransition: Transition = { type: "spring", stiffness: 260, damping: 26 };

export function JsonParser() {
  const initialPretty = formatJson(JSON.parse(sampleJson) as JsonValue, "pretty");
  const [input, setInput] = useState<string>(initialPretty);
  const [mode, setMode] = useState<ParseMode>("pretty");
  const [timestamp, setTimestamp] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [options, setOptions] = useState<ParserOptions>({
    allowSingleQuotes: false,
    stripSlashes: false
  });

  const liveParsed = useMemo<JsonValue | null>(() => {
    try {
      return parseWithOptions(input, options);
    } catch {
      return null;
    }
  }, [input, options]);

  const statusLabel = useMemo(() => {
    if (error) {
      return "解析失败";
    }
    return mode === "pretty" ? "已格式化" : "已压缩";
  }, [error, mode]);

  const handleFormat = useCallback(
    (nextMode: ParseMode) => {
      try {
        const parsed = parseWithOptions(input, options);
        const nextText = formatJson(parsed, nextMode);
        setInput(nextText);
        setMode(nextMode);
        setTimestamp(Date.now());
        setError(null);
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : String(parseError));
      }
    },
    [input, options]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(input);
      setIsCopied(true);
    } catch (clipError) {
      setError(
        clipError instanceof Error ? clipError.message : "复制失败，请检查系统权限。"
      );
    }
  }, [input]);

  const handleReset = useCallback(() => {
    const parsed = JSON.parse(sampleJson) as JsonValue;
    const pretty = formatJson(parsed, "pretty");
    setInput(pretty);
    setMode("pretty");
    setTimestamp(Date.now());
    setError(null);
  }, []);

  const toggleOption = useCallback((key: keyof ParserOptions) => {
    setOptions((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = window.setTimeout(() => setIsCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  return (
    <div className="parser">
      <div className="parser__surface">
        <header className="parser__header">
          <div className="parser__title">
            <span className="parser__eyebrow">JSON</span>
            <h3>编辑器</h3>
          </div>
          <div className="parser__buttons">
            <motion.button
              type="button"
              className={clsx("parser__action", { "parser__action--active": mode === "pretty" })}
              whileTap={{ scale: 0.96 }}
              transition={animationTransition}
              onClick={() => handleFormat("pretty")}
            >
              格式化
            </motion.button>
            <motion.button
              type="button"
              className={clsx("parser__action", { "parser__action--active": mode === "compact" })}
              whileTap={{ scale: 0.96 }}
              transition={animationTransition}
              onClick={() => handleFormat("compact")}
            >
              压缩
            </motion.button>
            <motion.button
              type="button"
              className="parser__action parser__action--ghost"
              whileTap={{ scale: 0.96 }}
              transition={animationTransition}
              onClick={handleCopy}
            >
              {isCopied ? "已复制" : "复制"}
            </motion.button>
            <motion.button
              type="button"
              className="parser__action parser__action--ghost"
              whileTap={{ scale: 0.96 }}
              transition={animationTransition}
              onClick={handleReset}
            >
              重置示例
            </motion.button>
          </div>
        </header>

        <div className="parser__toggles">
          <button
            type="button"
            className={clsx("parser__toggle", { "parser__toggle--active": options.allowSingleQuotes })}
            onClick={() => toggleOption("allowSingleQuotes")}
          >
            单引号容错
          </button>
          <button
            type="button"
            className={clsx("parser__toggle", { "parser__toggle--active": options.stripSlashes })}
            onClick={() => toggleOption("stripSlashes")}
          >
            自动去转义
          </button>
        </div>

        <textarea
          className="parser__textarea"
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='例如: { "name": "Chef" }'
        />

        <div className="parser__status">
          <motion.span
            className={clsx("parser__status-dot", { "parser__status-dot--error": !!error })}
            animate={{ scale: error ? [1, 1.25, 1] : [0.96, 1.04, 0.96] }}
            transition={{ repeat: Infinity, duration: error ? 1.6 : 2.4 }}
          />
          <span className="parser__status-text">
            {error ?? `${statusLabel} · ${new Date(timestamp).toLocaleTimeString()}`}
          </span>
        </div>

        <div className="parser__quick-stats">
          <span>字符 {input.length}</span>
          {liveParsed && <span>节点 {countNodes(liveParsed)}</span>}
        </div>

        {liveParsed && !error && (
          <div className="parser__tree">
            <div className="parser__tree-header">折叠视图</div>
            <div className="parser__tree-body">
              <JsonTree data={liveParsed} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatJson(value: JsonValue, mode: ParseMode): string {
  return mode === "pretty" ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function parseWithOptions(raw: string, options: ParserOptions): JsonValue {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch (primaryError) {
    const normalized = preprocessInput(trimmed, options);
    if (normalized !== trimmed) {
      try {
        return JSON.parse(normalized) as JsonValue;
      } catch (secondaryError) {
        throw secondaryError;
      }
    }
    throw primaryError;
  }
}

function preprocessInput(raw: string, options: ParserOptions): string {
  let text = raw;
  // Remove trailing commas
  text = text.replace(/,\s*([}\]])/g, "$1");

  if (options.stripSlashes) {
    text = text.replace(/\\+"/g, "\"");
    text = text.replace(/\\\\/g, "\\");
    text = text.replace(/\\'/g, "'");
  }

  if (options.allowSingleQuotes) {
    text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) =>
      `"${inner.replace(/"/g, '\\"')}"`
    );
  }

  return text;
}

function countNodes(value: JsonValue): number {
  if (value === null || typeof value !== "object") {
    return 1;
  }
  let total = 1;
  if (Array.isArray(value)) {
    for (const item of value) {
      total += countNodes(item);
    }
    return total;
  }
  for (const item of Object.values(value)) {
    total += countNodes(item);
  }
  return total;
}

type JsonTreeProps = {
  data: JsonValue;
};

function JsonTree({ data }: JsonTreeProps) {
  return (
    <div className="json-tree">
      <JsonNode value={data} path="$" depth={0} />
    </div>
  );
}

type JsonNodeProps = {
  value: JsonValue;
  name?: string | number;
  depth: number;
  path: string;
};

function JsonNode({ value, name, depth, path }: JsonNodeProps) {
  const isObject = value !== null && typeof value === "object";

  if (!isObject) {
    return (
      <div className="json-tree__item">
        {typeof name !== "undefined" && <span className="json-tree__key">{String(name)}</span>}
        <span className={clsx("json-tree__value", `json-tree__value--${typeof value}`)}>
          {formatPrimitive(value)}
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map<[number, JsonValue]>((item, index) => [index, item])
    : Object.entries(value);

  const label =
    typeof name === "undefined" ? "根节点" : `${Array.isArray(value) ? "数组" : "对象"}`;
  const meta = Array.isArray(value) ? `${entries.length} 项` : `${entries.length} 个字段`;
  const [collapsed, setCollapsed] = useState<boolean>(() => depth >= 1);

  return (
    <div className="json-tree__group">
      <button
        type="button"
        className="json-tree__toggle"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <span className="json-tree__chevron">
          {collapsed ? <ChevronRight size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
        </span>
        {typeof name !== "undefined" && <span className="json-tree__key">{String(name)}</span>}
        <span className="json-tree__label">{label}</span>
        <span className="json-tree__meta">{meta}</span>
      </button>
      {!collapsed && (
        <div className="json-tree__children">
          {entries.map(([childKey, childValue]) => (
            <JsonNode
              key={`${path}.${String(childKey)}`}
              name={childKey}
              value={childValue}
              depth={depth + 1}
              path={`${path}.${String(childKey)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatPrimitive(value: JsonValue): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  return String(value);
}
