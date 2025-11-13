import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  PANEL_BLOCK,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_TITLE
} from "../../ui/styles";

type PayloadType = "url" | "cookie" | "header";

type DiffStatus = "match" | "diff" | "missing-left" | "missing-right";

type DiffRow = {
  key: string;
  leftValue: string | null;
  rightValue: string | null;
  status: DiffStatus;
};

const examplePayloads: Record<PayloadType, { left: string; right: string }> = {
  url: {
    left: "https://chef.app/share?token=abc123&lang=zh&theme=dark",
    right: "https://chef.app/share?token=abc123&lang=en&theme=light&debug=true"
  },
  cookie: {
    left: "session_id=8f310; locale=zh-CN; preview=true",
    right: "session_id=8f310; locale=en-US; preview=false; beta=1"
  },
  header: {
    left: "Accept: application/json\nX-Trace: 9a2\nAuthorization: Bearer prod-token",
    right: "Accept: application/json\nX-Trace: 9a3\nAuthorization: Bearer staging-token\nX-Debug: true"
  }
};

const STATUS_BADGE_BASE =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium";

const TEXTAREA_CLASS =
  "scroll-area min-h-[165px] w-full resize-none rounded-md border border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25 focus-visible:outline-none whitespace-pre-wrap break-words overflow-auto";

type StatusMeta = {
  label: string;
  accent: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  valueBg: string;
};

const statusMeta: Record<DiffStatus, StatusMeta> = {
  match: {
    label: "一致",
    accent: "rgba(148,163,184,0.5)",
    badgeBg: "rgba(241,245,249,1)",
    badgeBorder: "rgba(148,163,184,0.45)",
    badgeText: "rgba(71,85,105,0.95)",
    valueBg: "#ffffff"
  },
  diff: {
    label: "不同",
    accent: "rgba(37,99,235,0.8)",
    badgeBg: "rgba(219,234,254,1)",
    badgeBorder: "rgba(59,130,246,0.45)",
    badgeText: "rgba(30,64,175,0.95)",
    valueBg: "#f1f6ff"
  },
  "missing-left": {
    label: "缺失",
    accent: "rgba(248,113,113,0.8)",
    badgeBg: "rgba(254,226,226,1)",
    badgeBorder: "rgba(248,113,113,0.5)",
    badgeText: "rgba(153,27,27,0.95)",
    valueBg: "#fff6f6"
  },
  "missing-right": {
    label: "缺失",
    accent: "rgba(248,113,113,0.8)",
    badgeBg: "rgba(254,226,226,1)",
    badgeBorder: "rgba(248,113,113,0.5)",
    badgeText: "rgba(153,27,27,0.95)",
    valueBg: "#fff6f6"
  }
};

