import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_BLOCK,
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
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <h3 className={PANEL_TITLE}>进制转换</h3>
          <p className={PANEL_DESCRIPTION}>
            支持 2-36 进制互转，使用 BigInt 精确处理任意长度的整数。
          </p>
        </div>
        <motion.button
          type="button"
          className={BUTTON_GHOST}
          whileTap={{ scale: 0.95 }}
          onClick={() => setInputValue("")}
        >
          清空
        </motion.button>
      </header>

      <div className={PANEL_GRID}>
        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>原始数值</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel>原始进制</FieldLabel>
            <FieldLabel>目标进制</FieldLabel>
            <select
              className={clsx(PANEL_INPUT, "font-mono")}
              value={inputBase}
              onChange={(event) => setInputBase(Number(event.target.value))}
            >
              {BASE_OPTIONS.map((base) => (
                <option key={base} value={base}>
                  {describeBase(base)}
                </option>
              ))}
            </select>
            <select
              className={clsx(PANEL_INPUT, "font-mono")}
              value={targetBase}
              onChange={(event) => setTargetBase(Number(event.target.value))}
            >
              {BASE_OPTIONS.map((base) => (
                <option key={base} value={base}>
                  {describeBase(base)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className={clsx(PANEL_TEXTAREA, "min-h-[100px] font-mono text-sm")}
            spellCheck={false}
            placeholder="请输入要转换的整数，例如 FF00 或 1101"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />

          <motion.button
            type="button"
            className={BUTTON_GHOST}
            whileTap={{ scale: 0.95 }}
            onClick={handleSwapBases}
          >
            交换进制
          </motion.button>
        </div>

        <div className={PANEL_BLOCK}>
          <label className={PANEL_LABEL}>转换结果</label>
          <div className={clsx(PANEL_RESULT, !conversion.output && PANEL_MUTED)}>
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
      </div>

      {!conversion.error && conversion.quickValues.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2">
          {conversion.quickValues.map((item) => (
            <div
              key={item.base}
              className="flex flex-col gap-1 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-4 shadow-sm"
            >
              <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                {describeBase(item.base)}
              </span>
              <code className="text-sm font-mono text-[var(--text-primary)] break-all">
                {item.value}
              </code>
            </div>
          ))}
        </section>
      )}

      {conversion.error && <div className={PANEL_ERROR}>{conversion.error}</div>}

      <footer className={PANEL_FOOTER}>
        <span>当前版本仅支持整数转换，可自动识别大小写 · 结果默认以大写显示</span>
      </footer>
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
