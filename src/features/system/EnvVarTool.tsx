import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { CHIP_ACTIVE, CHIP_BASE, PANEL_CONTAINER, PANEL_INPUT } from "../../ui/styles";

type ShellType = "bash" | "zsh" | "powershell";

type EnvEntry = {
  id: string;
  key: string;
  value: string;
};

const shellOptions: { value: ShellType; label: string }[] = [
  { value: "bash", label: "Bash" },
  { value: "zsh", label: "Zsh" },
  { value: "powershell", label: "PowerShell" }
];

export function EnvVarTool() {
  const [shell, setShell] = useState<ShellType>("bash");
  const [entries, setEntries] = useState<EnvEntry[]>([
    { id: createId(), key: "API_URL", value: "https://localhost:3000" },
    { id: createId(), key: "NODE_ENV", value: "development" }
  ]);

  const scriptText = useMemo(() => {
    const filtered = entries.filter((entry) => entry.key.trim());
    if (!filtered.length) {
      return "";
    }
    if (shell === "powershell") {
      return filtered
        .map(
          (entry) =>
            `$Env:${sanitizeKey(entry.key)} = "${escapeQuotes(entry.value)}"`
        )
        .join("\n");
    }
    return filtered
      .map((entry) => `export ${sanitizeKey(entry.key)}="${escapeQuotes(entry.value)}"`)
      .join("\n");
  }, [entries, shell]);

  const addEntry = () => {
    setEntries((prev) => [...prev, { id: createId(), key: "", value: "" }]);
  };

  const updateEntry = (id: string, patch: Partial<EnvEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleCopy = async () => {
    if (!scriptText) {
      return;
    }
    await navigator.clipboard.writeText(scriptText);
  };

  return (
    <div className="flex h-full flex-col">
      <div className={clsx(PANEL_CONTAINER, "flex-1 gap-5")}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Environment</span>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">环境变量管理</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shellOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setShell(option.value)}
                className={clsx(
                  CHIP_BASE,
                  "px-4 py-2 text-xs uppercase tracking-[0.18em]",
                  option.value === shell && CHIP_ACTIVE
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_1fr_56px] items-center gap-3 text-[0.78rem] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            <span>变量名</span>
            <span>变量值</span>
            <span />
          </div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[1fr_1fr_56px] items-center gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] px-3 py-2 shadow-sm"
            >
              <input
                className={clsx(PANEL_INPUT, "py-2")}
                value={entry.key}
                placeholder="例如 API_URL"
                onChange={(event) => updateEntry(entry.id, { key: event.target.value })}
              />
              <input
                className={clsx(PANEL_INPUT, "py-2")}
                value={entry.value}
                placeholder="例如 https://example.com"
                onChange={(event) => updateEntry(entry.id, { value: event.target.value })}
              />
              <button
                type="button"
                className="text-sm font-semibold text-[var(--negative)] transition-colors hover:text-[rgba(220,38,38,0.85)]"
                onClick={() => removeEntry(entry.id)}
              >
                删除
              </button>
            </div>
          ))}
          <motion.button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-all duration-150 ease-out hover:-translate-y-[1px] hover:border-[rgba(37,99,235,0.24)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.2)]"
            whileTap={{ scale: 0.96 }}
            onClick={addEntry}
          >
            + 添加变量
          </motion.button>
        </div>

        <section className="flex flex-col gap-3">
          <header className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-[var(--text-secondary)]">
            <span>{shell === "powershell" ? "PowerShell 脚本" : "Shell 脚本"}</span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!scriptText}
              className={clsx(
                "inline-flex items-center justify-center rounded-lg border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)] transition-all duration-150 ease-out",
                "hover:-translate-y-[1px] hover:border-[rgba(37,99,235,0.24)] hover:text-[var(--text-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.25)]",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {scriptText ? "复制脚本" : "无可导出变量"}
            </button>
          </header>
          <textarea
            spellCheck={false}
            readOnly
            value={scriptText}
            className="min-h-[160px] w-full rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-3 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.2)]"
          />
        </section>
      </div>
    </div>
  );
}

function sanitizeKey(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

function createId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}
