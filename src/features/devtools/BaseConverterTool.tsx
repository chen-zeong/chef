import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_BLOCK,
  PANEL_ERROR,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_INPUT,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_TITLE
} from "../../ui/styles";
import { BaseSelect as FancySelect } from "@/components/ui/base-select";

const BASE_OPTIONS = Array.from({ length: 35 }, (_, index) => index + 2);
const COMMON_BASES = [2, 8, 10, 16];
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

type ConversionResult = {
  output: string;
  quickValues: { base: number; value: string }[];
  error: string | null;
};

export function BaseConverterTool() {
  const [inputBase, setInputBase] = useState(10);
  const [targetBase, setTargetBase] = useState(16);
  const [inputValue, setInputValue] = useState("1024");
  const [copied, setCopied] = useState(false);
  const baseOptions = useMemo(
    () => BASE_OPTIONS.map((base) => ({ value: base, label: describeBase(base) })),
    []
  );
  const quickListRef = useRef<HTMLDivElement | null>(null);
  const [quickListMaxHeight, setQuickListMaxHeight] = useState<number | null>(null);

  const conversion = useMemo(
    () => convertRadix(inputValue, inputBase, targetBase),
    [inputValue, inputBase, targetBase]
  );

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setCopied(false);
  }, [conversion.output]);

  useEffect(() => {
    const updateMaxHeight = () => {
      if (!quickListRef.current) {
        return;
      }
      const rect = quickListRef.current.getBoundingClientRect();
      const available = window.innerHeight - rect.top - 40;
      setQuickListMaxHeight(Math.max(220, available));
    };
    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    return () => window.removeEventListener("resize", updateMaxHeight);
  }, []);

  const handleSwapBases = () => {
    setInputBase(targetBase);
    setTargetBase(inputBase);
  };

  const handleCopy = async () => {
    if (!conversion.output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(conversion.output);
      setCopied(true);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Radix</p>
          <h3 className={PANEL_TITLE}>进制转换</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.95 }} onClick={handleSwapBases}>
            交换进制
          </motion.button>
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.95 }} onClick={() => setInputValue("")}>
            清空
          </motion.button>
        </div>
      </header>

      <div className={clsx(PANEL_GRID, "min-h-0 gap-6 md:grid-cols-[minmax(0,0.52fr)_minmax(0,0.48fr)]")}>
        <div className={clsx(PANEL_BLOCK, "space-y-4")}>
          <label className={PANEL_LABEL}>原始数值</label>
          <textarea
            className="scroll-area min-h-[140px] resize-none rounded-md border border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-3 font-mono text-sm text-[var(--text-primary)] leading-relaxed outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            spellCheck={false}
            placeholder="请输入要转换的整数，例如 FF00 或 1101"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>原始进制</FieldLabel>
              <FancySelect value={inputBase} onChange={setInputBase} options={baseOptions} />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>目标进制</FieldLabel>
              <FancySelect value={targetBase} onChange={setTargetBase} options={baseOptions} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">常用原始进制：</span>
            {COMMON_BASES.map((base) => (
              <button
                key={`input-${base}`}
                type="button"
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  inputBase === base
                    ? "border-[var(--accent)] bg-[rgba(37,99,235,0.08)] text-[var(--accent)]"
                    : "border-[rgba(148,163,184,0.4)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                )}
                onClick={() => setInputBase(base)}
              >
                {base}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">常用目标进制：</span>
            {COMMON_BASES.map((base) => (
              <button
                key={`target-${base}`}
                type="button"
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  targetBase === base
                    ? "border-[var(--accent)] bg-[rgba(37,99,235,0.08)] text-[var(--accent)]"
                    : "border-[rgba(148,163,184,0.4)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                )}
                onClick={() => setTargetBase(base)}
              >
                {base}
              </button>
            ))}
          </div>
        </div>

        <div className={clsx(PANEL_BLOCK, "min-h-0 space-y-4")}>
          <label className={PANEL_LABEL}>转换结果</label>
          <div className="flex flex-col gap-3">
            <div
              className={clsx(
                "flex min-h-[72px] items-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white/90 px-4 py-3 font-mono text-base text-[var(--text-primary)]",
                !conversion.output && PANEL_MUTED
              )}
            >
              {conversion.output || "输出会显示在这里"}
            </div>
            <motion.button
              type="button"
              className={BUTTON_PRIMARY}
              whileTap={{ scale: conversion.output ? 0.95 : 1 }}
              disabled={!conversion.output}
              onClick={handleCopy}
            >
              {copied ? "已复制" : "复制结果"}
            </motion.button>
          </div>

          {!conversion.error && conversion.quickValues.length > 0 && (
            <div
              ref={quickListRef}
              className="scroll-area flex-1 min-h-[220px] overflow-auto pr-2"
              style={quickListMaxHeight ? { maxHeight: `${quickListMaxHeight}px` } : undefined}
            >
              <div className="grid gap-3">
                {conversion.quickValues.map((item) => (
                  <div
                    key={item.base}
                    className="flex flex-col gap-1 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2"
                  >
                    <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                      {describeBase(item.base)}
                    </span>
                    <code className="text-sm font-mono text-[var(--text-primary)] break-all">
                      {item.value}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {conversion.error && <div className={PANEL_ERROR}>{conversion.error}</div>}
    </div>
  );
}

function convertRadix(value: string, inputBase: number, targetBase: number): ConversionResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { output: "", quickValues: [], error: "请输入要转换的数值。" };
  }
  try {
    const parsed = parseToBigInt(trimmed, inputBase);
    const output = formatFromBigInt(parsed, targetBase).toUpperCase();
    const quickValues = Array.from(new Set(COMMON_BASES))
      .filter((base) => base >= 2 && base <= 36)
      .map((base) => ({
        base,
        value: formatFromBigInt(parsed, base).toUpperCase()
      }));
    return { output, quickValues, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "转换失败，请检查输入。";
    return { output: "", quickValues: [], error: message };
  }
}

function parseToBigInt(value: string, base: number): bigint {
  if (base < 2 || base > 36) {
    throw new Error("进制范围需在 2-36 之间。");
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new Error("请输入要转换的数值。");
  }
  const hasSign = normalized.startsWith("-") || normalized.startsWith("+");
  const sign = normalized.startsWith("-") ? -1n : 1n;
  const digits = hasSign ? normalized.slice(1) : normalized;
  if (!digits) {
    throw new Error("请输入有效数值。");
  }
  if (!isValueValidForBase(digits, base)) {
    throw new Error(`输入包含超出 ${base} 进制的字符。`);
  }
  let result = 0n;
  for (const char of digits) {
    const digit = BigInt(DIGITS.indexOf(char));
    result = result * BigInt(base) + digit;
  }
  return sign * result;
}

function isValueValidForBase(value: string, base: number): boolean {
  for (const char of value) {
    const digit = DIGITS.indexOf(char);
    if (digit < 0 || digit >= base) {
      return false;
    }
  }
  return true;
}

function formatFromBigInt(value: bigint, base: number): string {
  if (base < 2 || base > 36) {
    throw new Error("进制范围需在 2-36 之间。");
  }
  if (value === 0n) {
    return "0";
  }
  const negative = value < 0;
  let current = negative ? -value : value;
  let output = "";
  while (current > 0n) {
    const remainder = current % BigInt(base);
    output = DIGITS[Number(remainder)] + output;
    current = current / BigInt(base);
  }
  return negative ? `-${output}` : output;
}

function describeBase(base: number): string {
  const map: Record<number, string> = {
    2: "二进制",
    8: "八进制",
    10: "十进制",
    16: "十六进制"
  };
  return map[base] ? `${base} (${map[base]})` : `${base} 进制`;
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{children}</span>;
}
