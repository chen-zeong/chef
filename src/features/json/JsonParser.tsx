import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, type Transition } from "framer-motion";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  BUTTON_GHOST,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  CHIP_ACTIVE,
  CHIP_BASE,
  PANEL_CONTAINER,
  PANEL_HEADER,
  PANEL_TEXTAREA,
  PANEL_TITLE
} from "../../ui/styles";

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
    <div className={clsx(PANEL_CONTAINER, "gap-4")}> 
      <header className={clsx(PANEL_HEADER, "gap-4")}> 
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">JSON</span>
          <h3 className={PANEL_TITLE}>编辑器</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "pretty" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.96 }}
            transition={animationTransition}
            onClick={() => handleFormat("pretty")}
          >
            格式化
          </motion.button>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "compact" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.96 }}
            transition={animationTransition}
            onClick={() => handleFormat("compact")}
          >
            压缩
          </motion.button>
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.96 }}
            transition={animationTransition}
            onClick={handleCopy}
          >
            {isCopied ? "已复制" : "复制"}
          </motion.button>
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.96 }}
            transition={animationTransition}
            onClick={handleReset}
          >
            重置示例
          </motion.button>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={clsx(CHIP_BASE, options.allowSingleQuotes && CHIP_ACTIVE)}
            onClick={() => toggleOption("allowSingleQuotes")}
          >
            单引号容错
          </button>
          <button
            type="button"
            className={clsx(CHIP_BASE, options.stripSlashes && CHIP_ACTIVE)}
            onClick={() => toggleOption("stripSlashes")}
          >
            自动去转义
          </button>
        </div>

        <textarea
          className={clsx(PANEL_TEXTAREA, "min-h-[280px] font-mono text-sm")}
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='例如: { "name": "Chef" }'
        />

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-tertiary)]">
          <motion.span
            className={clsx(
              "flex items-center gap-2 text-sm font-medium",
              error ? "text-[var(--negative)]" : "text-[var(--accent)]"
            )}
            animate={{ opacity: error ? [1, 0.85, 1] : [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: error ? 1.6 : 2.4 }}
          >
            <span
              className={clsx(
                "inline-block h-2.5 w-2.5 rounded-full",
                error ? "bg-[var(--negative)]" : "bg-[var(--accent)]"
              )}
            />
            {error ?? `${statusLabel} · ${new Date(timestamp).toLocaleTimeString()}`}
          </motion.span>
          <span>字符 {input.length}</span>
          {liveParsed && <span>节点 {countNodes(liveParsed)}</span>}
        </div>

        {liveParsed && !error && (
          <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">折叠视图</span>
              <span className="text-xs text-[var(--text-tertiary)]">第二层以下节点默认折叠</span>
            </div>
            <div className="max-h-[320px] overflow-auto pr-2">
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
    <div className="space-y-2 text-sm text-[var(--text-secondary)]">
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
      <div className="flex items-start gap-2 pl-2">
        {typeof name !== "undefined" && (
          <span className="font-mono text-[var(--text-primary)]">{String(name)}:</span>
        )}
        <span className={clsx("font-mono", getValueTone(value))}>{formatPrimitive(value)}</span>
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
    <div className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:border-[rgba(37,99,235,0.2)] hover:bg-[var(--hover-bg)]"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)]">
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={1.8} className="text-[var(--icon-muted)]" />
          ) : (
            <ChevronDown size={14} strokeWidth={1.8} className="text-[var(--icon-muted)]" />
          )}
        </span>
        {typeof name !== "undefined" && (
          <span className="font-mono text-[var(--text-primary)]">{String(name)}</span>
        )}
        <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">{meta}</span>
      </button>
      {!collapsed && (
        <div className="space-y-2 border-l border-[color:var(--border-subtle)] pl-4">
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

function getValueTone(value: JsonValue): string {
  if (value === null) {
    return "text-[var(--text-tertiary)]";
  }
  switch (typeof value) {
    case "string":
      return "text-[var(--accent)]";
    case "number":
      return "text-[var(--accent-strong)]";
    case "boolean":
      return "text-[var(--accent)]";
    default:
      return "text-[var(--text-secondary)]";
  }
}
