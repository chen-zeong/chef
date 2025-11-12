import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

type ParseMode = "pretty" | "compact";

type ParserOptions = {
  allowSingleQuotes: boolean;
  stripSlashes: boolean;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const placeholderExample = '{ "name": "Chef", "active": true }';

const DEFAULT_OPTIONS: ParserOptions = {
  allowSingleQuotes: true,
  stripSlashes: true
};

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.35)]";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 hover:border-[rgba(15,23,42,0.2)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.2)] disabled:cursor-not-allowed disabled:opacity-50";

export function JsonParser() {
  const [input, setInput] = useState<string>("");
  const [formatted, setFormatted] = useState<string>("");
  const [previewValue, setPreviewValue] = useState<JsonValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<string[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchPanelRef = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const matchedPathSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  const activeMatchPath = searchMatches.length ? searchMatches[activeMatchIndex] : null;

  const handleTransform = useCallback(
    (mode: ParseMode) => {
      try {
        const parsed = parseWithRelaxedRules(input, DEFAULT_OPTIONS);
        const nextText = formatJson(parsed, mode);
        setFormatted(nextText);
        setPreviewValue(parsed);
        setError(null);
        setCollapsedPaths({});
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : "解析失败，请检查输入。");
      }
    },
    [input]
  );

  const handleCopy = useCallback(async () => {
    const payload = formatted || input;
    if (!payload.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
    } catch (clipError) {
      setError(clipError instanceof Error ? clipError.message : "复制失败，请检查系统权限。");
    }
  }, [formatted, input]);

  const handleClear = useCallback(() => {
    setInput("");
    setFormatted("");
    setPreviewValue(null);
    setError(null);
    setCollapsedPaths({});
  }, []);

  const handleToggleNode = useCallback((path: string, nextCollapsed: boolean) => {
    setCollapsedPaths((previous) => ({
      ...previous,
      [path]: nextCollapsed
    }));
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!previewValue) {
      return;
    }
    setCollapsedPaths(buildCollapseMap(previewValue, false));
  }, [previewValue]);

  useEffect(() => {
    if (!searchQuery.trim() || !previewValue) {
      setSearchMatches([]);
      setActiveMatchIndex(0);
      return;
    }
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matches = collectMatchingKeyPaths(previewValue, normalizedQuery);
    setSearchMatches(matches);
    setActiveMatchIndex(0);
  }, [previewValue, searchQuery]);

  const revealPath = useCallback((targetPath: string | null) => {
    if (!targetPath || targetPath === "$") {
      return;
    }
    setCollapsedPaths((previous) => {
      const next = { ...previous };
      const segments = targetPath.split(".").slice(1, -1);
      let current = "$";
      for (const segment of segments) {
        current = `${current}.${segment}`;
        next[current] = false;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (activeMatchPath) {
      revealPath(activeMatchPath);
    }
  }, [activeMatchPath, revealPath]);

  const handleSearchPrev = useCallback(() => {
    setActiveMatchIndex((previous) => {
      if (!searchMatches.length) {
        return 0;
      }
      return (previous - 1 + searchMatches.length) % searchMatches.length;
    });
  }, [searchMatches.length]);

  const handleSearchNext = useCallback(() => {
    setActiveMatchIndex((previous) => {
      if (!searchMatches.length) {
        return 0;
      }
      return (previous + 1) % searchMatches.length;
    });
  }, [searchMatches.length]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchPanelRef.current && searchPanelRef.current.contains(target)) {
        return;
      }
      if (searchButtonRef.current && searchButtonRef.current.contains(target)) {
        return;
      }
      setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  return (
    <div className="json-parser flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-2xl bg-[var(--panel-bg)] px-5 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[var(--text-tertiary)]">
            JSON
          </p>
          <h3 className="text-xl font-semibold text-[var(--text-primary)]">结构化编辑</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => handleTransform("pretty")}
            disabled={!input}
          >
            格式化
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={handleClear}
            disabled={!input}
          >
            清空
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={handleCopy}
            disabled={!formatted && !input}
          >
            {copied ? "已复制" : "复制结果"}
          </button>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-hidden md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <section className="flex min-h-0 flex-1 flex-col gap-3 px-1">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-12 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            <span>原始文本</span>
          </div>
          {error && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#b42318]">
              {error}
            </div>
          )}
          <textarea
            className="scroll-area flex-1 resize-none rounded-md bg-[var(--surface-alt-bg)] px-4 py-3 font-['JetBrains_Mono','SFMono-Regular',Menlo,monospace] text-[0.95rem] leading-[1.7] tracking-[0.01em] text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-[var(--accent)]/25 focus-visible:outline-none whitespace-pre-wrap break-words"
            spellCheck={false}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            placeholder={placeholderExample}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col gap-3 px-1">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-0 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            <span>格式化结果</span>
            <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
              <button
                type="button"
                className="rounded-md border border-[color:var(--border-subtle)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-alt-bg)] hover:text-[var(--accent)]"
                onClick={handleExpandAll}
                disabled={!previewValue}
              >
                全部展开
              </button>
              <button
                type="button"
                className="rounded-md border border-[color:var(--border-subtle)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-alt-bg)] hover:text-[var(--accent)]"
                onClick={() => handleTransform("compact")}
                disabled={!input}
              >
                全部折叠
              </button>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden rounded-md bg-[var(--surface-alt-bg)] px-4 py-3">
            <button
              type="button"
              ref={searchButtonRef}
              className="absolute right-4 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
              onClick={() => setIsSearchOpen((previous) => !previous)}
              aria-label="搜索字段"
              disabled={!previewValue}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.2" y1="13.2" x2="17" y2="17" strokeLinecap="round" />
              </svg>
            </button>
            {isSearchOpen && (
              <div
                ref={searchPanelRef}
                className="absolute right-4 top-14 z-10 w-64 rounded-xl border border-[color:var(--border-subtle)] bg-white/95 p-3 text-sm text-[var(--text-primary)] shadow-lg backdrop-blur"
              >
                <input
                  type="text"
                  className="w-full rounded-lg border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSearchNext();
                    }
                  }}
                  placeholder="搜索字段名"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-[0.75rem] text-[var(--text-secondary)]">
                  <span>
                    {searchMatches.length ? `${activeMatchIndex + 1}/${searchMatches.length}` : "无匹配"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                      onClick={handleSearchPrev}
                      disabled={!searchMatches.length}
                      aria-label="上一个匹配"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                      onClick={handleSearchNext}
                      disabled={!searchMatches.length}
                      aria-label="下一个匹配"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="scroll-area h-full overflow-auto pr-4 -mr-4">
              {previewValue ? (
                <JsonTreeView
                  value={previewValue}
                  collapsed={collapsedPaths}
                  onToggle={handleToggleNode}
                  matchedPaths={matchedPathSet}
                  activeMatchPath={activeMatchPath}
                />
              ) : (
                <div className="text-sm text-[var(--text-tertiary)]">点击“格式化”或“载入示例”生成最新结果。</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatJson(value: JsonValue, mode: ParseMode): string {
  return mode === "pretty" ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function parseWithRelaxedRules(raw: string, options: ParserOptions): JsonValue {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("请输入 JSON 内容。");
  }
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch (primaryError) {
    const normalized = preprocessInput(trimmed, options);
    if (normalized !== trimmed) {
      return JSON.parse(normalized) as JsonValue;
    }
    throw primaryError;
  }
}

function preprocessInput(raw: string, options: ParserOptions): string {
  let text = raw.replace(/,\s*([}\]])/g, "$1");

  if (options.stripSlashes) {
    text = text.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  }

  if (options.allowSingleQuotes) {
    text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) =>
      `"${inner.replace(/"/g, '\\"')}"`
    );
  }

  return text;
}

