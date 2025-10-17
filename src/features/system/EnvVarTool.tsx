import { useMemo, useState } from "react";
import { motion } from "framer-motion";

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
    <div className="envtool">
      <div className="envtool__surface">
        <header className="envtool__header">
          <div>
            <span className="envtool__eyebrow">Environment</span>
            <h3>环境变量管理</h3>
          </div>
          <div className="envtool__shells">
            {shellOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setShell(option.value)}
                className={option.value === shell ? "envtool__shell envtool__shell--active" : "envtool__shell"}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="envtool__grid">
          <div className="envtool__grid-head">
            <span>变量名</span>
            <span>变量值</span>
            <span />
          </div>
          {entries.map((entry) => (
            <div key={entry.id} className="envtool__row">
              <input
                className="envtool__input"
                value={entry.key}
                placeholder="例如 API_URL"
                onChange={(event) => updateEntry(entry.id, { key: event.target.value })}
              />
              <input
                className="envtool__input"
                value={entry.value}
                placeholder="例如 https://example.com"
                onChange={(event) => updateEntry(entry.id, { value: event.target.value })}
              />
              <button type="button" className="envtool__remove" onClick={() => removeEntry(entry.id)}>
                删除
              </button>
            </div>
          ))}
          <motion.button
            type="button"
            className="envtool__add"
            whileTap={{ scale: 0.96 }}
            onClick={addEntry}
          >
            + 添加变量
          </motion.button>
        </div>

        <section className="envtool__preview">
          <header>
            <span>{shell === "powershell" ? "PowerShell 脚本" : "Shell 脚本"}</span>
            <button type="button" disabled={!scriptText} onClick={handleCopy}>
              {scriptText ? "复制脚本" : "无可导出变量"}
            </button>
          </header>
          <textarea spellCheck={false} readOnly value={scriptText} />
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
