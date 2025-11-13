import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  PANEL_BLOCK,
  PANEL_ERROR,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";

type TimestampUnit = "seconds" | "milliseconds";

type TimeConversion = {
  details: TimeConversionDetails | null;
  error: string | null;
  interpretation: Interpretation | null;
};

type TimeConversionDetails = {
  unixSeconds: string;
  unixMilliseconds: string;
  local: string;
  utc: string;
  iso: string;
};

type Interpretation =
  | { kind: "timestamp"; unit: TimestampUnit }
  | { kind: "date" };

export function TimeConverterTool() {
  const [inputValue, setInputValue] = useState(() => Math.trunc(Date.now() / 1000).toString());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);
  const [resultsMaxHeight, setResultsMaxHeight] = useState<number | null>(null);

  const conversion = useMemo(() => buildTimeConversion(inputValue), [inputValue]);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedKey(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    const updateMaxHeight = () => {
      if (!resultContainerRef.current) {
        return;
      }
      const rect = resultContainerRef.current.getBoundingClientRect();
      const available = window.innerHeight - rect.top - 40;
      setResultsMaxHeight(Math.max(220, available));
    };
    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    return () => window.removeEventListener("resize", updateMaxHeight);
  }, []);

  const handleFillTimestamp = () => {
    setInputValue(Math.trunc(Date.now() / 1000).toString());
  };

  const handleFillDate = () => {
    setInputValue(formatDateInputValue(new Date()));
  };

  const handleClear = () => setInputValue("");

  const handleCopy = async (value: string, key: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch (error) {
      console.error(error);
    }
  };

  const rows = conversion.details
    ? [
        {
          label: "Unix 时间戳（秒）",
          value: conversion.details.unixSeconds,
          key: "unix-seconds"
        },
        {
          label: "Unix 时间戳（毫秒）",
          value: conversion.details.unixMilliseconds,
          key: "unix-milliseconds"
        },
        {
          label: "本地时间",
          value: conversion.details.local,
          key: "local"
        },
        {
          label: "UTC",
          value: conversion.details.utc,
          key: "utc"
        },
        {
          label: "ISO 8601",
          value: conversion.details.iso,
          key: "iso"
        }
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Time</p>
          <h3 className={PANEL_TITLE}>时间转换</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.95 }} onClick={handleFillTimestamp}>
            使用当前时间戳
          </motion.button>
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.95 }} onClick={handleFillDate}>
            使用当前日期
          </motion.button>
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.95 }} onClick={handleClear}>
            清空输入
          </motion.button>
        </div>
      </header>

      <div className={clsx(PANEL_GRID, "min-h-0")}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>输入任意时间戳或日期</label>
          <textarea
            className="scroll-area min-h-[160px] resize-none rounded-md border border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            spellCheck={false}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={`1712554287\n1712554287123\n2025-01-01 12:00:00\n2025-01-01T12:00:00Z`}
          />
        </div>

        <div className={clsx(PANEL_BLOCK, "min-h-0")}>
          <label className={PANEL_LABEL}>结果明细</label>
          {rows.length > 0 ? (
            <div
              ref={resultContainerRef}
              className="scroll-area flex-1 min-h-[220px] overflow-auto pr-2"
              style={resultsMaxHeight ? { maxHeight: `${resultsMaxHeight}px` } : undefined}
            >
              <div className="flex flex-col gap-3">
                {rows.map((row) => (
                  <ResultRow
                    key={row.key}
                    label={row.label}
                    value={row.value}
                    copyKey={row.key}
                    copiedKey={copiedKey}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className={clsx(PANEL_RESULT, "text-sm", PANEL_MUTED)}>
              输入内容后将实时显示转换结果。
            </div>
          )}
        </div>
      </div>
      {conversion.error && <div className={PANEL_ERROR}>{conversion.error}</div>}
    </div>
  );
}

type ResultRowProps = {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void;
};

function ResultRow({ label, value, copyKey, copiedKey, onCopy }: ResultRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
        <span className="font-mono text-sm text-[var(--text-primary)] break-all">{value}</span>
      </div>
      <motion.button
        type="button"
        className={clsx(BUTTON_GHOST, "px-3 py-1 text-xs")}
        whileTap={{ scale: value ? 0.95 : 1 }}
        disabled={!value}
        onClick={() => onCopy(value, copyKey)}
      >
        {copiedKey === copyKey ? "已复制" : "复制"}
      </motion.button>
    </div>
  );
}

function buildTimeConversion(inputValue: string): TimeConversion {
  try {
    const { milliseconds, interpretation } = interpretInput(inputValue);
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) {
      throw new Error("无法解析输入的时间。");
    }
    return {
      details: {
        unixSeconds: Math.trunc(milliseconds / 1000).toString(),
        unixMilliseconds: Math.trunc(milliseconds).toString(),
        local: formatLocalDate(date),
        utc: formatUtcDate(date),
        iso: date.toISOString()
      },
      error: null,
      interpretation
    };
  } catch (error) {
    return {
      details: null,
      error: error instanceof Error ? error.message : "转换失败，请检查输入格式。",
      interpretation: null
    };
  }
}

function interpretInput(value: string): { milliseconds: number; interpretation: Interpretation } {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入时间戳或日期。");
  }

  const normalizedNumeric = trimmed.replace(/[\s_,]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(normalizedNumeric)) {
    const numeric = Number(normalizedNumeric);
    if (!Number.isFinite(numeric)) {
      throw new Error("时间戳只能包含数字。");
    }
    const inferredUnit: TimestampUnit = Math.abs(numeric) >= 1e12 ? "milliseconds" : "seconds";
    const milliseconds = inferredUnit === "seconds" ? numeric * 1000 : numeric;
    return { milliseconds, interpretation: { kind: "timestamp", unit: inferredUnit } };
  }

  const normalizedDate =
    trimmed.includes("T") || trimmed.includes("Z") ? trimmed : trimmed.replace(/\s+/, "T");
  const date = new Date(normalizedDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error("无法解析输入，请输入纯数字时间戳或常见日期字符串。");
  }
  return { milliseconds: date.getTime(), interpretation: { kind: "date" } };
}

function formatDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatLocalDate(date: Date): string {
  return `${formatDateParts(date)} (GMT${formatOffset(date)})`;
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function formatOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${pad(hours)}:${pad(minutes)}`;
}

function formatDateParts(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