export function PayloadDiffTool() {
  const [leftValue, setLeftValue] = useState(examplePayloads.url.left);
  const [rightValue, setRightValue] = useState(examplePayloads.url.right);
  const [hideMatches, setHideMatches] = useState(false);

  const leftDetectedType = useMemo(() => detectPayloadType(leftValue), [leftValue]);
  const rightDetectedType = useMemo(() => detectPayloadType(rightValue), [rightValue]);

  const leftPairs = useMemo(
    () => parseKeyValuePairs(leftDetectedType, leftValue),
    [leftDetectedType, leftValue]
  );
  const rightPairs = useMemo(
    () => parseKeyValuePairs(rightDetectedType, rightValue),
    [rightDetectedType, rightValue]
  );

  const allRows = useMemo(
    () =>
      buildDiffRows(leftPairs, rightPairs).sort((a, b) => {
        const priority = { diff: 0, "missing-left": 0, "missing-right": 0, match: 1 } as const;
        return priority[a.status] - priority[b.status] || a.key.localeCompare(b.key);
      }),
    [leftPairs, rightPairs]
  );
  const visibleRows = hideMatches ? allRows.filter((row) => row.status !== "match") : allRows;
  const differenceCount = allRows.filter((row) => row.status !== "match").length;

  const handleSwap = () => {
    setLeftValue((prevLeft) => {
      setRightValue(prevLeft);
      return rightValue;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Diff</p>
          <h3 className={PANEL_TITLE}>参数对比</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              setLeftValue("");
              setRightValue("");
            }}
          >
            清空
          </motion.button>
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.94 }}
            onClick={handleSwap}
          >
            交换
          </motion.button>
        </div>
      </header>

      <div className={PANEL_GRID}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>内容 A</label>
          <textarea
            className={TEXTAREA_CLASS}
            spellCheck={false}
            placeholder="粘贴 URL / Cookie / Header，自动解析"
            value={leftValue}
            onChange={(event) => setLeftValue(event.target.value)}
          />
        </div>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>内容 B</label>
          <textarea
            className={TEXTAREA_CLASS}
            spellCheck={false}
            placeholder="粘贴 URL / Cookie / Header，自动解析"
            value={rightValue}
            onChange={(event) => setRightValue(event.target.value)}
          />
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f5f5f5] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <span>
            共 {allRows.length} 个键，{differenceCount} 处差异
            {hideMatches && ` · 当前显示 ${visibleRows.length} 项`}
          </span>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, hideMatches && BUTTON_TOGGLE_ACTIVE, "max-w-[160px]")}
            whileTap={{ scale: 0.95 }}
            onClick={() => setHideMatches((prev) => !prev)}
          >
            {hideMatches ? "显示全部" : "隐藏相同项"}
          </motion.button>
        </div>
        <div className="scroll-area flex-1 min-h-0 overflow-auto pr-2">
          {visibleRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
              {allRows.length === 0 ? "暂无可解析的键值，请检查输入。" : "所有键值一致，棒极了！"}
            </p>
          ) : (
            <div className="grid gap-2">
              {visibleRows.map((row) => {
                const meta = statusMeta[row.status];
                return (
                  <div
                    key={row.key}
                    className={clsx(
                      "group grid items-start gap-2 rounded-lg border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-[0.92rem] transition-colors md:grid-cols-[minmax(160px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]",
                      "hover:border-[rgba(37,99,235,0.22)]"
                    )}
                    style={{
                      borderLeftWidth: "4px",
                      borderLeftColor: meta.accent
                    }}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-1.5 text-sm text-[var(--text-tertiary)]">
                      <span className="truncate font-mono text-[var(--text-primary)]">{row.key}</span>
                      <span
                        className={clsx(STATUS_BADGE_BASE, "shrink-0")}
                        style={{
                          borderColor: meta.badgeBorder,
                          background: meta.badgeBg,
                          color: meta.badgeText
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <DiffValue label="A" value={row.leftValue} status={row.status} meta={meta} />
                    <DiffValue label="B" value={row.rightValue} status={row.status} meta={meta} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type ValueProps = {
  label: string;
  value: string | null;
  status: DiffStatus;
  meta: StatusMeta;
};

function DiffValue({ label, value, status, meta }: ValueProps) {
  const isMissing =
    (status === "missing-left" && label === "A") ||
    (status === "missing-right" && label === "B");
  if (value === null || value === "") {
    return (
      <div className="rounded-md border border-dashed border-[rgba(148,163,184,0.45)] bg-white px-2 py-1 text-sm text-[var(--text-tertiary)]">
        {isMissing ? "未提供" : "空值"}
      </div>
    );
  }
  return (
    <div
      className="rounded-md px-2 py-1 font-mono text-sm text-[var(--text-primary)]"
      style={{ background: meta.valueBg }}
    >
      {value}
    </div>
  );
}

function buildDiffRows(left: Record<string, string>, right: Record<string, string>): DiffRow[] {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort((a, b) =>
    a.localeCompare(b)
  );

  return keys.map((key) => {
    const leftValue = key in left ? left[key] : null;
    const rightValue = key in right ? right[key] : null;
    let status: DiffStatus = "match";
    if (leftValue === null) {
      status = "missing-left";
    } else if (rightValue === null) {
      status = "missing-right";
    } else if (leftValue !== rightValue) {
      status = "diff";
    }
    return { key, leftValue, rightValue, status };
  });
}

function detectPayloadType(raw: string): PayloadType {
  const text = raw.trim();
  if (!text) {
    return "url";
  }

  const headerMatches = text.match(/^[A-Za-z0-9-]+:\s?.+/gm);
  if (headerMatches && headerMatches.length >= 2) {
    return "header";
  }

  const cookieSegments = text.split(/;|\n/).filter((segment) => segment.includes("=")).length;
  if (text.includes(";") && cookieSegments >= 2) {
    return "cookie";
  }

  const hasProtocol = /^https?:\/\//i.test(text);
  const hasQuery = text.includes("?") && text.includes("=");
  const ampersandPairs = text.includes("&") && text.includes("=");
  if (hasProtocol || hasQuery || ampersandPairs) {
    return "url";
  }

  if (headerMatches && headerMatches.length >= 1) {
    return "header";
  }

  if (text.includes(";") && cookieSegments >= 1) {
    return "cookie";
  }

  return "url";
}

function parseKeyValuePairs(type: PayloadType, raw: string): Record<string, string> {
  if (!raw.trim()) {
    return {};
  }
  switch (type) {
    case "url":
      return parseUrl(raw);
    case "cookie":
      return parseCookie(raw);
    case "header":
      return parseHeader(raw);
    default:
      return {};
  }
}

function parseUrl(input: string): Record<string, string> {
  const query = extractQueryString(input);
  const params = new URLSearchParams(query);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key) {
      result[key] = value;
    }
  });
  return result;
}

function extractQueryString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const asUrl = new URL(trimmed);
    if (asUrl.search) {
      return asUrl.search.slice(1);
    }
  } catch {
    /* ignore and fall back */
  }
  const questionIndex = trimmed.indexOf("?");
  if (questionIndex >= 0) {
    return trimmed.slice(questionIndex + 1);
  }
  if (!trimmed.includes("://") && trimmed.includes("=")) {
    return trimmed.replace(/^[?#]/, "");
  }
  return "";
}

function parseCookie(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  input
    .split(/;|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const [key, ...rest] = chunk.split("=");
      if (!key) {
        return;
      }
      result[key.trim()] = rest.join("=").trim();
    });
  return result;
}

function parseHeader(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) {
        result[key] = value;
      }
    });
  return result;
}
