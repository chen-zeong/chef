import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { PANEL_CONTAINER, PANEL_INPUT } from "../../ui/styles";

type HostEntry = {
  id: string;
  enabled: boolean;
  target: string;
  domain: string;
  comment: string;
};

function createId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

const defaultEntries: HostEntry[] = [
  {
    id: createId(),
    enabled: true,
    target: "127.0.0.1",
    domain: "localhost",
    comment: "本地服务"
  },
  {
    id: createId(),
    enabled: false,
    target: "0.0.0.0",
    domain: "example.com",
    comment: "测试封禁"
  }
];

export function HostsTool() {
  const [entries, setEntries] = useState<HostEntry[]>(defaultEntries);
  const [note, setNote] = useState(
    `提示：系统 hosts 需要管理员权限进行修改。请复制生成内容后，在编辑器中以管理员身份打开 hosts 文件进行替换。\nmacOS / Linux: /etc/hosts\nWindows: C:\\Windows\\System32\\drivers\\etc\\hosts`
  );

  const hostText = useMemo(() => {
    return entries
      .filter((entry) => entry.target.trim() && entry.domain.trim())
      .map((entry) => {
        const base = `${entry.target.trim()} ${entry.domain.trim()}`;
        const withComment = entry.comment.trim() ? `${base} # ${entry.comment.trim()}` : base;
        return entry.enabled ? withComment : `# ${withComment}`;
      })
      .join("\n");
  }, [entries]);

  const addEntry = () => {
    setEntries((previous) => [
      ...previous,
      {
        id: createId(),
        enabled: true,
        target: "",
        domain: "",
        comment: ""
      }
    ]);
  };

  const updateEntry = (id: string, patch: Partial<HostEntry>) => {
    setEntries((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (id: string) => {
    setEntries((previous) => previous.filter((entry) => entry.id !== id));
  };

  const toggleAll = (enabled: boolean) => {
    setEntries((previous) => previous.map((entry) => ({ ...entry, enabled })));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hostText);
  };

  const actionButton = clsx(
    "inline-flex items-center justify-center rounded-lg border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-all duration-150 ease-out",
    "hover:-translate-y-[1px] hover:border-[rgba(37,99,235,0.24)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.25)]",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );

  const primaryActionButton = clsx(
    actionButton,
    "border-transparent bg-[var(--accent)] text-white shadow-[0_16px_32px_rgba(37,99,235,0.18)] hover:bg-[var(--accent-strong)]"
  );

  return (
    <div className="flex h-full flex-col">
      <div className={clsx(PANEL_CONTAINER, "flex-1 gap-5")}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Hosts</span>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Host 管理</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button type="button" whileTap={{ scale: 0.95 }} className={actionButton} onClick={() => toggleAll(true)}>
              全部启用
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.95 }} className={actionButton} onClick={() => toggleAll(false)}>
              全部停用
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              className={primaryActionButton}
              onClick={handleCopy}
              disabled={!hostText}
            >
              复制配置
            </motion.button>
          </div>
        </header>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[64px_1.2fr_1.2fr_1fr_72px] items-center gap-3 text-[0.78rem] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            <span>启用</span>
            <span>目标地址</span>
            <span>域名</span>
            <span>备注</span>
            <span />
          </div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[64px_1.2fr_1.2fr_1fr_72px] items-center gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] px-3 py-2 shadow-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-[color:var(--border-subtle)] text-[var(--accent)] focus:ring-[var(--accent)]"
                checked={entry.enabled}
                onChange={(event) => updateEntry(entry.id, { enabled: event.target.checked })}
              />
              <input
                className={clsx(PANEL_INPUT, "py-2")}
                placeholder="例如 127.0.0.1"
                value={entry.target}
                onChange={(event) => updateEntry(entry.id, { target: event.target.value })}
              />
              <input
                className={clsx(PANEL_INPUT, "py-2")}
                placeholder="例如 api.example.dev"
                value={entry.domain}
                onChange={(event) => updateEntry(entry.id, { domain: event.target.value })}
              />
              <input
                className={clsx(PANEL_INPUT, "py-2")}
                placeholder="可选备注"
                value={entry.comment}
                onChange={(event) => updateEntry(entry.id, { comment: event.target.value })}
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
            whileTap={{ scale: 0.96 }}
            className="inline-flex items-center justify-center rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-all duration-150 ease-out hover:-translate-y-[1px] hover:border-[rgba(37,99,235,0.24)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.2)]"
            onClick={addEntry}
          >
            + 新增条目
          </motion.button>
        </div>

        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between text-sm font-semibold text-[var(--text-secondary)]">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">预览内容</h4>
            <span className="text-xs uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
              {hostText.split("\n").filter(Boolean).length} 行
            </span>
          </header>
          <textarea
            className="min-h-[140px] w-full rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-3 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.2)]"
            spellCheck={false}
            readOnly
            value={hostText}
          />
        </section>

        <section className="flex flex-col gap-3">
          <header className="text-xs uppercase tracking-[0.1em] text-[var(--text-tertiary)]">操作提示</header>
          <textarea
            className="min-h-[110px] rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-3 text-sm text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.2)]"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            spellCheck={false}
          />
        </section>
      </div>
    </div>
  );
}
