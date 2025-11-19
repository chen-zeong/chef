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
    <div className="flex h-full min-h-0 flex-col gap-4 text-sm text-zinc-600 dark:text-zinc-300">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/70 pb-3 dark:border-zinc-800/70">
          <div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">JSON 格式化</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">输入 JSON 字符串并一键格式化或压缩。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => handleTransform("pretty")}
              disabled={!input}
            >
              格式化
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/70 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-orange-200 hover:text-orange-600 dark:border-zinc-700/70 dark:text-zinc-200"
              onClick={handleCopy}
              disabled={!formatted && !input}
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>

      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>原始 JSON</span>
            <button
              type="button"
              className="rounded-full border border-zinc-200/70 px-3 py-1 text-[11px] text-zinc-500 hover:border-orange-200 hover:text-orange-500 dark:border-zinc-700/70 dark:text-zinc-300"
              onClick={handleClear}
              disabled={!input}
            >
              清空
            </button>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
          <textarea
            className="scroll-area flex-1 min-h-0 w-full resize-none rounded-xl border border-zinc-200/70 bg-white/70 px-4 py-3 font-['JetBrains_Mono','SFMono-Regular',Menlo,monospace] text-sm text-zinc-900 outline-none focus:border-orange-200 focus-visible:ring-2 focus-visible:ring-orange-500/20 dark:border-zinc-700/70 dark:bg-zinc-900/40 dark:text-zinc-100"
            spellCheck={false}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            placeholder={placeholderExample}
          />
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>格式化结果</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-zinc-200/70 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:border-orange-200 hover:text-orange-600 dark:border-zinc-700/70 dark:text-zinc-300"
                onClick={handleExpandAll}
                disabled={!previewValue}
              >
                展开全部
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200/70 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:border-orange-200 hover:text-orange-600 dark:border-zinc-700/70 dark:text-zinc-300"
                onClick={() => handleTransform("compact")}
                disabled={!input}
              >
                压缩文本
              </button>
            </div>
          </div>
          <div className="relative flex-1 min-h-0">
            <button
              type="button"
              ref={searchButtonRef}
              className="absolute right-3 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200/70 bg-white text-zinc-500 shadow-sm hover:border-orange-200 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700/70 dark:bg-zinc-900/60 dark:text-zinc-300"
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
                className="absolute right-0 top-12 z-20 w-60 rounded-xl border border-zinc-200/70 bg-white p-3 text-sm text-zinc-700 shadow-lg dark:border-zinc-700/70 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <input
                  type="text"
                  className="w-full rounded-lg border border-zinc-200/70 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-orange-300 dark:border-zinc-700/70 dark:bg-zinc-900/60 dark:text-zinc-100"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSearchNext();
                    }
                  }}
                  placeholder="字段名 / key"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
                  <span>{searchMatches.length ? `${activeMatchIndex + 1}/${searchMatches.length}` : "无匹配"}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/70 text-zinc-500 hover:border-orange-200 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700/70 dark:text-zinc-200"
                      onClick={handleSearchPrev}
                      disabled={!searchMatches.length}
                      aria-label="上一个匹配"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/70 text-zinc-500 hover:border-orange-200 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700/70 dark:text-zinc-200"
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
            <div className="scroll-area h-full overflow-auto rounded-xl border border-zinc-200/70 bg-white/70 p-4 pr-6 dark:border-zinc-700/70 dark:bg-zinc-900/40">
              {previewValue ? (
                <JsonTreeViewer
                  value={previewValue}
                  collapsed={collapsedPaths}
                  onToggle={handleToggleNode}
                  matchedPaths={matchedPathSet}
                  activeMatchPath={activeMatchPath}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
                  点击“格式化”即可查看结果。
                </div>
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

type JsonTreeViewerProps = {
  value: JsonValue;
  collapsed: Record<string, boolean>;
  onToggle: (path: string, nextCollapsed: boolean) => void;
  matchedPaths: Set<string>;
  activeMatchPath: string | null;
};

function JsonTreeViewer({ value, collapsed, onToggle, matchedPaths, activeMatchPath }: JsonTreeViewerProps) {
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
      className="font-mono text-sm leading-relaxed text-zinc-700 dark:text-zinc-100"
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
    "font-semibold text-sky-500",
    isMatched && "text-sky-400",
    isActiveMatch && "rounded-md bg-sky-500/10 px-1 py-0.5 text-sky-300"
  );
  const valueClass = clsx(
    "font-medium",
    getValueTone(value),
    isActiveMatch && "rounded-md bg-orange-500/10 px-1 py-0.5"
  );

  if (!isCollection) {
    return (
      <div className="leading-[1.55]" style={{ paddingLeft: indent }} data-path={path}>
        {parentType !== "array" && typeof name !== "undefined" && (
          <>
            <span className={keyClass}>"{String(name)}"</span>
            <span className="text-zinc-400 dark:text-zinc-500">: </span>
          </>
        )}
        <span className={valueClass}>{formatPrimitive(value)}</span>
        {!isLast && <span className="text-zinc-400 dark:text-zinc-500">,</span>}
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
    "inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200/80 bg-white/80 text-[11px] font-semibold text-zinc-400 transition hover:border-orange-200 hover:text-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-300";
  const bracketClass = "text-zinc-400 dark:text-zinc-500";
  const countBadgeClass =
    "ml-2 inline-flex min-w-[26px] items-center justify-center rounded-full bg-sky-500/10 px-2 py-[1px] text-[0.65rem] font-semibold text-sky-500";

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
            <span className="text-zinc-400 dark:text-zinc-500">: </span>
          </>
        )}
        <span className={bracketClass}>{openingSymbol}</span>
        {Array.isArray(value) && <span className={countBadgeClass}>{entries.length}</span>}
        {isCollapsed && (
          <>
            <span className="text-zinc-400 dark:text-zinc-600"> … </span>
            <span className="text-zinc-400 dark:text-zinc-500">
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
            {!isLast && <span className="text-zinc-400 dark:text-zinc-500">,</span>}
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
    return "text-zinc-400";
  }
  switch (typeof value) {
    case "string":
      return "text-emerald-500";
    case "number":
      return "text-orange-400";
    case "boolean":
      return "text-blue-500";
    default:
      return "text-zinc-500";
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
