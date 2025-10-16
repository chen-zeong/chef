import { ComponentType, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  PanelLeft,
  PanelLeftClose,
  Sun,
  Moon,
  Search,
  X,
  Braces,
  Shield,
  Image as ImageIcon,
  Box
} from "lucide-react";
import { modules, ModuleMeta, ToolMeta } from "./data/modules";
import { JsonParser } from "./features/json/JsonParser";
import { Md5Tool } from "./features/encryption/Md5Tool";

const toolRegistry: Record<string, ComponentType> = {
  "json-parser": JsonParser,
  md5: Md5Tool
};

const fadeVariants = {
  initial: { opacity: 0, y: 16, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: 8, filter: "blur(4px)" }
};

const moduleIcons: Record<string, LucideIcon> = {
  Braces,
  Shield,
  Image: ImageIcon
};

const sidebarVariants = {
  expanded: {
    width: 216,
    padding: "1.4rem 1.15rem",
    boxShadow: "0 20px 48px rgba(15, 23, 42, 0.12)",
    borderRadius: "0 20px 20px 0",
    transition: { type: "spring", stiffness: 180, damping: 22, mass: 1 }
  },
  collapsed: {
    width: 88,
    padding: "1.8rem 0.85rem",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.1)",
    borderRadius: "0 16px 16px 0",
    transition: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 }
  }
};

