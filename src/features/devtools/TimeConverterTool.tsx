import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  CHIP_ACTIVE,
  CHIP_BASE,
  PANEL_BLOCK,
  PANEL_BUTTON_GROUP,
  PANEL_DESCRIPTION,
  PANEL_ERROR,
  PANEL_FOOTER,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_INPUT,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TEXTAREA,
  PANEL_TITLE
} from "../../ui/styles";

type TimeMode = "timestamp-to-date" | "date-to-timestamp";
type TimestampUnit = "seconds" | "milliseconds";

const TIMESTAMP_UNITS: { value: TimestampUnit; label: string }[] = [
  { value: "seconds", label: "秒" },
  { value: "milliseconds", label: "毫秒" }
];

type TimeConversion = {
  details: TimeConversionDetails | null;
  error: string | null;
};

type TimeConversionDetails = {
  unixSeconds: string;
  unixMilliseconds: string;
  local: string;
  utc: string;
  iso: string;
  relative: string;
};

export function TimeConverterTool() {
  const [mode, setMode] = useState<TimeMode>("timestamp-to-date");
  const [timestampUnit, setTimestampUnit] = useState<TimestampUnit>("seconds");
  const [timestampInput, setTimestampInput] = useState(() =>
    Math.trunc(Date.now() / 1000).toString()
  );
  const [datetimeInput, setDatetimeInput] = useState(() => formatDateInputValue(new Date()));
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const conversion = useMemo(
    () => buildTimeConversion(mode, timestampInput, timestampUnit, datetimeInput),
    [mode, timestampInput, timestampUnit, datetimeInput]
  );

  useEffect(() => {
    if (!copiedKey) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedKey(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  const handleModeChange = (nextMode: TimeMode) => {
    if (mode === nextMode) {
      return;
    }
    if (nextMode === "date-to-timestamp") {
      try {
        const milliseconds = parseTimestampInput(timestampInput, timestampUnit);
        setDatetimeInput(formatDateInputValue(new Date(milliseconds)));
      } catch {
        // ignore sync errors
      }
    } else {
      try {
        const milliseconds = parseDateInput(datetimeInput);
        const value =
          timestampUnit === "seconds"
            ? Math.trunc(milliseconds / 1000).toString()
            : Math.trunc(milliseconds).toString();
        setTimestampInput(value);
      } catch {
        // ignore sync errors
      }
    }
    setMode(nextMode);
  };

  const handleFillNow = () => {
    const now = Date.now();
    setTimestampInput(
      timestampUnit === "seconds" ? Math.trunc(now / 1000).toString() : Math.trunc(now).toString()
    );
    setDatetimeInput(formatDateInputValue(new Date(now)));
  };

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
        },
        {
          label: "相对现在",
          value: conversion.details.relative,
          key: "relative"
        }
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <h3 className={PANEL_TITLE}>时间转换</h3>
          <p className={PANEL_DESCRIPTION}>
            在 Unix 时间戳、本地时间、UTC 与 ISO8601 之间切换，支持秒 / 毫秒输入。
          </p>
        </div>
        <motion.div className={PANEL_BUTTON_GROUP} layout>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "timestamp-to-date" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleModeChange("timestamp-to-date")}
          >
            时间戳 → 日期
          </motion.button>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "date-to-timestamp" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleModeChange("date-to-timestamp")}
          >
            日期 → 时间戳
          </motion.button>
        </motion.div>
      </header>

      <div className={PANEL_GRID}>
        <div className={PANEL_BLOCK}>
          {mode === "timestamp-to-date" ? (
            <>
              <label className={PANEL_LABEL}>Unix 时间戳</label>
              <input
                className={clsx(PANEL_INPUT, "font-mono")}
                spellCheck={false}
                inputMode="numeric"
                value={timestampInput}
                onChange={(event) => setTimestampInput(event.target.value)}
                placeholder="例如 1712554287 或 1712554287123"
              />
              <div className="flex flex-wrap items-center gap-2">
                {TIMESTAMP_UNITS.map((unit) => (
                  <motion.button
                    key={unit.value}
                    type="button"
                    className={clsx(CHIP_BASE, timestampUnit === unit.value && CHIP_ACTIVE)}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setTimestampUnit(unit.value)}
                  >
                    {unit.label}
                  </motion.button>
                ))}
                <motion.button
                  type="button"
                  className={BUTTON_GHOST}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleFillNow}
                >
                  填入当前
                </motion.button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                支持秒或毫秒精度，支持小数（会保留至毫秒）。
              </p>
            </>
          ) : (
            <>
              <label className={PANEL_LABEL}>日期 / 时间字符串</label>
              <textarea
                className={clsx(PANEL_TEXTAREA, "min-h-[140px] font-mono text-sm")}
                spellCheck={false}
                value={datetimeInput}
                onChange={(event) => setDatetimeInput(event.target.value)}
                placeholder={"2025-01-01 12:00:00\n2025-01-01T12:00:00Z\nWed, 01 Jan 2025 12:00:00 GMT"}
              />
              <motion.button
                type="button"
                className={BUTTON_GHOST}
                whileTap={{ scale: 0.95 }}
                onClick={handleFillNow}
              >
                填入当前
              </motion.button>
              <p className="text-xs text-[var(--text-tertiary)]">
                支持本地格式（YYYY-MM-DD HH:mm:ss）、ISO8601、RFC3339 以及浏览器原生 Date 可解析的字符串。
              </p>
            </>
          )}
        </div>

        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>结果明细</label>
          {rows.length > 0 ? (
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
          ) : (
            <div className={clsx(PANEL_RESULT, "text-sm", PANEL_MUTED)}>
              输入内容后将实时显示转换结果。
            </div>
          )}
        </div>
      </div>

      {conversion.error && <div className={PANEL_ERROR}>{conversion.error}</div>}

      <footer className={PANEL_FOOTER}>
        <span>解析基于浏览器 Date 能力 · 秒与毫秒不会自动换算，请注意单位选择。</span>
      </footer>
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

