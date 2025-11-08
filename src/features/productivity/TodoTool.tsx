import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import clsx from "clsx";
import {
  Calendar,
  CheckCircle2,
  Circle,
  Flame,
  Plus,
  Sparkles,
  Star,
  Trash2
} from "lucide-react";

const STORAGE_KEY = "chef-todos";

type TodoPriority = "low" | "medium" | "high";

type TodoItem = {
  id: string;
  title: string;
  note: string;
  priority: TodoPriority;
  due: string | null;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
};

type TodoFilter = "active" | "today" | "completed";

const priorityOptions: Record<
  TodoPriority,
  { label: string; badge: string; accent: string; glow: string }
> = {
  low: {
    label: "常规",
    badge: "todo-badge todo-badge--low",
    accent: "rgba(59,130,246,0.35)",
    glow: "rgba(59,130,246,0.2)"
  },
  medium: {
    label: "重要",
    badge: "todo-badge todo-badge--medium",
    accent: "rgba(234,179,8,0.45)",
    glow: "rgba(250,204,21,0.2)"
  },
  high: {
    label: "紧急",
    badge: "todo-badge todo-badge--high",
    accent: "rgba(248,113,113,0.55)",
    glow: "rgba(248,113,113,0.22)"
  }
};

const filterTabs: { value: TodoFilter; label: string }[] = [
  { value: "active", label: "进行中" },
  { value: "today", label: "今天" },
  { value: "completed", label: "已完成" }
];

