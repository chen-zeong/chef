import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import CryptoJS from "crypto-js";
import { BaseSelect as FancySelect } from "@/components/ui/base-select";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  BUTTON_TOGGLE,
  BUTTON_TOGGLE_ACTIVE,
  PANEL_BLOCK,
  PANEL_BUTTON_GROUP,
  PANEL_ERROR,
  PANEL_GRID,
  PANEL_HEADER,
  PANEL_INPUT,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";

type AesMode = "encrypt" | "decrypt";
type CipherMode = "CBC" | "CFB" | "CTR" | "OFB" | "ECB";
type PaddingMode = "Pkcs7" | "AnsiX923" | "Iso10126" | "Iso97971" | "ZeroPadding" | "NoPadding";
type KeyLength = 128 | 192 | 256;
const CIPHER_MODE_OPTIONS: { label: string; value: CipherMode }[] = [
  { label: "CBC", value: "CBC" },
  { label: "CFB", value: "CFB" },
  { label: "CTR", value: "CTR" },
  { label: "OFB", value: "OFB" },
  { label: "ECB", value: "ECB" }
];

const PADDING_OPTIONS: { label: string; value: PaddingMode }[] = [
  { label: "PKCS7", value: "Pkcs7" },
  { label: "ANSI X.923", value: "AnsiX923" },
  { label: "ISO10126", value: "Iso10126" },
  { label: "ISO97971", value: "Iso97971" },
  { label: "ZeroPadding", value: "ZeroPadding" },
  { label: "NoPadding", value: "NoPadding" }
];

const KEY_LENGTH_OPTIONS: { label: string; value: KeyLength }[] = [
  { label: "128 bit", value: 128 },
  { label: "192 bit", value: 192 },
  { label: "256 bit", value: 256 }
];