function buildTimeConversion(
  mode: TimeMode,
  timestampInput: string,
  timestampUnit: TimestampUnit,
  datetimeInput: string
): TimeConversion {
  try {
    const milliseconds =
      mode === "timestamp-to-date"
        ? parseTimestampInput(timestampInput, timestampUnit)
        : parseDateInput(datetimeInput);
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
        iso: date.toISOString(),
        relative: formatRelative(milliseconds)
      },
      error: null
    };
  } catch (error) {
    return {
      details: null,
      error: error instanceof Error ? error.message : "转换失败，请检查输入格式。"
    };
  }
}

function parseTimestampInput(value: string, unit: TimestampUnit): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入时间戳。");
  }
  const normalized = trimmed.replace(/_/g, "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    throw new Error("时间戳只能包含数字。");
  }
  const milliseconds = unit === "seconds" ? numeric * 1000 : numeric;
  return milliseconds;
}

function parseDateInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入日期或时间字符串。");
  }
  const normalized =
    trimmed.includes("T") || trimmed.includes("Z") ? trimmed : trimmed.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("无法解析输入的日期，请使用 ISO8601 或 YYYY-MM-DD HH:mm:ss 格式。");
  }
  return date.getTime();
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

function formatRelative(targetMilliseconds: number): string {
  const diff = targetMilliseconds - Date.now();
  if (Math.abs(diff) < 1000) {
    return "就是此刻";
  }
  const units = [
    { label: "年", value: 1000 * 60 * 60 * 24 * 365 },
    { label: "月", value: 1000 * 60 * 60 * 24 * 30 },
    { label: "天", value: 1000 * 60 * 60 * 24 },
    { label: "小时", value: 1000 * 60 * 60 },
    { label: "分钟", value: 1000 * 60 },
    { label: "秒", value: 1000 }
  ];
  const unit = units.find((item) => Math.abs(diff) >= item.value) ?? units[units.length - 1];
  const amount = Math.floor(Math.abs(diff) / unit.value);
  return diff >= 0 ? `还有 ${amount} ${unit.label}` : `已过去 ${amount} ${unit.label}`;
}

function formatDateParts(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
