import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  CHIP_ACTIVE,
  CHIP_BASE,
  PANEL_BLOCK,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_TEXTAREA,
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

const payloadOptions: { value: PayloadType; label: string }[] = [
  { value: "url", label: "URL 参数" },
  { value: "cookie", label: "Cookie" },
  { value: "header", label: "Header" }
];

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

const statusMeta: Record<DiffStatus, { label: string; row: string; badge: string }> = {
  match: {
    label: "一致",
    row: "border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)]",
    badge: "text-[var(--text-tertiary)]"
  },
  diff: {
    label: "不同",
    row: "border-[rgba(234,179,8,0.5)] bg-[rgba(253,230,138,0.25)] shadow-[0_10px_30px_rgba(255,196,87,0.2)]",
    badge: "text-[rgba(217,119,6,0.95)]"
  },
  "missing-left": {
    label: "A 缺失",
    row: "border-[rgba(248,113,113,0.45)] bg-[rgba(254,226,226,0.6)]",
    badge: "text-[var(--negative)]"
  },
  "missing-right": {
    label: "B 缺失",
    row: "border-[rgba(59,130,246,0.5)] bg-[rgba(191,219,254,0.4)]",
    badge: "text-[var(--accent)]"
  }
};

export function PayloadDiffTool() {
  const [payloadType, setPayloadType] = useState<PayloadType>("url");
  const [leftValue, setLeftValue] = useState(examplePayloads.url.left);
  const [rightValue, setRightValue] = useState(examplePayloads.url.right);
  const [hideMatches, setHideMatches] = useState(false);

  const leftPairs = useMemo(
    () => parseKeyValuePairs(payloadType, leftValue),
    [payloadType, leftValue]
  );
  const rightPairs = useMemo(
    () => parseKeyValuePairs(payloadType, rightValue),
    [payloadType, rightValue]
  );

  const allRows = useMemo(() => buildDiffRows(leftPairs, rightPairs), [leftPairs, rightPairs]);
  const visibleRows = hideMatches ? allRows.filter((row) => row.status !== "match") : allRows;
  const differenceCount = allRows.filter((row) => row.status !== "match").length;

  const handleLoadExample = () => {
    const sample = examplePayloads[payloadType];
    setLeftValue(sample.left);
    setRightValue(sample.right);
  };

  const handleSwap = () => {
    setLeftValue((prevLeft) => {
      setRightValue(prevLeft);
      return rightValue;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Diff</p>
          <h3 className={PANEL_TITLE}>参数对比</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            将 URL、Cookie、Header 解析成键值对，高亮差异并支持隐藏一致项。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.94 }}
            onClick={handleLoadExample}
          >
            填充示例
          </motion.button>
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

      <div className="flex flex-wrap items-center gap-2">
        {payloadOptions.map((option) => (
          <motion.button
            key={option.value}
            type="button"
            className={clsx(CHIP_BASE, payloadType === option.value && CHIP_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPayloadType(option.value)}
          >
            {option.label}
          </motion.button>
        ))}
        <motion.button
          type="button"
          className={clsx(BUTTON_TOGGLE, hideMatches && BUTTON_TOGGLE_ACTIVE, "max-w-[160px]")}
          whileTap={{ scale: 0.95 }}
          onClick={() => setHideMatches((prev) => !prev)}
        >
          {hideMatches ? "显示全部" : "隐藏相同项"}
        </motion.button>
      </div>

      <div className={PANEL_GRID}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>内容 A</label>
          <textarea
            className={clsx(PANEL_TEXTAREA, "font-mono text-sm")}
            spellCheck={false}
            placeholder="https://example.com?token=123&lang=zh"
            value={leftValue}
            onChange={(event) => setLeftValue(event.target.value)}
          />
          <span className="text-xs text-[var(--text-tertiary)]">
            已解析 {Object.keys(leftPairs).length} 个字段
          </span>
        </div>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>内容 B</label>
          <textarea
            className={clsx(PANEL_TEXTAREA, "font-mono text-sm")}
            spellCheck={false}
            placeholder="token=123&amp;lang=en"
            value={rightValue}
            onChange={(event) => setRightValue(event.target.value)}
          />
          <span className="text-xs text-[var(--text-tertiary)]">
            已解析 {Object.keys(rightPairs).length} 个字段
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
          <span>
            共 {allRows.length} 个键，{differenceCount} 处差异
            {hideMatches && ` · 当前显示 ${visibleRows.length} 项`}
          </span>
          <span>类型：{payloadOptions.find((option) => option.value === payloadType)?.label}</span>
        </div>
        <div className="grid gap-3">
          {visibleRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
              {allRows.length === 0 ? "暂无可解析的键值，请检查输入。" : "所有键值一致，棒极了！"}
            </p>
          ) : (
            visibleRows.map((row) => {
              const meta = statusMeta[row.status];
              return (
                <div
                  key={row.key}
                  className={clsx(
                    "grid gap-3 rounded-2xl border px-4 py-3 transition-colors md:grid-cols-[160px,1fr,1fr]",
                    meta.row
                  )}
                >
                  <div className="flex items-center justify-between gap-2 md:flex-col md:items-start">
                    <span className="font-mono text-sm text-[var(--text-primary)]">{row.key}</span>
                    <span className={clsx("text-xs font-medium", meta.badge)}>{meta.label}</span>
                  </div>
                  <DiffValue label="A" value={row.leftValue} status={row.status} />
                  <DiffValue label="B" value={row.rightValue} status={row.status} />
                </div>
              );
            })
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
};

function DiffValue({ label, value, status }: ValueProps) {
  const isMissing =
    (status === "missing-left" && label === "A") ||
    (status === "missing-right" && label === "B");
  if (value === null || value === "") {
    return (
      <div className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-2 text-sm text-[var(--text-tertiary)]">
        {isMissing ? "未提供" : "空值"}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]">
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