export function AesTool() {
  const [mode, setMode] = useState<AesMode>("encrypt");
  const [message, setMessage] = useState("Chef Toolbox");
  const [key, setKey] = useState("chef-lab");
  const [iv, setIv] = useState("0123456789abcdef");
  const [cipherMode, setCipherMode] = useState<CipherMode>("CBC");
  const [padding, setPadding] = useState<PaddingMode>("Pkcs7");
  const [keyLength, setKeyLength] = useState<KeyLength>(256);
  const [rows, setRows] = useState<ResultRowData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const needsIv = cipherMode !== "ECB";
  const handleRun = () => {
    try {
      if (!key.trim()) {
        throw new Error("请输入密钥。");
      }

      if (!message.trim()) {
        throw new Error(mode === "encrypt" ? "请输入需要加密的内容。" : "请输入密文。");
      }

      if (needsIv && !iv.trim()) {
        throw new Error("当前运算模式需要偏移量 (IV)。");
      }

      const normalizedKey = deriveWordArray(key, keyLength / 8);
      const normalizedIv = needsIv ? deriveWordArray(iv, 16) : undefined;

      const config: {
        mode: (typeof CryptoJS.mode)[keyof typeof CryptoJS.mode];
        padding: (typeof CryptoJS.pad)[keyof typeof CryptoJS.pad];
        iv?: ReturnType<typeof CryptoJS.enc.Hex.parse>;
      } = {
        mode: CryptoJS.mode[cipherMode],
        padding: CryptoJS.pad[padding]
      };
      if (normalizedIv) {
        config.iv = normalizedIv;
      }

      let rowItems: ResultRowData[] = [];

      if (mode === "encrypt") {
        const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(message), normalizedKey, config);
        const ciphertext = encrypted.ciphertext;
        const base64Value = CryptoJS.enc.Base64.stringify(ciphertext);
        const hexValue = CryptoJS.enc.Hex.stringify(ciphertext);
        rowItems = [
          { id: "base64-output", label: "Base64 输出", value: base64Value },
          { id: "hex-output", label: "Hex 输出", value: hexValue }
        ];
      } else {
        const ciphertext = parseCiphertext(message.trim());
        const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
        const bytes = CryptoJS.AES.decrypt(cipherParams, normalizedKey, config);
        const plainText = CryptoJS.enc.Utf8.stringify(bytes);
        if (!plainText) {
          throw new Error("解密结果为空，密文或密钥可能不匹配。");
        }
        const base64Plain = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(plainText));
        const hexPlain = CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(plainText));
        rowItems = [
          { id: "plain-text", label: "解密结果", value: plainText },
          { id: "plain-base64", label: "结果 Base64", value: base64Plain },
          { id: "plain-hex", label: "结果 Hex", value: hexPlain }
        ];
      }

      setRows(rowItems);
      setCopiedRowId(null);
      setError(null);
    } catch (aesError) {
      setRows([]);
      setError(aesError instanceof Error ? aesError.message : "处理失败，请检查输入。");
    }
  };

  const handleCopyRow = async (value: string, rowId: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedRowId(rowId);
      window.setTimeout(() => setCopiedRowId((current) => (current === rowId ? null : current)), 1500);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "复制失败，请稍后重试。");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Cipher</p>
          <h3 className={PANEL_TITLE}>AES 加密</h3>
        </div>
        <div className={PANEL_BUTTON_GROUP}>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "encrypt" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("encrypt")}
          >
            加密
          </motion.button>
          <motion.button
            type="button"
            className={clsx(BUTTON_TOGGLE, mode === "decrypt" && BUTTON_TOGGLE_ACTIVE)}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("decrypt")}
          >
            解密
          </motion.button>
        </div>
      </header>

      <div className={clsx(PANEL_GRID, "min-h-0")}
        >
        <div className={clsx(PANEL_BLOCK, "space-y-4")}>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField
                label="运算模式"
                value={cipherMode}
                options={CIPHER_MODE_OPTIONS}
                onChange={(value) => setCipherMode(value as CipherMode)}
              />
              <SelectField
                label="填充模式"
                value={padding}
                options={PADDING_OPTIONS}
                onChange={(value) => setPadding(value as PaddingMode)}
              />
              <SelectField
                label="密钥长度"
                value={keyLength}
                options={KEY_LENGTH_OPTIONS}
                onChange={(value) => setKeyLength(Number(value) as KeyLength)}
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-tertiary)]">{mode === "encrypt" ? "明文" : "密文"}</span>
                <input
                  className={PANEL_INPUT}
                  type="text"
                  spellCheck={false}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={mode === "encrypt" ? "请输入需要加密的内容" : "请输入 AES 密文"}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-tertiary)]">密钥</span>
                <input
                  className={PANEL_INPUT}
                  type="text"
                  spellCheck={false}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="支持 UTF-8 或 Hex"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--text-tertiary)]">偏移量 (IV)</span>
                <input
                  className={clsx(PANEL_INPUT, needsIv ? "" : "opacity-60")}
                  type="text"
                  spellCheck={false}
                  value={iv}
                  onChange={(event) => setIv(event.target.value)}
                  placeholder="CBC/CFB/CTR/OFB 需提供"
                  disabled={!needsIv}
                />
              </div>
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">
              Hex 需偶数字符；不足会自动补 0，多余部分会根据密钥长度截断。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <motion.button type="button" className={BUTTON_PRIMARY} whileTap={{ scale: 0.95 }} onClick={handleRun}>
              立即执行
            </motion.button>
            <motion.button
              type="button"
              className={BUTTON_GHOST}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setMessage("");
                setRows([]);
                setError(null);
                setCopiedRowId(null);
              }}
            >
              输入
            </motion.button>
          </div>
        </div>
        <div className={clsx(PANEL_BLOCK, "min-h-0 space-y-3")}>
          <label className={PANEL_LABEL}>编码列表</label>
          {rows.length > 0 ? (
            <div className="scroll-area flex-1 min-h-[220px] overflow-auto pr-2">
              <div className="flex flex-col gap-3">
                {rows.map((row) => (
                  <ResultRow
                    key={row.id}
                    label={row.label}
                    value={row.value}
                    copied={copiedRowId === row.id}
                    onCopy={() => handleCopyRow(row.value, row.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className={clsx(PANEL_RESULT, "text-sm", PANEL_MUTED)}>执行后将生成 Base64 与 Hex 结果。</div>
          )}
        </div>
      </div>

      {error && <div className={PANEL_ERROR}>{error}</div>}
    </div>
  );
}

type SelectOption = { label: string; value: string | number };

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string | number;
  options: SelectOption[];
  onChange: (value: string | number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      <FancySelect value={value} onChange={onChange} options={options} />
    </div>
  );
}

type ResultRowData = {
  id: string;
  label: string;
  value: string;
};

function ResultRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
        <span className="font-mono text-sm text-[var(--text-primary)] break-all">{value}</span>
      </div>
      <motion.button
        type="button"
        className={clsx(BUTTON_PRIMARY, "px-3 py-1 text-xs")}
        whileTap={{ scale: value ? 0.95 : 1 }}
        disabled={!value}
        onClick={value ? onCopy : undefined}
      >
        {copied ? "已复制" : "复制"}
      </motion.button>
    </div>
  );
}

function deriveWordArray(input: string, targetBytes: number) {
  const wordArray = parseInputToWordArray(input.trim());
  return normalizeWordArray(wordArray, targetBytes);
}

type WordArray = ReturnType<typeof CryptoJS.enc.Hex.parse>;

function parseInputToWordArray(input: string) {
  if (!input) {
    return CryptoJS.lib.WordArray.create();
  }
  const hexPattern = /^([0-9a-fA-F]{2})+$/;
  if (hexPattern.test(input)) {
    return CryptoJS.enc.Hex.parse(input);
  }
  return CryptoJS.enc.Utf8.parse(input);
}

function normalizeWordArray(wordArray: WordArray, targetBytes: number) {
  const requiredWords = Math.ceil(targetBytes / 4);
  const wordsCopy = wordArray.words.slice(0, requiredWords);
  const normalized = CryptoJS.lib.WordArray.create(wordsCopy, Math.min(wordArray.sigBytes, targetBytes));
  if (normalized.sigBytes < targetBytes) {
    const padBytes = targetBytes - normalized.sigBytes;
    const padWords = new Array(Math.ceil(padBytes / 4)).fill(0);
    const padding = CryptoJS.lib.WordArray.create(padWords, padBytes);
    normalized.concat(padding);
    normalized.sigBytes = targetBytes;
  } else {
    normalized.sigBytes = targetBytes;
  }
  return normalized;
}

function parseCiphertext(value: string) {
  const trimmed = value.trim();
  const hexPattern = /^([0-9a-fA-F]{2})+$/;
  if (hexPattern.test(trimmed)) {
    return CryptoJS.enc.Hex.parse(trimmed);
  }
  return CryptoJS.enc.Base64.parse(trimmed);
}
