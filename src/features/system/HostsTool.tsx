import { useMemo, useState } from "react";
import { motion } from "framer-motion";

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

  return (
    <div className="hosttool">
      <div className="hosttool__surface">
        <header className="hosttool__header">
          <div>
            <span className="hosttool__eyebrow">Hosts</span>
            <h3>Host 管理</h3>
          </div>
          <div className="hosttool__header-actions">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              className="hosttool__action"
              onClick={() => toggleAll(true)}
            >
              全部启用
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              className="hosttool__action"
              onClick={() => toggleAll(false)}
            >
              全部停用
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              className="hosttool__action hosttool__action--primary"
              onClick={handleCopy}
              disabled={!hostText}
            >
              复制配置
            </motion.button>
          </div>
        </header>

        <div className="hosttool__entries">
          <div className="hosttool__entries-head">
            <span>启用</span>
            <span>目标地址</span>
            <span>域名</span>
            <span>备注</span>
            <span />
          </div>
          {entries.map((entry) => (
            <div key={entry.id} className="hosttool__row">
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(event) => updateEntry(entry.id, { enabled: event.target.checked })}
              />
              <input
                className="hosttool__input"
                placeholder="例如 127.0.0.1"
                value={entry.target}
                onChange={(event) => updateEntry(entry.id, { target: event.target.value })}
              />
              <input
                className="hosttool__input"
                placeholder="例如 api.example.dev"
                value={entry.domain}
                onChange={(event) => updateEntry(entry.id, { domain: event.target.value })}
              />
              <input
                className="hosttool__input"
                placeholder="可选备注"
                value={entry.comment}
                onChange={(event) => updateEntry(entry.id, { comment: event.target.value })}
              />
              <button className="hosttool__remove" type="button" onClick={() => removeEntry(entry.id)}>
                删除
              </button>
            </div>
          ))}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            className="hosttool__add"
            onClick={addEntry}
          >
            + 新增条目
          </motion.button>
        </div>

        <section className="hosttool__preview">
          <header>
            <h4>预览内容</h4>
            <span>{hostText.split("\n").filter(Boolean).length} 行</span>
          </header>
          <textarea className="hosttool__textarea" spellCheck={false} readOnly value={hostText} />
        </section>

        <section className="hosttool__note">
          <header>操作提示</header>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            spellCheck={false}
          />
        </section>
      </div>
    </div>
  );
}
