import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  Copy,
  PenSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2
} from "lucide-react";

const NOTE_STORAGE_KEY = "chef-notes";

type NoteColor = "classic" | "linen" | "mint" | "midnight";

type Note = {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

const colorOptions: Record<
  NoteColor,
  {
    label: string;
    hint: string;
  }
> = {
  classic: {
    label: "米白纸",
    hint: "温润纸感"
  },
  linen: {
    label: "淡麻色",
    hint: "细腻纹理"
  },
  mint: {
    label: "雾薄荷",
    hint: "醒神灵感"
  },
  midnight: {
    label: "夜读",
    hint: "深色护眼"
  }
};

export function NotesTool() {
  const initialNotes = useMemo(() => loadNotesFromStorage(), []);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [markdownEnabled, setMarkdownEnabled] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!notes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !notes.some((note) => note.id === selectedId)) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId]);

  const selectedNote = useMemo(() => {
    if (!selectedId) {
      return null;
    }
    return notes.find((note) => note.id === selectedId) ?? null;
  }, [notes, selectedId]);

  const filteredNotes = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return [...notes]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        return b.updatedAt - a.updatedAt;
      })
      .filter((note) => {
        if (!normalized) {
          return true;
        }
        return (
          note.title.toLowerCase().includes(normalized) ||
          note.content.toLowerCase().includes(normalized)
        );
      });
  }, [notes, searchTerm]);

  const wordCount = useMemo(() => {
    if (!selectedNote) {
      return 0;
    }
    const titleCount = selectedNote.title.replace(/\s+/g, "").length;
    const contentCount = selectedNote.content.replace(/\s+/g, "").length;
    return titleCount + contentCount;
  }, [selectedNote]);

  const readingTime = Math.max(1, Math.round(wordCount / 350));

  const previewParagraphs = useMemo(() => {
    if (!selectedNote) {
      return [];
    }
    return selectedNote.content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .slice(0, 5);
  }, [selectedNote]);

  const handleCreateNote = useCallback(() => {
    const timestamp = Date.now();
    const newNote: Note = {
      id: cryptoRandomId(),
      title: "未命名笔记",
      content: "在这里继续书写，灵感会被自动保存。",
      color: selectedNote?.color ?? "classic",
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    setNotes((previous) => [newNote, ...previous]);
    setSelectedId(newNote.id);
  }, [selectedNote?.color]);

  const handleDeleteNote = useCallback(
    (id: string) => {
      setNotes((previous) => {
        const next = previous.filter((note) => note.id !== id);
        if (selectedId === id) {
          setSelectedId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [selectedId]
  );

  const handleUpdateSelected = useCallback(
    (updates: Partial<Pick<Note, "title" | "content" | "color">>) => {
      if (!selectedNote) {
        return;
      }
      setNotes((previous) =>
        previous.map((note) =>
          note.id === selectedNote.id
            ? { ...note, ...updates, updatedAt: Date.now() }
            : note
        )
      );
    },
    [selectedNote]
  );

  const handleDuplicate = useCallback(() => {
    if (!selectedNote) {
      return;
    }
    const timestamp = Date.now();
    const duplicate: Note = {
      ...selectedNote,
      id: cryptoRandomId(),
      title: `${selectedNote.title || "未命名笔记"} 副本`,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    setNotes((previous) => [duplicate, ...previous]);
    setSelectedId(duplicate.id);
  }, [selectedNote]);

  const handleTogglePin = useCallback((id: string) => {
    setNotes((previous) =>
      previous.map((note) =>
        note.id === id ? { ...note, pinned: !note.pinned, updatedAt: Date.now() } : note
      )
    );
  }, []);

  const handleShare = useCallback(async () => {
    if (!selectedNote) {
      return;
    }
    const payload = `# ${selectedNote.title}\n\n${selectedNote.content}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const area = document.createElement("textarea");
        area.value = payload;
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopyState("copied");
    } catch {
      setCopyState("idle");
    }
  }, [selectedNote]);

  if (!selectedNote) {
    return (
      <div className="note-tool__empty">
        <Sparkles size={20} />
        <p>创建第一条笔记，灵感将被自动保存。</p>
        <button type="button" onClick={handleCreateNote}>
          <Plus size={16} />
          新建笔记
        </button>
      </div>
    );
  }

  return (
    <div className="note-tool">
      <motion.section
        className="note-pad"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="note-pad__rings">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="note-pad__ring" />
          ))}
        </div>
        <div className="note-pad__paper">
          <div className="note-editor" data-theme={selectedNote.color}>
            <header className="note-editor__header">
              <div className="note-editor__brand">
                <span className="note-editor__logo">锤子便签</span>
                <PenSquare size={18} strokeWidth={1.8} />
              </div>
              <div className="note-editor__meta">
                <motion.button
                  type="button"
                  className={clsx("note-switch", markdownEnabled && "note-switch--active")}
                  onClick={() => setMarkdownEnabled((value) => !value)}
                  whileTap={{ scale: 0.94 }}
                >
                  <span>M</span>
                  Markdown
                </motion.button>
                <span className="note-editor__stat">共 {wordCount} 字</span>
                <span className="note-editor__stat">预计 {readingTime} 分钟读完</span>
              </div>
            </header>

            <div className="note-editor__form">
              <input
                type="text"
                className="note-editor__title"
                value={selectedNote.title}
                onChange={(event) => handleUpdateSelected({ title: event.target.value })}
                placeholder="在这里写下标题"
              />
              <textarea
                className="note-editor__textarea"
                value={selectedNote.content}
                onChange={(event) => handleUpdateSelected({ content: event.target.value })}
                rows={12}
                placeholder="像纸质笔记一样自由书写，支持 Markdown 语法。"
              />
            </div>

            <div className="note-palette">
              {Object.entries(colorOptions).map(([value, meta]) => (
                <motion.button
                  key={value}
                  type="button"
                  className={clsx(
                    "note-palette__item",
                    selectedNote.color === value && "note-palette__item--active"
                  )}
                  data-theme={value}
                  onClick={() => handleUpdateSelected({ color: value as NoteColor })}
                  whileTap={{ scale: 0.94 }}
                >
                  <span className="note-palette__dot" />
                  <div>
                    <strong>{meta.label}</strong>
                    <small>{meta.hint}</small>
                  </div>
                </motion.button>
              ))}
            </div>

            <div className="note-editor__actions">
              <div className="note-editor__actions-left">
                <motion.button
                  type="button"
                  className="note-action-button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDuplicate}
                >
                  <Copy size={16} />
                  生成副本
                </motion.button>
                <motion.button
                  type="button"
                  className="note-action-button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleShare}
                >
                  <Share2 size={16} />
                  {copyState === "copied" ? "已复制" : "复制内容"}
                </motion.button>
              </div>
              <motion.button
                type="button"
                className="note-action-button note-action-button--primary"
                whileTap={{ scale: 0.96 }}
                onClick={handleCreateNote}
              >
                <Sparkles size={16} />
                新建灵感
              </motion.button>
            </div>

            <div className="note-preview">
              <span className="note-preview__pin" />
              <div className="note-preview__frame">
                <div className="note-preview__sheet" data-theme={selectedNote.color}>
                  <h4>{selectedNote.title || "未命名笔记"}</h4>
                  {previewParagraphs.length ? (
                    previewParagraphs.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))
                  ) : (
                    <p>实时预览你的书写内容，生成锤子便签式的分享长图。</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="note-manager"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
      >
        <header className="note-manager__header">
          <div>
            <h3>笔记管理</h3>
            <p>像锤子便签一样排列整齐，可搜索、置顶与删除。</p>
          </div>
          <motion.button
            type="button"
            className="note-manager__new"
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateNote}
          >
            <Plus size={16} />
            新建
          </motion.button>
        </header>

        <div className="note-manager__search">
          <Search size={16} />
          <input
            type="text"
            placeholder="搜索标题或内容"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="note-list">
          <AnimatePresence initial={false}>
            {filteredNotes.length ? (
              filteredNotes.map((note) => (
                <motion.article
                  key={note.id}
                  className={clsx(
                    "note-card",
                    note.id === selectedNote.id && "note-card--active",
                    note.pinned && "note-card--pinned"
                  )}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setSelectedId(note.id)}
                >
                  <div className="note-card__heading">
                    <h4>{note.title || "未命名笔记"}</h4>
                    <motion.button
                      type="button"
                      className="note-pin"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleTogglePin(note.id);
                      }}
                      whileTap={{ scale: 0.85 }}
                      aria-label={note.pinned ? "取消置顶" : "置顶"}
                    >
                      {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </motion.button>
                  </div>
                  <p className="note-card__excerpt">
                    {note.content ? note.content.slice(0, 64) : "暂无内容"}
                  </p>
                  <div className="note-card__meta">
                    <span>{formatRelativeTime(note.updatedAt)}</span>
                    <motion.button
                      type="button"
                      className="note-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      whileTap={{ scale: 0.9 }}
                      aria-label="删除笔记"
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  </div>
                </motion.article>
              ))
            ) : (
              <motion.div
                className="note-list__empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Sparkles size={18} />
                <p>未找到匹配的笔记，换个关键词试试。</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}

function loadNotesFromStorage(): Note[] {
  if (typeof window === "undefined") {
    return [buildSeedNote()];
  }
  try {
    const stored = window.localStorage.getItem(NOTE_STORAGE_KEY);
    if (!stored) {
      return [buildSeedNote()];
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .filter((value): value is Partial<Note> => !!value && typeof value === "object")
        .map((value) => normalizeNote(value));
      return normalized.length ? normalized : [buildSeedNote()];
    }
    return [buildSeedNote()];
  } catch {
    return [buildSeedNote()];
  }
}

function buildSeedNote(): Note {
  const timestamp = Date.now();
  return {
    id: cryptoRandomId(),
    title: "锤子便签 · Markdown 试笔",
    content: [
      "锤子便签网页版已支持 Markdown 语言，它能够让分享图呈现更讲究的排版层次，比如标题、引用与列表。",
      "点击右上角的“以图片形式分享”即可生成经典的锤子便签长图，适合朋友圈或公告板分享。",
      "试试这些格式：",
      "### 标题\n使用 # 加空格在行首即可，数量代表层级。",
      "> 引用可以突出一段文字，适合摘录灵感。\n\n- 无序列表能快速罗列灵感\n- 也支持 * 或 + 的写法\n\n1. 有序列表用数字加点\n2. 适合安排步骤与时间线"
    ].join("\n\n"),
    color: "classic",
    pinned: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function normalizeNote(value: Partial<Note>): Note {
  const timestamp = typeof value.updatedAt === "number" ? value.updatedAt : Date.now();
  return {
    id: typeof value.id === "string" ? value.id : cryptoRandomId(),
    title: typeof value.title === "string" ? value.title : "",
    content: typeof value.content === "string" ? value.content : "",
    color: isNoteColor(value.color) ? value.color : "classic",
    pinned: Boolean(value.pinned),
    createdAt: typeof value.createdAt === "number" ? value.createdAt : timestamp,
    updatedAt: timestamp
  };
}

function isNoteColor(value: unknown): value is NoteColor {
  return value === "classic" || value === "linen" || value === "mint" || value === "midnight";
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) {
    return "刚刚";
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }
  return `${Math.floor(diff / day)} 天前`;
}