export function TodoTool() {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isTodoItem);
    } catch {
      return [];
    }
  });
  const [filter, setFilter] = useState<TodoFilter>("active");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [due, setDue] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const completionRate = useMemo(() => {
    if (!todos.length) {
      return 0;
    }
    const completed = todos.filter((todo) => todo.completed).length;
    return Math.round((completed / todos.length) * 100);
  }, [todos]);

  const focusTodos = useMemo(() => {
    return todos
      .filter((todo) => !todo.completed)
      .sort((a, b) => sortByUrgency(a, b))
      .slice(0, 3);
  }, [todos]);

  const filteredTodos = useMemo(() => {
    switch (filter) {
      case "today":
        return todos.filter((todo) => !todo.completed && isToday(todo.due));
      case "completed":
        return todos.filter((todo) => todo.completed);
      default:
        return todos.filter((todo) => !todo.completed);
    }
  }, [filter, todos]);

  const sortedTodos = useMemo(() => {
    return [...filteredTodos].sort((a, b) => sortByUrgency(a, b));
  }, [filteredTodos]);

  const remainingToday = useMemo(() => {
    return todos.filter((todo) => !todo.completed && isToday(todo.due)).length;
  }, [todos]);

  const handleAddTodo = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        return;
      }
      const next: TodoItem = {
        id: cryptoRandomId(),
        title: trimmed,
        note: note.trim(),
        priority,
        due: due || null,
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setTodos((previous) => [next, ...previous]);
      setTitle("");
      setNote("");
      setDue("");
    },
    [due, note, priority, title]
  );

  const handleToggleTodo = useCallback((id: string) => {
    setTodos((previous) =>
      previous.map((todo) =>
        todo.id === id
          ? { ...todo, completed: !todo.completed, updatedAt: Date.now() }
          : todo
      )
    );
  }, []);

  const handleDeleteTodo = useCallback((id: string) => {
    setTodos((previous) => previous.filter((todo) => todo.id !== id));
  }, []);

  const handleCyclePriority = useCallback((id: string) => {
    setTodos((previous) =>
      previous.map((todo) =>
        todo.id === id
          ? { ...todo, priority: nextPriority(todo.priority), updatedAt: Date.now() }
          : todo
      )
    );
  }, []);

  const handleClearCompleted = useCallback(() => {
    setTodos((previous) => previous.filter((todo) => !todo.completed));
  }, []);

  const todayLabel = buildTodayLabel();

  return (
    <div className="todo-tool">
      <motion.header
        className="todo-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="todo-hero__content">
          <div className="todo-hero__eyebrow">效率工具 · {todayLabel}</div>
          <h2>待办事件</h2>
          <p>
            轻量的待办清单，适合记录灵感、拆解任务，搭配动画反馈让专注节奏更顺滑。
          </p>
          <div className="todo-hero__stats">
            <div>
              <span>今日剩余</span>
              <strong>{remainingToday}</strong>
            </div>
            <div>
              <span>总完成率</span>
              <strong>{completionRate}%</strong>
            </div>
          </div>
        </div>
        <motion.div
          className="todo-hero__meter"
          animate={{ rotate: [0, 2, -2, 0] }}
          transition={{ repeat: Infinity, repeatType: "loop", duration: 12, ease: "easeInOut" }}
        >
          <div className="todo-meter" style={{
            background: `conic-gradient(var(--accent-strong) ${completionRate}%, rgba(255,255,255,0.08) ${completionRate}% 100%)`
          }}>
            <span>{completionRate}%</span>
            <small>完成</small>
          </div>
          <AnimatePresence>
            {focusTodos.map((todo) => (
              <motion.div
                key={todo.id}
                className="todo-focus-chip"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <span className="todo-focus-chip__dot" style={{ background: priorityOptions[todo.priority].accent }} />
                <div>
                  <p>{todo.title}</p>
                  <small>{renderDueText(todo.due)}</small>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </motion.header>

      <div className="todo-layout">
        <motion.section
          className="todo-panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="todo-panel__header">
            <div>
              <h3>新增待办</h3>
              <p>写下任务标题与简要描述，选择优先级与到期时间。</p>
            </div>
            <Sparkles size={18} strokeWidth={1.8} />
          </div>
          <form className="todo-form" onSubmit={handleAddTodo}>
            <label>
              <span>标题</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：整理分享稿或者回访需求"
                required
              />
            </label>
            <label>
              <span>备注</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="补充拆解步骤、灵感或会议记录"
                rows={3}
              />
            </label>
            <div className="todo-form__row">
              <label>
                <span>截止</span>
                <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
              </label>
              <label>
                <span>优先级</span>
                <div className="todo-priority-picker">
                  {Object.entries(priorityOptions).map(([value, meta]) => (
                    <motion.button
                      key={value}
                      type="button"
                      className={clsx(
                        "todo-chip",
                        priority === value && "todo-chip--active"
                      )}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setPriority(value as TodoPriority)}
                    >
                      <span className="todo-chip__dot" style={{ background: meta.accent }} />
                      {meta.label}
                    </motion.button>
                  ))}
                </div>
              </label>
            </div>
            <motion.button
              type="submit"
              className="todo-submit"
              whileTap={{ scale: 0.98 }}
              disabled={!title.trim()}
            >
              <Plus size={16} strokeWidth={1.8} />
              添加任务
            </motion.button>
          </form>
        </motion.section>

        <motion.section
          className="todo-panel todo-panel--list"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="todo-panel__header">
            <div>
              <h3>待办列表</h3>
              <p>按照优先级、到期时间与完成状态自动排序。</p>
            </div>
            <button type="button" onClick={handleClearCompleted} className="todo-link" disabled={!todos.some((todo) => todo.completed)}>
              <Trash2 size={14} strokeWidth={1.8} />
              清空已完成
            </button>
          </div>
          <div className="todo-filters">
            <LayoutGroup>
              {filterTabs.map((tab) => (
                <motion.button
                  key={tab.value}
                  type="button"
                  className={clsx("todo-filter", filter === tab.value && "todo-filter--active")}
                  onClick={() => setFilter(tab.value)}
                  whileTap={{ scale: 0.96 }}
                  layout
                >
                  {tab.label}
                  {filter === tab.value && (
                    <motion.span
                      layoutId="todo-filter-indicator"
                      className="todo-filter__indicator"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.button>
              ))}
            </LayoutGroup>
          </div>

          <div className="todo-list">
            <AnimatePresence initial={false}>
              {sortedTodos.length ? (
                sortedTodos.map((todo) => (
                  <motion.article
                    key={todo.id}
                    className={clsx("todo-item", todo.completed && "todo-item--done")}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.9 }}
                  >
                    <motion.button
                      type="button"
                      className="todo-item__toggle"
                      onClick={() => handleToggleTodo(todo.id)}
                      whileTap={{ scale: 0.9 }}
                      aria-label={todo.completed ? "标记为待办" : "标记为完成"}
                    >
                      {todo.completed ? (
                        <CheckCircle2 size={22} strokeWidth={2} />
                      ) : (
                        <Circle size={22} strokeWidth={2} />
                      )}
                    </motion.button>
                    <div className="todo-item__body">
                      <div className="todo-item__title-row">
                        <h4>{todo.title}</h4>
                        <span className={priorityOptions[todo.priority].badge}>{priorityOptions[todo.priority].label}</span>
                      </div>
                      {todo.note && <p>{todo.note}</p>}
                      <div className="todo-item__meta">
                        <span className={clsx("todo-item__due", todo.completed && "todo-item__due--muted")}> 
                          <Calendar size={14} strokeWidth={1.8} />
                          {renderDueText(todo.due)}
                        </span>
                        <div className="todo-item__actions">
                          <motion.button
                            type="button"
                            className="todo-action"
                            onClick={() => handleCyclePriority(todo.id)}
                            whileTap={{ scale: 0.92 }}
                            aria-label="切换优先级"
                          >
                            <Flame size={14} strokeWidth={1.8} />
                            提升优先级
                          </motion.button>
                          <motion.button
                            type="button"
                            className="todo-action"
                            onClick={() => handleDeleteTodo(todo.id)}
                            whileTap={{ scale: 0.92 }}
                            aria-label="删除待办"
                          >
                            <Trash2 size={14} strokeWidth={1.8} />
                            删除
                          </motion.button>
                        </div>
                      </div>
                    </div>
                    {!todo.completed && (
                      <motion.span
                        className="todo-item__glow"
                        layoutId={`todo-glow-${todo.id}`}
                        style={{ background: priorityOptions[todo.priority].glow }}
                        initial={{ opacity: 0, scaleX: 0.9 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    )}
                  </motion.article>
                ))
              ) : (
                <motion.div
                  className="todo-empty"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Star size={22} strokeWidth={1.6} />
                  <div>
                    <h4>这里暂时空空如也</h4>
                    <p>写下第一个任务或调整筛选条件吧。</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function sortByUrgency(a: TodoItem, b: TodoItem) {
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }
  if (a.priority !== b.priority) {
    return priorityWeight(b.priority) - priorityWeight(a.priority);
  }
  const aDue = normalizedDueTime(a.due);
  const bDue = normalizedDueTime(b.due);
  if (aDue !== bDue) {
    return aDue - bDue;
  }
  return b.updatedAt - a.updatedAt;
}

function normalizedDueTime(value: string | null) {
  if (!value) {
    return Infinity;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Infinity : timestamp;
}

function priorityWeight(priority: TodoPriority) {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function isToday(value: string | null) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function renderDueText(value: string | null) {
  if (!value) {
    return "未设置截止";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日期无效";
  }
  const today = new Date();
  const diff = startOfDay(date).getTime() - startOfDay(today).getTime();
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  if (days === 0) {
    return "今天";
  }
  if (days === 1) {
    return "明天";
  }
  if (days === -1) {
    return "昨天";
  }
  if (days > 1) {
    return `${days} 天后`;
  }
  return `${Math.abs(days)} 天前`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildTodayLabel() {
  const date = new Date();
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function nextPriority(priority: TodoPriority): TodoPriority {
  if (priority === "low") {
    return "medium";
  }
  if (priority === "medium") {
    return "high";
  }
  return "low";
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function isTodoItem(value: unknown): value is TodoItem {
  return !!value && typeof value === "object" && "id" in value && "title" in value;
}
