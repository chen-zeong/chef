import { ChangeEvent, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import CryptoJS from "crypto-js";
import clsx from "clsx";
import { Copy, Trash2 } from "lucide-react";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_DESCRIPTION,
  PANEL_HEADER,
  PANEL_LABEL,
  PANEL_MUTED,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";

type HashStatus = "processing" | "ready" | "error";

type HashEntry = {
  id: string;
  name: string;
  size: number;
  status: HashStatus;
  md5?: string;
  sha256?: string;
  error?: string;
};

export function FileHashTool() {
  const [entries, setEntries] = useState<HashEntry[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processFiles(files);
      event.target.value = "";
    }
  };

  const processFiles = (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList);
    if (!fileArray.length) {
      return;
    }

    const newEntries = fileArray.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      size: file.size,
      status: "processing" as HashStatus
    }));

    setEntries((previous) => [...newEntries, ...previous]);

    newEntries.forEach((entry, index) => {
      const file = fileArray[index];
      computeHashes(file)
        .then(({ md5, sha256 }) => {
          setEntries((previous) =>
            previous.map((item) =>
              item.id === entry.id ? { ...item, md5, sha256, status: "ready" } : item
            )
          );
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "无法完成哈希计算";
          setEntries((previous) =>
            previous.map((item) =>
              item.id === entry.id ? { ...item, status: "error", error: message } : item
            )
          );
        });
    });
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1400);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemove = (id: string) => {
    setEntries((previous) => previous.filter((entry) => entry.id !== id));
  };

  const handleClearAll = () => {
    setEntries([]);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className={PANEL_HEADER}>
        <div>
          <h3 className={PANEL_TITLE}>文件 Hash 计算器</h3>
          <p className={PANEL_DESCRIPTION}>支持同时生成单个或多个文件的 MD5 与 SHA256。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            className={BUTTON_PRIMARY}
            whileTap={{ scale: 0.95 }}
            onClick={() => fileInputRef.current?.click()}
          >
            选择文件
          </motion.button>
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            disabled={!entries.length}
            whileTap={{ scale: entries.length ? 0.95 : 1 }}
            onClick={handleClearAll}
          >
            清空结果
          </motion.button>
        </div>
      </header>

      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {entries.length === 0 ? (
        <div className={PANEL_RESULT}>
          <span className={PANEL_MUTED}>添加文件后即可查看对应的 MD5 与 SHA256 结果。</span>
        </div>
      ) : (
        <div className="scroll-area max-h-[480px] overflow-auto pr-2">
          <div className="flex flex-col gap-4">
            {entries.map((entry) => (
              <HashResultCard
                key={entry.id}
                entry={entry}
                copiedKey={copiedKey}
                onCopy={handleCopy}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

type HashResultCardProps = {
  entry: HashEntry;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void;
  onRemove: (id: string) => void;
};

function HashResultCard({ entry, copiedKey, onCopy, onRemove }: HashResultCardProps) {
  const md5Key = `${entry.id}-md5`;
  const shaKey = `${entry.id}-sha256`;
  const isReady = entry.status === "ready";

  return (
    <div className="rounded-2xl border border-[color:var(--panel-border)] bg-[var(--panel-bg)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{entry.name}</span>
          <span className="text-xs text-[var(--text-secondary)]">{formatBytes(entry.size)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "text-xs font-medium uppercase tracking-wide",
              entry.status === "ready" && "text-emerald-500",
              entry.status === "processing" && "text-[var(--text-secondary)]",
              entry.status === "error" && "text-[var(--negative)]"
            )}
          >
            {entry.status === "processing"
              ? "计算中"
              : entry.status === "error"
                ? "计算失败"
                : "完成"}
          </span>
          <motion.button
            type="button"
            className={BUTTON_GHOST}
            onClick={() => onRemove(entry.id)}
            whileTap={{ scale: 0.95 }}
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <HashValue
          label="MD5"
          value={entry.md5}
          status={entry.status}
          copied={copiedKey === md5Key}
          onCopy={() => entry.md5 && onCopy(entry.md5, md5Key)}
        />
        <HashValue
          label="SHA256"
          value={entry.sha256}
          status={entry.status}
          copied={copiedKey === shaKey}
          onCopy={() => entry.sha256 && onCopy(entry.sha256, shaKey)}
        />
      </div>

      {entry.status === "error" && entry.error ? (
        <div className="mt-4 rounded-xl border border-[rgba(220,38,38,0.3)] bg-[rgba(254,226,226,0.6)] px-3 py-2 text-xs text-[var(--negative)]">
          {entry.error}
        </div>
      ) : null}
    </div>
  );
}

type HashValueProps = {
  label: string;
  value?: string;
  status: HashStatus;
  copied: boolean;
  onCopy: () => void;
};

function HashValue({ label, value, status, copied, onCopy }: HashValueProps) {
  const isReady = status === "ready" && !!value;
  return (
    <div className="flex flex-col gap-2">
      <span className={PANEL_LABEL}>{label}</span>
      <div className={PANEL_RESULT}>
        {isReady ? (
          <span className="break-all">{value}</span>
        ) : (
          <span className={PANEL_MUTED}>
            {status === "processing" ? "正在计算..." : "暂无可用结果"}
          </span>
        )}
      </div>
      <motion.button
        type="button"
        className={BUTTON_PRIMARY}
        disabled={!isReady}
        whileTap={{ scale: isReady ? 0.95 : 1 }}
        onClick={isReady ? onCopy : undefined}
      >
        <Copy className="mr-2 h-4 w-4" />
        {copied ? "已复制" : "复制结果"}
      </motion.button>
    </div>
  );
}

async function computeHashes(file: File) {
  const buffer = await file.arrayBuffer();
  const wordArray = CryptoJS.lib.WordArray.create(buffer);
  const md5 = CryptoJS.MD5(wordArray).toString();
  const sha256 = CryptoJS.SHA256(wordArray).toString();
  return { md5, sha256 };
}

function formatBytes(size: number): string {
  if (size === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const formatted = size / 1024 ** exponent;
  return `${formatted.toFixed(formatted >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
