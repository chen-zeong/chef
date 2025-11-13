import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { BUTTON_GHOST, BUTTON_PRIMARY, PANEL_MUTED, PANEL_RESULT } from "../../ui/styles";

type HostEntry = {
  ip: string;
  domains: string[];
  comment: string | null;
  enabled: boolean;
};

type HostFilePayload = {
  source: string;
  entries: HostEntry[];
};

export function HostsTool() {
  const [data, setData] = useState<HostFilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLine, setCopiedLine] = useState<string | null>(null);

  useEffect(() => {
    fetchHosts();
  }, []);

  const fetchHosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<HostFilePayload>("read_hosts_file");
      setData(result);
    } catch (requestError) {
      console.error(requestError);
      setError("无法读取系统 hosts 文件，请确认已授权访问。");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLine = async (line: string, key: string) => {
    try {
      await navigator.clipboard.writeText(line);
      setCopiedLine(key);
      window.setTimeout(() => setCopiedLine((current) => (current === key ? null : current)), 1500);
    } catch (copyError) {
      console.error(copyError);
    }
  };

  const entries = data?.entries ?? [];
  const enabledCount = useMemo(() => entries.filter((entry) => entry.enabled).length, [entries]);

  const formatLine = (entry: HostEntry) => {
    let base = `${entry.ip} ${entry.domains.join(" ")}`;
    if (entry.comment && entry.comment.trim()) {
      base += ` # ${entry.comment.trim()}`;
    }
    return entry.enabled ? base : `# ${base}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Hosts</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Host 管理</h3>
          {entries.length > 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              启用 {enabledCount} / 总计 {entries.length}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className={clsx(BUTTON_GHOST, "px-4 py-2 text-sm")}
            whileTap={{ scale: 0.95 }}
            onClick={fetchHosts}
            disabled={loading}
          >
            {loading ? "读取中…" : "重新加载"}
          </motion.button>
          {entries.length > 0 && (
            <motion.button
              type="button"
              className={clsx(BUTTON_PRIMARY, "px-4 py-2 text-sm")}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigator.clipboard.writeText(entries.map((entry) => formatLine(entry)).join("\n"))}
            >
              复制全部
            </motion.button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0">
        {error ? (
          <div className={clsx(PANEL_RESULT, "text-sm text-[var(--negative)]")}>{error}</div>
        ) : loading ? (
          <div className={clsx(PANEL_RESULT, PANEL_MUTED)}>正在读取 hosts 文件，请稍候…</div>
        ) : entries.length === 0 ? (
          <div className={clsx(PANEL_RESULT, PANEL_MUTED)}>未解析到有效 hosts 条目。</div>
        ) : (
          <div className="scroll-area flex h-full flex-col gap-3 overflow-auto pr-3">
            <div className="grid grid-cols-[minmax(0,0.18fr)_minmax(0,0.26fr)_minmax(0,0.46fr)_minmax(0,0.1fr)] gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] px-4 py-2 text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
              <span>状态</span>
              <span>IP 地址</span>
              <span>域名 / 备注</span>
              <span>操作</span>
            </div>
            {entries.map((entry, index) => {
              const entryKey = `${entry.ip}-${index}`;
              const formatted = formatLine(entry);
              return (
                <div
                  key={entryKey}
                  className="grid grid-cols-[minmax(0,0.18fr)_minmax(0,0.26fr)_minmax(0,0.46fr)_minmax(0,0.1fr)] items-start gap-4 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em]">
                    <span
                      className={clsx(
                        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
                        entry.enabled
                          ? "bg-[rgba(16,185,129,0.15)] text-[var(--positive)]"
                          : "bg-[rgba(148,163,184,0.2)] text-[var(--text-tertiary)]"
                      )}
                    >
                      {entry.enabled ? "启用" : "注释"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm text-[var(--text-primary)] break-all">{entry.ip}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {entry.domains.map((domain) => (
                      <span key={domain} className="font-mono text-sm text-[var(--text-primary)] break-all">
                        {domain}
                      </span>
                    ))}
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      {entry.comment ? `# ${entry.comment}` : "无备注"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <motion.button
                      type="button"
                      className={clsx(BUTTON_PRIMARY, "px-3 py-1 text-xs")}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleCopyLine(formatted, entryKey)}
                    >
                      {copiedLine === entryKey ? "已复制" : "复制行"}
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