type JsonTreeViewProps = {
  value: JsonValue;
  collapsed: Record<string, boolean>;
  onToggle: (path: string, nextCollapsed: boolean) => void;
  matchedPaths: Set<string>;
  activeMatchPath: string | null;
};

function JsonTreeView({ value, collapsed, onToggle, matchedPaths, activeMatchPath }: JsonTreeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeMatchPath || !containerRef.current) {
      return;
    }
    const selector = `[data-path="${activeMatchPath.replace(/"/g, '\\"')}"]`;
    const target = containerRef.current.querySelector<HTMLElement>(selector);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeMatchPath]);

  return (
    <div
      ref={containerRef}
      className="font-mono text-[0.85rem] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words"
    >
      <JsonNode
        value={value}
        path="$"
        depth={0}
        isLast
        parentType={null}
        collapsed={collapsed}
        onToggle={onToggle}
        matchedPaths={matchedPaths}
        activeMatchPath={activeMatchPath}
      />
    </div>
  );
}

type JsonNodeProps = {
  value: JsonValue;
  name?: string | number;
  depth: number;
  path: string;
  isLast: boolean;
  parentType: "array" | "object" | null;
  collapsed: Record<string, boolean>;
  onToggle: (path: string, nextCollapsed: boolean) => void;
  matchedPaths: Set<string>;
  activeMatchPath: string | null;
};