export default function App() {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = window.localStorage.getItem("chef-theme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return prefersDark ? "dark" : "light";
  });

  useEffect(() => {
    const body = document.body;
    body.classList.remove("theme-dark", "theme-light");
    body.classList.add(`theme-${theme}`);
    window.localStorage.setItem("chef-theme", theme);
  }, [theme]);

  const [activeModuleId, setActiveModuleId] = useState<string>(modules[0]?.id);

  useEffect(() => {
    if (!modules.length) {
      setActiveModuleId("");
      return;
    }
    const hasActive = modules.some((module) => module.id === activeModuleId);
    if (!hasActive) {
      setActiveModuleId(modules[0].id);
    }
  }, [modules, activeModuleId]);

  const activeModule = useMemo<ModuleMeta | undefined>(
    () => modules.find((module) => module.id === activeModuleId),
    [modules, activeModuleId]
  );

  const [activeToolId, setActiveToolId] = useState<string>(
    activeModule?.tools[0]?.id ?? ""
  );

  useEffect(() => {
    if (!activeModule) {
      setActiveToolId("");
      return;
    }
    const existingTool = activeModule.tools.find((tool) => tool.id === activeToolId);
    if (existingTool) {
      return;
    }
    const readyTool =
      activeModule.tools.find((tool) => tool.status === "ready") ?? activeModule.tools[0];
    if (readyTool) {
      setActiveToolId(readyTool.id);
    }
  }, [activeModule, activeToolId]);

  const toolMatchesSearch = (tool: ToolMeta) => {
    if (!normalizedSearch) {
      return true;
    }
    return (
      tool.name.toLowerCase().includes(normalizedSearch) ||
      tool.description.toLowerCase().includes(normalizedSearch)
    );
  };

  const visibleTools = useMemo(
    () => (activeModule ? activeModule.tools : []),
    [activeModule]
  );

  useEffect(() => {
    if (!activeModule) {
      return;
    }
    const stillVisible = visibleTools.some((tool) => tool.id === activeToolId);
    if (!stillVisible && visibleTools.length > 0) {
      setActiveToolId(visibleTools[0].id);
    }
  }, [visibleTools, activeModule, activeToolId]);

  const activeTool = useMemo<ToolMeta | undefined>(() => {
    if (!activeModule) {
      return undefined;
    }
    return activeModule.tools.find((tool) => tool.id === activeToolId);
  }, [activeModule, activeToolId]);

  const ActiveToolComponent = activeTool ? toolRegistry[activeTool.id] : undefined;
  const toolSearchResults = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }
    return modules
      .flatMap((module) =>
        module.tools.map((tool) => ({
          moduleId: module.id,
          moduleName: module.name,
          tool
        }))
      )
      .filter(({ tool }) => {
        const name = tool.name.toLowerCase();
        const description = tool.description.toLowerCase();
        return name.includes(normalizedSearch) || description.includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [modules, normalizedSearch]);

  const PanelToggleIcon = isSidebarCollapsed ? PanelLeft : PanelLeftClose;
  const ThemeToggleIcon = theme === "dark" ? Sun : Moon;

  const handleSelectTool = (moduleId: string, toolId: string) => {
    setActiveModuleId(moduleId);
    setActiveToolId(toolId);
    setSidebarCollapsed(false);
    setSearchTerm("");
  };
  return (
    <div className={clsx("shell", { "shell--collapsed": isSidebarCollapsed })}>
      <motion.aside
        className={clsx("nav", { "nav--collapsed": isSidebarCollapsed })}
        variants={sidebarVariants}
        animate={isSidebarCollapsed ? "collapsed" : "expanded"}
        initial={false}
        layout
      >
        <div className="nav__brand">
          <span className="nav__logo">Chef</span>
        </div>
        <div className="nav__groups">
          <AnimatePresence initial={false}>
            {!isSidebarCollapsed && (
              <motion.span
                className="nav__label"
                key="nav-label"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 0.7, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24 }}
              >
                功能模块
              </motion.span>
            )}
          </AnimatePresence>
          <div className="nav__list">
            {modules.map((module) => {
              const isActive = module.id === activeModuleId;
              const Icon = moduleIcons[module.icon] ?? Box;
              return (
                <motion.button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveModuleId(module.id)}
                  className={clsx("nav__item", { "nav__item--active": isActive })}
                  whileTap={{ scale: 0.96 }}
                  title={module.name}
                  aria-label={module.name}
                  layout
                >
                  <span className="nav__icon" aria-hidden>
                    <Icon size={22} strokeWidth={1.8} />
                  </span>
                  <AnimatePresence initial={false}>
                    {!isSidebarCollapsed && (
                      <motion.span
                        className="nav__title"
                        key={`${module.id}-title`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.18 }}
                      >
                        {module.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.aside>
      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__toggle"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <PanelToggleIcon size={18} strokeWidth={1.8} />
          </button>
          <div className="topbar__search">
            <Search size={16} strokeWidth={1.6} />
            <input
              type="search"
              placeholder="搜索工具..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")} aria-label="清除搜索">
                <X size={16} strokeWidth={1.8} />
              </button>
            )}
            <AnimatePresence>
              {searchTerm && (
                <motion.div
                  className="topbar__search-results"
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  {toolSearchResults.length > 0 ? (
                    toolSearchResults.map(({ moduleId, moduleName, tool }) => (
                      <motion.button
                        key={tool.id}
                        type="button"
                        className="search-result"
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.97 }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSelectTool(moduleId, tool.id);
                        }}
                      >
                        <span className="search-result__title">{tool.name}</span>
                        <span className="search-result__meta">{moduleName}</span>
                      </motion.button>
                    ))
                  ) : (
                    <div className="search-result search-result--empty">未找到匹配的工具</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="topbar__info">
            <button
              type="button"
              className="topbar__theme"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "切换到日间模式" : "切换到夜间模式"}
            >
              <ThemeToggleIcon size={18} strokeWidth={1.8} />
              <span>{theme === "dark" ? "夜间" : "日间"}</span>
            </button>
            <span className="topbar__status">
              <span className="topbar__dot" /> Tauri Dev
            </span>
            <div className="topbar__avatar">CZ</div>
          </div>
        </header>

        <main className="workspace">
          <div className="workspace__tools">
            <span className="workspace__tools-label">工具合集</span>
            <div className="workspace__tools-list">
              {visibleTools.map((tool) => {
                const isActive = tool.id === activeToolId;
                const disabled = tool.status !== "ready";
                const matches = toolMatchesSearch(tool);
                return (
                  <motion.button
                    key={tool.id}
                    type="button"
                    onClick={() => !disabled && setActiveToolId(tool.id)}
                    className={clsx("tool-card", {
                      "tool-card--active": isActive,
                      "tool-card--disabled": disabled,
                      "tool-card--highlight": normalizedSearch && matches
                    })}
                    whileTap={{ scale: disabled ? 1 : 0.97 }}
                  >
                    <span className="tool-card__name">{tool.name}</span>
                  </motion.button>
                );
              })}
              {!visibleTools.length && (
                <div className="workspace__empty">暂未找到匹配的工具，请调整搜索关键字。</div>
              )}
            </div>
          </div>

          <div className="workspace__panel">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool?.id ?? "placeholder"}
                variants={fadeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="workspace__content"
              >
                {ActiveToolComponent ? (
                  <ActiveToolComponent />
                ) : (
                  <Placeholder module={activeModule} tool={activeTool} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

type PlaceholderProps = {
  module?: ModuleMeta;
  tool?: ToolMeta;
};

function Placeholder({ module, tool }: PlaceholderProps) {
  return (
    <div className="placeholder">
      <motion.div
        className="placeholder__badge"
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ repeat: Infinity, duration: 2.6 }}
      >
        即将上线
      </motion.div>
      <h2>{tool?.name ?? module?.name ?? "敬请期待"}</h2>
      <p>{tool?.description ?? module?.description ?? "正在开发更多桌面工具组件。"}</p>
    </div>
  );
}
