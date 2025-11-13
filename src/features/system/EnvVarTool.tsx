import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { BUTTON_GHOST, BUTTON_PRIMARY, PANEL_MUTED, PANEL_RESULT } from "../../ui/styles";

type EnvSource = {
  source: string;
  entries: {
    key: string;
    value: string;
  }[];
};

type DisplayEntry = {
  source: string;
  key: string;
  value: string;
};

export function EnvVarTool() {
  const [sources, setSources] = useState<EnvSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<EnvSource[]>("read_environment_sources");
      setSources(result);
    } catch (requestError) {
      console.error(requestError);
      setError("读取环境变量失败，请确认已授权访问相关文件。");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch (copyError) {
      console.error(copyError);
    }
  };

  const { pairEntries, pathEntries } = useMemo(() => flattenEntries(sources), [sources]);
  const flattenedCount = pairEntries.length + pathEntries.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Environment</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">环境变量管理</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            仅供查看，来自系统/用户配置文件（{flattenedCount} 项）。
          </p>
        </div>
        <motion.button
          type="button"
          className={clsx(BUTTON_GHOST, "px-4 py-2 text-sm")}
          whileTap={{ scale: 0.95 }}
          onClick={fetchSources}
          disabled={loading}
        >
          {loading ? "读取中…" : "重新加载"}
        </motion.button>
      </header>

      <div className="flex-1 min-h-0">
        {error ? (
          <div className={clsx(PANEL_RESULT, "text-sm text-[var(--negative)]")}>{error}</div>
        ) : loading ? (
          <div className={clsx(PANEL_RESULT, PANEL_MUTED)}>正在读取环境变量，请稍候…</div>
        ) : sources.length === 0 ? (
          <div className={clsx(PANEL_RESULT, PANEL_MUTED)}>未发现可读取的配置文件。</div>
        ) : (
          <div className="scroll-area flex h-full flex-col gap-4 overflow-auto pr-3">
            <EnvSection
              title="键值变量"
              emptyText="没有可显示的键值对。"
              entries={pairEntries}
              copiedKey={copiedKey}
              onCopy={handleCopy}
            />
            <EnvSection
              title="路径变量"
              emptyText="没有可显示的路径变量。"
              entries={pathEntries}
              copiedKey={copiedKey}
              onCopy={handleCopy}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type EnvSectionProps = {
  title: string;
  emptyText: string;
  entries: DisplayEntry[];
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void;
};

function EnvSection({ title, emptyText, entries, copiedKey, onCopy }: EnvSectionProps) {
  if (entries.length === 0) {
    return (
      <section className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{title}</span>
          <span className="text-xs text-[var(--text-tertiary)]">0 项</span>
        </div>
        <div className={clsx(PANEL_RESULT, PANEL_MUTED, "mt-3")}>{emptyText}</div>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{title}</span>
        <span className="text-xs text-[var(--text-tertiary)]">{entries.length} 项</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {entries.map((entry) => {
          const entryKey = `${title}:${entry.source}:${entry.key}`;
          return (
            <div
              key={entryKey}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-mono uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                  {entry.key}
                </span>
                <span className="font-mono text-sm text-[var(--text-primary)] break-all">{entry.value}</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                  {entry.source}
                </span>
              </div>
              <motion.button
                type="button"
                className={clsx(BUTTON_PRIMARY, "px-3 py-1 text-xs")}
                whileTap={{ scale: entry.value ? 0.95 : 1 }}
                disabled={!entry.value}
                onClick={() => entry.value && onCopy(entry.value, entryKey)}
              >
                {copiedKey === entryKey ? "已复制" : "复制"}
              </motion.button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function flattenEntries(sources: EnvSource[]) {
  const pathEntries: DisplayEntry[] = [];
  const pairEntries: DisplayEntry[] = [];
  sources.forEach((source) => {
    source.entries.forEach((entry) => {
      const bucket = isPathValue(entry.key, entry.value) ? pathEntries : pairEntries;
      bucket.push({
        source: source.source,
        key: entry.key,
        value: entry.value,
      });
    });
  });
  return { pathEntries, pairEntries };
}

function isPathValue(key: string, value: string) {
  const keyUpper = key.toUpperCase();
  if (
    keyUpper === "PATH" ||
    keyUpper.endsWith("_PATH") ||
    keyUpper.endsWith("_DIR") ||
    keyUpper.includes("PATH") ||
    keyUpper.includes("DIR")
  ) {
    return true;
  }
  if (!value) {
    return false;
  }
  return valueLooksLikePath(value);
}

function valueLooksLikePath(rawValue: string) {
  if (!rawValue) {
    return false;
  }
  const normalized = rawValue
    .trim()
    .replace(/^\s*(eval|source)\s+/i, "")
    .replace(/^\s*\.\s+/, "")
    .replace(/\$\((.*?)\)/g, " $1 ")
    .replace(/\$\{?HOME\}?/gi, "~/")
    .replace(/["']/g, "");

  const tokens = normalized
    .split(/[\s:;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.some((token) => isPathToken(token) && !looksLikeUrl(token))) {
    return true;
  }
  if ((normalized.includes("/") || normalized.includes("\\")) && !looksLikeUrl(normalized)) {
    return true;
  }
  return false;
}

function isPathToken(token: string) {
  if (!token) {
    return false;
  }
  if (
    token.startsWith("/") ||
    token.startsWith("./") ||
    token.startsWith("../") ||
    token.startsWith("~") ||
    token.startsWith("$HOME") ||
    token.startsWith("%") ||
    /^[A-Za-z]:/.test(token) ||
    token.includes("\\")
  ) {
    return true;
  }
  return false;
}

function looksLikeUrl(token: string) {
  if (!token) {
    return false;
  }
  const lower = token.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("ssh://");
}