function JsonNode({
  value,
  name,
  depth,
  path,
  isLast,
  parentType,
  collapsed,
  onToggle,
  matchedPaths,
  activeMatchPath
}: JsonNodeProps) {
  const isCollection = value !== null && typeof value === "object";
  const indent = depth * 18;
  const isMatched = matchedPaths.has(path);
  const isActiveMatch = activeMatchPath === path;

  const keyClass = clsx(
    "font-semibold text-[#2563eb]",
    isMatched && "text-[#1d4ed8]",
    isActiveMatch && "rounded-sm bg-[#dbeafe] px-1"
  );
  const valueClass = clsx(
    "font-medium",
    getValueTone(value),
    isActiveMatch && "rounded-sm bg-[#ecfeff] px-1"
  );

  if (!isCollection) {
    return (
      <div className="leading-[1.55]" style={{ paddingLeft: indent }} data-path={path}>
        {parentType !== "array" && typeof name !== "undefined" && (
          <>
            <span className={keyClass}>"{String(name)}"</span>
            <span className="text-[#94a3b8]">: </span>
          </>
        )}
        <span className={valueClass}>
          {formatPrimitive(value)}
        </span>
        {!isLast && <span className="text-[var(--text-secondary)]">,</span>}
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map<[string, JsonValue]>((item, index) => [String(index), item])
    : Object.entries(value);
  const openingSymbol = Array.isArray(value) ? "[" : "{";
  const closingSymbol = Array.isArray(value) ? "]" : "}";
  const defaultCollapsed = depth >= 2;
  const isCollapsed = collapsed[path] ?? defaultCollapsed;
  const toggleButtonClass =
    "inline-flex h-5 w-5 items-center justify-center rounded-md border border-[color:var(--border-subtle)] bg-white text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/15";
  const bracketClass = "text-[#94a3b8]";
  const countBadgeClass =
    "ml-2 inline-flex min-w-[26px] items-center justify-center rounded-sm bg-[#e0f2fe] px-2 py-[1px] text-[0.65rem] font-semibold text-[#0369a1]";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 leading-[1.55]" style={{ paddingLeft: indent }} data-path={path}>
        <button
          type="button"
          className={toggleButtonClass}
          onClick={() => onToggle(path, !isCollapsed)}
          aria-label={isCollapsed ? "展开" : "折叠"}
        >
          {isCollapsed ? "＋" : "－"}
        </button>
        {parentType !== "array" && typeof name !== "undefined" && (
          <>
            <span className={keyClass}>"{String(name)}"</span>
            <span className="text-[#94a3b8]">: </span>
          </>
        )}
        <span className={bracketClass}>{openingSymbol}</span>
        {Array.isArray(value) && (
          <span className={countBadgeClass}>{entries.length}</span>
        )}
        {isCollapsed && (
          <>
            <span className="text-[var(--text-tertiary)]"> … </span>
            <span className="text-[var(--text-secondary)]">
              {closingSymbol}
              {!isLast && ","}
            </span>
          </>
        )}
      </div>
      {!isCollapsed && (
        <>
          {entries.map(([childKey, childValue], index) => (
            <JsonNode
              key={`${path}.${childKey}`}
              name={Array.isArray(value) ? undefined : childKey}
              value={childValue}
              depth={depth + 1}
              path={`${path}.${childKey}`}
              isLast={index === entries.length - 1}
              parentType={Array.isArray(value) ? "array" : "object"}
              collapsed={collapsed}
              onToggle={onToggle}
              matchedPaths={matchedPaths}
              activeMatchPath={activeMatchPath}
            />
          ))}
          <div className="leading-[1.55]" style={{ paddingLeft: indent }} data-path={`${path}.__closing`}>
            <span className={bracketClass}>{closingSymbol}</span>
            {!isLast && <span className="text-[var(--text-secondary)]">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

function buildCollapseMap(value: JsonValue, collapsed: boolean, path = "$", acc: Record<string, boolean> = {}): Record<string, boolean> {
  if (value === null || typeof value !== "object") {
    return acc;
  }
  acc[path] = collapsed;
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as [string, JsonValue])
    : Object.entries(value);
  for (const [key, child] of entries) {
    const childPath = `${path}.${key}`;
    if (child !== null && typeof child === "object") {
      buildCollapseMap(child, collapsed, childPath, acc);
    }
  }
  return acc;
}

function formatPrimitive(value: JsonValue): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  return String(value);
}

function getValueTone(value: JsonValue): string {
  if (value === null) {
    return "text-[#94a3b8]";
  }
  switch (typeof value) {
    case "string":
      return "text-[#0ea5e9]";
    case "number":
      return "text-[#f97316]";
    case "boolean":
      return "text-[#22c55e]";
    default:
      return "text-[#475569]";
  }
}

function collectMatchingKeyPaths(value: JsonValue, query: string, path = "$", acc: string[] = []): string[] {
  if (value === null || typeof value !== "object") {
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      const childPath = `${path}.${index}`;
      collectMatchingKeyPaths(child, query, childPath, acc);
    });
    return acc;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key.toLowerCase().includes(query)) {
      acc.push(childPath);
    }
    collectMatchingKeyPaths(child, query, childPath, acc);
  }
  return acc;
}
