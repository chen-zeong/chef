import {
  ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { Variants } from "framer-motion";
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
  Box,
  Globe2,
  Check,
  Home,
  Plus,
  Sparkles,
  Trash2,
  Monitor,
  PenTool,
  ArrowUpRight
} from "lucide-react";
import { modules, ModuleMeta, ToolMeta } from "./data/modules";
import { JsonParser } from "./features/json/JsonParser";
import { Md5Tool } from "./features/encryption/Md5Tool";
import { Base64Tool } from "./features/encryption/Base64Tool";
import { AesTool } from "./features/encryption/AesTool";
import { UrlCodecTool } from "./features/encryption/UrlCodecTool";
import { HostsTool } from "./features/system/HostsTool";
import { EnvVarTool } from "./features/system/EnvVarTool";
import { AwakeTool } from "./features/system/AwakeTool";
import { SvgPreviewTool } from "./features/icons/SvgPreviewTool";
import { IconConverterTool } from "./features/icons/IconConverterTool";

const toolRegistry: Record<string, ComponentType> = {
  "json-parser": JsonParser,
  md5: Md5Tool,
  base64: Base64Tool,
  aes: AesTool,
  "url-codec": UrlCodecTool,
  "host-manager": HostsTool,
  "env-editor": EnvVarTool,
  "stay-awake": AwakeTool,
  "svg-preview": SvgPreviewTool,
  "icon-converter": IconConverterTool
};

const fadeVariants = {
  initial: { opacity: 0, y: 16, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: 8, filter: "blur(4px)" }
};

const moduleIcons: Record<string, LucideIcon> = {
  Braces,
  Shield,
  Image: ImageIcon,
  Monitor,
  PenTool
};

const languageOptions = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" }
];

type LanguageCode = (typeof languageOptions)[number]["code"];

type FavoriteToolRef = {
  moduleId: string;
  toolId: string;
};

type ReadyToolOption = {
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  accent: ModuleMeta["accent"];
  tool: ToolMeta;
};

const FAVORITES_STORAGE_KEY = "chef-favorites";

function splitToolTitle(name: string): [string, string] {
  const trimmed = name.trim();
  if (!trimmed) {
    return ["", "\u00A0"];
  }
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex > 0) {
    const first = trimmed.slice(0, spaceIndex);
    const second = trimmed.slice(spaceIndex + 1).trim();
    return [first, second || "\u00A0"];
  }
  const mid = Math.ceil(trimmed.length / 2);
  const first = trimmed.slice(0, mid);
  const second = trimmed.slice(mid).trim();
  return [first, second || "\u00A0"];
}

const isFavoriteSupported = (favorite: FavoriteToolRef) =>
  modules.some(
    (module) =>
      module.id === favorite.moduleId &&
      module.tools.some((tool) => tool.id === favorite.toolId && tool.status === "ready")
  );

const navIconVariants = {
  expanded: { scale: 1, rotate: 0, boxShadow: "0 10px 22px rgba(215, 168, 90, 0.12)" },
  collapsed: { scale: 1, rotate: 0, boxShadow: "0 12px 22px rgba(215, 168, 90, 0.1)" }
};

const navTitleVariants = {
  expanded: {
    opacity: 1,
    x: 0,
    clipPath: "inset(0% 0% 0% 0%)",
    transitionEnd: { clipPath: "inset(0% 0% 0% 0%)" }
  },
  collapsed: {
    opacity: 0,
    x: -10,
    clipPath: "inset(0% 96% 0% 0%)",
    transitionEnd: { clipPath: "inset(0% 96% 0% 0%)" }
  }
};

const sidebarVariants: Variants = {
  expanded: {
    width: 216,
    padding: "1.4rem 1.15rem",
    boxShadow: "0 20px 48px rgba(15, 23, 42, 0.12)",
    borderRadius: "0 20px 20px 0",
    transition: { type: "spring", stiffness: 180, damping: 22, mass: 1 }
  },
  collapsed: {
    width: 88,
    padding: "1.4rem 0.85rem",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.1)",
    borderRadius: "0 16px 16px 0",
    transition: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 }
  }
};

export default function App() {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const langButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isHomeActive, setHomeActive] = useState(true);
  const [favoriteTools, setFavoriteTools] = useState<FavoriteToolRef[]>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return parsed
              .filter(
                (value: unknown): value is FavoriteToolRef =>
                  !!value &&
                  typeof value === "object" &&
                  "moduleId" in value &&
                  "toolId" in value &&
                  typeof (value as FavoriteToolRef).moduleId === "string" &&
                  typeof (value as FavoriteToolRef).toolId === "string"
              )
              .filter(isFavoriteSupported);
          }
        } catch {
          /* 忽略解析错误并回退到默认值 */
        }
      }
    }
    return modules
      .map<FavoriteToolRef | null>((module) => {
        const readyTool = module.tools.find((tool) => tool.status === "ready");
        return readyTool ? { moduleId: module.id, toolId: readyTool.id } : null;
      })
      .filter((value): value is FavoriteToolRef => value !== null)
      .slice(0, 4);
  });
  const [language, setLanguage] = useState<LanguageCode>(() => {
    if (typeof window === "undefined") {
      return languageOptions[0].code;
    }
    const stored = window.localStorage.getItem("chef-language");
    if (stored && languageOptions.some((option) => option.code === stored)) {
      return stored as LanguageCode;
    }
    return languageOptions[0].code;
  });
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
  const [isLangMenuOpen, setLangMenuOpen] = useState(false);

  useEffect(() => {
    const body = document.body;
    body.classList.remove("theme-dark", "theme-light");
    body.classList.add(`theme-${theme}`);
    window.localStorage.setItem("chef-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("chef-language", language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteTools));
  }, [favoriteTools]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (langMenuRef.current?.contains(target) || langButtonRef.current?.contains(target)) {
        return;
      }
      setLangMenuOpen(false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (langMenuRef.current?.contains(target) || langButtonRef.current?.contains(target)) {
        return;
      }
      setLangMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setFavoriteTools((previous) => {
      const filtered = previous.filter(isFavoriteSupported);
      return filtered.length === previous.length ? previous : filtered;
    });
  }, []);

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
    () =>
      isHomeActive ? undefined : modules.find((module) => module.id === activeModuleId),
    [isHomeActive, modules, activeModuleId]
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
  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeModule) {
      return;
    }
    const stillVisible = visibleTools.some((tool) => tool.id === activeToolId);
    if (!stillVisible && visibleTools.length > 0) {
      setActiveToolId(visibleTools[0].id);
    }
  }, [visibleTools, activeModule, activeToolId]);

  useEffect(() => {
    if (hoveredToolId && !visibleTools.some((tool) => tool.id === hoveredToolId)) {
      setHoveredToolId(null);
    }
  }, [visibleTools, hoveredToolId]);

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
  const readyToolOptions = useMemo<ReadyToolOption[]>(
    () =>
      modules.flatMap((module) =>
        module.tools
          .filter((tool) => tool.status === "ready")
          .map((tool) => ({
            moduleId: module.id,
            moduleName: module.name,
            moduleDescription: module.description,
            accent: module.accent,
            tool
          }))
      ),
    [modules]
  );
  const availableFavoriteOptions = useMemo(
    () =>
      readyToolOptions.filter(
        (option) =>
          !favoriteTools.some(
            (favorite) =>
              favorite.moduleId === option.moduleId && favorite.toolId === option.tool.id
          )
      ),
    [favoriteTools, readyToolOptions]
  );

  const PanelToggleIcon = isSidebarCollapsed ? PanelLeft : PanelLeftClose;
  const ThemeToggleIcon = theme === "dark" ? Sun : Moon;
  const highlightTargetId =
    isHomeActive
      ? null
      : (hoveredToolId &&
          visibleTools.find((tool) => tool.id === hoveredToolId && tool.status === "ready")?.id) ??
        visibleTools.find((tool) => tool.id === activeToolId && tool.status === "ready")?.id ??
        null;
  const toolkitSurfaceStyles: CSSProperties = useMemo(
    () =>
      ({
        "--toolkit-accent-from": activeModule?.accent.from ?? "rgba(110, 142, 255, 0.32)",
        "--toolkit-accent-to": activeModule?.accent.to ?? "rgba(142, 219, 255, 0.28)"
      }) as CSSProperties,
    [activeModule]
  );

  const handleActivateHome = useCallback(() => {
    setHomeActive(true);
  }, [setHomeActive]);

  const handleActivateModule = useCallback(
    (moduleId: string) => {
      setHomeActive(false);
      setActiveModuleId(moduleId);
    },
    [setActiveModuleId, setHomeActive]
  );

  const handleSelectTool = useCallback(
    (moduleId: string, toolId: string) => {
      setHomeActive(false);
      setActiveModuleId(moduleId);
      setActiveToolId(toolId);
      setSidebarCollapsed(false);
      setSearchTerm("");
    },
    [setActiveModuleId, setActiveToolId, setHomeActive, setSearchTerm, setSidebarCollapsed]
  );

  const handleLanguageSelect = useCallback((nextLanguage: LanguageCode) => {
    setLanguage(nextLanguage);
    setLangMenuOpen(false);
  }, [setLangMenuOpen, setLanguage]);

  const handleAddFavorite = useCallback((moduleId: string, toolId: string) => {
    setFavoriteTools((previous) => {
      if (previous.some((favorite) => favorite.moduleId === moduleId && favorite.toolId === toolId)) {
        return previous;
      }
      return [...previous, { moduleId, toolId }];
    });
  }, [setFavoriteTools]);

  const handleRemoveFavorite = useCallback((favorite: FavoriteToolRef) => {
    setFavoriteTools((previous) =>
      previous.filter(
        (item) => !(item.moduleId === favorite.moduleId && item.toolId === favorite.toolId)
      )
    );
  }, [setFavoriteTools]);

  const handleLaunchFavorite = useCallback(
    (favorite: FavoriteToolRef) => {
      handleSelectTool(favorite.moduleId, favorite.toolId);
    },
    [handleSelectTool]
  );

  return (
    <div className={clsx("shell", { "shell--collapsed": isSidebarCollapsed })}>
      <motion.aside
        className={clsx("nav", { "nav--collapsed": isSidebarCollapsed })}
        variants={sidebarVariants}
        animate={isSidebarCollapsed ? "collapsed" : "expanded"}
        initial={false}
        layout
      >
        <div className="nav__groups">
          <div className="nav__list">
            <motion.button
              type="button"
              className={clsx("nav__item", { "nav__item--active": isHomeActive })}
              onClick={handleActivateHome}
              whileTap={{ scale: 0.96 }}
              title="主页"
              aria-label="主页"
              layout
            >
              <motion.span
                className="nav__icon"
                aria-hidden
                variants={navIconVariants}
                animate={isSidebarCollapsed ? "collapsed" : "expanded"}
                transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                layout
              >
                <Home size={22} strokeWidth={1.8} />
              </motion.span>
              <motion.span
                className="nav__title"
                variants={navTitleVariants}
                initial="collapsed"
                animate={isSidebarCollapsed ? "collapsed" : "expanded"}
                transition={{
                  duration: 0.24,
                  ease: "easeOut",
                  clipPath: { duration: 0.26, ease: "easeOut" }
                }}
                style={{
                  WebkitClipPath: isSidebarCollapsed ? "inset(0% 96% 0% 0%)" : "inset(0% 0% 0% 0%)",
                  clipPath: isSidebarCollapsed ? "inset(0% 96% 0% 0%)" : "inset(0% 0% 0% 0%)",
                  transformOrigin: "left center"
                }}
              >
                主页
              </motion.span>
            </motion.button>
            {modules.map((module) => {
              const isActive = !isHomeActive && module.id === activeModuleId;
              const Icon = moduleIcons[module.icon] ?? Box;
              return (
                <motion.button
                  key={module.id}
                  type="button"
                  onClick={() => handleActivateModule(module.id)}
                  className={clsx("nav__item", { "nav__item--active": isActive })}
                  whileTap={{ scale: 0.96 }}
                  title={module.name}
                  aria-label={module.name}
                  layout
                >
                  <motion.span
                    className="nav__icon"
                    aria-hidden
                    variants={navIconVariants}
                    animate={isSidebarCollapsed ? "collapsed" : "expanded"}
                    transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                    layout
                  >
                    <Icon size={22} strokeWidth={1.8} />
                  </motion.span>
                  <motion.span
                    className="nav__title"
                    variants={navTitleVariants}
                    initial="collapsed"
                    animate={isSidebarCollapsed ? "collapsed" : "expanded"}
                    transition={{
                      duration: 0.24,
                      ease: "easeOut",
                      clipPath: { duration: 0.26, ease: "easeOut" }
                    }}
                    style={{
                      WebkitClipPath: isSidebarCollapsed
                        ? "inset(0% 96% 0% 0%)"
                        : "inset(0% 0% 0% 0%)",
                      clipPath: isSidebarCollapsed ? "inset(0% 96% 0% 0%)" : "inset(0% 0% 0% 0%)",
                      transformOrigin: "left center"
                    }}
                  >
                    {module.name}
                  </motion.span>
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
          <div className="topbar__center">
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
                  <motion.ul
                    className="topbar__search-results"
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {toolSearchResults.length > 0 ? (
                      toolSearchResults.map(({ moduleId, moduleName, tool }) => (
                        <motion.li
                          key={tool.id}
                          className="search-result"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ duration: 0.18 }}
                        >
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleSelectTool(moduleId, tool.id);
                            }}
                            className="search-result__button"
                          >
                            <span className="search-result__icon">{tool.name.slice(0, 1).toUpperCase()}</span>
                            <span className="search-result__texts">
                              <span className="search-result__title">{tool.name}</span>
                              <span className="search-result__meta">{moduleName}</span>
                            </span>
                            <span className="search-result__arrow">↗</span>
                          </button>
                        </motion.li>
                      ))
                    ) : (
                      <li className="search-result search-result--empty">暂未找到匹配的工具</li>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="topbar__info">
            <motion.button
              type="button"
              className="topbar__theme"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "切换到日间模式" : "切换到夜间模式"}
              whileTap={{ scale: 0.94 }}
              animate={{
                backgroundColor: theme === "dark" ? "rgba(34, 34, 46, 0.92)" : "rgba(255, 255, 255, 0.1)"
              }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  className="topbar__theme-icon"
                  key={theme}
                  initial={{ rotate: -20, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 20, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                >
                  <ThemeToggleIcon size={18} strokeWidth={1.8} />
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <div className="topbar__lang" ref={langMenuRef}>
              <motion.button
                type="button"
                className="topbar__lang-trigger"
                onClick={() => setLangMenuOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isLangMenuOpen}
                aria-label="选择界面语言"
                whileTap={{ scale: 0.96 }}
                ref={langButtonRef}
                animate={{
                  boxShadow: isLangMenuOpen
                    ? theme === "dark"
                      ? "0 20px 36px rgba(0, 0, 0, 0.55)"
                      : "0 18px 36px rgba(186, 196, 224, 0.28)"
                    : "none"
                }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={language}
                    className="topbar__lang-icon"
                    initial={{ rotate: -18, opacity: 0, scale: 0.6, color: "var(--icon-muted)" }}
                    animate={{
                      rotate: isLangMenuOpen ? 10 : 0,
                      opacity: 1,
                      scale: 1,
                      color: isLangMenuOpen ? "var(--accent)" : "var(--icon-muted)"
                    }}
                    exit={{ rotate: 18, opacity: 0, scale: 0.6, color: "var(--icon-muted)" }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                  >
                    <Globe2 size={16} strokeWidth={1.6} />
                  </motion.span>
                </AnimatePresence>
              </motion.button>
              <AnimatePresence>
                {isLangMenuOpen && (
                  <motion.ul
                    className="topbar__lang-menu"
                    role="listbox"
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <LayoutGroup>
                      {languageOptions.map((option) => {
                        const isActive = option.code === language;
                        return (
                          <motion.li
                            key={option.code}
                            role="option"
                            aria-selected={isActive}
                            className={clsx("topbar__lang-option", {
                              "topbar__lang-option--active": isActive
                            })}
                            layout
                          >
                            {isActive && (
                              <motion.span
                                className="topbar__lang-highlight"
                                layoutId="lang-option-highlight"
                                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => handleLanguageSelect(option.code)}
                            >
                              <span>{option.label}</span>
                              <AnimatePresence initial={false}>
                                {isActive && (
                                  <motion.span
                                    className="topbar__lang-check"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.16, ease: "easeOut" }}
                                  >
                                    <Check size={16} strokeWidth={1.8} />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </button>
                          </motion.li>
                        );
                      })}
                    </LayoutGroup>
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="workspace">
          {isHomeActive ? (
            <HomeDashboard
              favorites={favoriteTools}
              readyOptions={readyToolOptions}
              availableOptions={availableFavoriteOptions}
              onAddFavorite={handleAddFavorite}
              onRemoveFavorite={handleRemoveFavorite}
              onLaunchFavorite={handleLaunchFavorite}
            />
          ) : (
            <>
              <div className="workspace__tools" style={toolkitSurfaceStyles}>
                <LayoutGroup>
                  <div className="workspace__tools-list">
                    {visibleTools.map((tool) => {
                      const isActive = tool.id === activeToolId;
                      const disabled = tool.status !== "ready";
                      const matches = toolMatchesSearch(tool);
                      const [primaryTitle, secondaryTitle] = splitToolTitle(tool.name);
                      const accentStyles = {
                        "--card-accent-from": activeModule?.accent.from ?? "rgba(37, 99, 235, 0.1)",
                        "--card-accent-to": activeModule?.accent.to ?? "rgba(99, 102, 241, 0.14)"
                      } as CSSProperties;
                      const isHighlighting = highlightTargetId === tool.id && !disabled;
                      return (
                        <div key={tool.id} className="tool-card-wrapper" style={accentStyles}>
                          {isHighlighting && (
                            <motion.span
                              className="tool-card__halo"
                              layoutId="tool-card-shared-halo"
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.9 }}
                            />
                          )}
                          <motion.span
                            className="tool-card__glow"
                            aria-hidden
                            animate={{
                              opacity: disabled
                                ? 0
                                : hoveredToolId === tool.id
                                  ? 0.4
                                  : isActive
                                    ? 0.44
                                    : 0.22
                            }}
                            transition={{ duration: 0.28, ease: "easeOut" }}
                          />
                          <motion.button
                            type="button"
                            onClick={() => !disabled && setActiveToolId(tool.id)}
                            onMouseEnter={() => !disabled && setHoveredToolId(tool.id)}
                            onMouseLeave={() =>
                              setHoveredToolId((prev) => (prev === tool.id ? null : prev))
                            }
                            onFocus={() => !disabled && setHoveredToolId(tool.id)}
                            onBlur={() => setHoveredToolId((prev) => (prev === tool.id ? null : prev))}
                            className={clsx("tool-card", {
                              "tool-card--active": isActive,
                              "tool-card--disabled": disabled,
                              "tool-card--highlight": normalizedSearch && matches
                            })}
                            initial={false}
                            animate={{
                              scale: disabled
                                ? 1
                                : isActive
                                  ? 1.02
                                  : hoveredToolId === tool.id
                                    ? 1.01
                                    : 1,
                              opacity: disabled ? 0.42 : 1,
                              y: isActive ? -1 : hoveredToolId === tool.id ? -1 : 0
                            }}
                            whileHover={disabled ? undefined : { y: -1 }}
                            whileTap={{ scale: disabled ? 1 : 0.95 }}
                            layout
                            transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.9 }}
                          >
                            <div className="tool-card__header">
                              <span className="tool-card__name">
                                <span>{primaryTitle}</span>
                                <span>{secondaryTitle}</span>
                              </span>
                              {disabled ? (
                                <span className="tool-card__status">即将上线</span>
                              ) : null}
                            </div>
                          </motion.button>
                        </div>
                      );
                    })}
                    {!visibleTools.length && (
                      <div className="workspace__empty">暂未找到匹配的工具，请调整搜索关键字。</div>
                    )}
                  </div>
                </LayoutGroup>
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
            </>
          )}
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

type HomeDashboardProps = {
  favorites: FavoriteToolRef[];
  readyOptions: ReadyToolOption[];
  availableOptions: ReadyToolOption[];
  onAddFavorite: (moduleId: string, toolId: string) => void;
  onRemoveFavorite: (favorite: FavoriteToolRef) => void;
  onLaunchFavorite: (favorite: FavoriteToolRef) => void;
};

function HomeDashboard({
  favorites,
  readyOptions,
  availableOptions,
  onAddFavorite,
  onRemoveFavorite,
  onLaunchFavorite
}: HomeDashboardProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [pickerKeyword, setPickerKeyword] = useState("");
  const [isDeleteMode, setDeleteMode] = useState(false);

  const favoriteDetails = useMemo(() => {
    return favorites
      .map((favorite) => {
        const option = readyOptions.find(
          (item) => item.moduleId === favorite.moduleId && item.tool.id === favorite.toolId
        );
        if (!option) {
          return null;
        }
        return { favorite, option };
      })
      .filter((value): value is { favorite: FavoriteToolRef; option: ReadyToolOption } => value !== null);
  }, [favorites, readyOptions]);

  const filteredOptions = useMemo(() => {
    const keyword = pickerKeyword.trim().toLowerCase();
    if (!keyword) {
      return availableOptions;
    }
    return availableOptions.filter((option) => {
      const toolName = option.tool.name.toLowerCase();
      const moduleName = option.moduleName.toLowerCase();
      const description = option.tool.description.toLowerCase();
      return (
        toolName.includes(keyword) ||
        moduleName.includes(keyword) ||
        description.includes(keyword)
      );
    });
  }, [availableOptions, pickerKeyword]);

  const favoriteCount = favoriteDetails.length;

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerKeyword("");
  }, []);

  useEffect(() => {
    if (!availableOptions.length) {
      setPickerOpen(false);
      setPickerKeyword("");
    }
  }, [availableOptions.length]);

  useEffect(() => {
    if (!favoriteCount) {
      setDeleteMode(false);
    }
  }, [favoriteCount]);

  const handleAddToFavorites = useCallback(
    (option: ReadyToolOption) => {
      onAddFavorite(option.moduleId, option.tool.id);
    },
    [onAddFavorite]
  );

  return (
    <motion.section
      className="home"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="home__topbar">
        <div className="home__heading">
          <span className="home__section-title">收藏工具</span>
          <span className="home__section-count">共 {favoriteCount} 个</span>
        </div>
        <div className="home__actions">
          <motion.button
            type="button"
            className={clsx("home__manage-button", { "home__manage-button--active": isDeleteMode })}
            onClick={() => {
              setDeleteMode((prev) => {
                const next = !prev;
                if (next) {
                  handleClosePicker();
                }
                return next;
              });
            }}
            disabled={!favoriteCount}
            whileTap={favoriteCount ? { scale: 0.95 } : undefined}
          >
            <Trash2 size={15} strokeWidth={1.8} />
            <span>{isDeleteMode ? "完成" : "删除"}</span>
          </motion.button>
          <motion.button
            type="button"
            className="home__add-button"
            onClick={() => {
              setDeleteMode(false);
              setPickerOpen(true);
            }}
            disabled={!availableOptions.length}
            whileTap={availableOptions.length ? { scale: 0.95 } : undefined}
          >
            <Plus size={16} strokeWidth={1.8} />
            <span>添加工具</span>
          </motion.button>
        </div>
      </div>

      <div className="home__content">
        <motion.div
          className="home__favorites"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          {favoriteCount ? (
            <LayoutGroup>
              <motion.div className="home__favorites-grid" layout>
                {favoriteDetails.map(({ favorite, option }) => (
                  <motion.article
                    key={`${favorite.moduleId}-${favorite.toolId}`}
                    className={clsx("home-card", { "home-card--deleting": isDeleteMode })}
                    layout
                    style={
                      {
                        "--home-card-accent": option.accent.from ?? "rgba(110,142,255,0.35)",
                        "--home-card-tint": option.accent.to ?? "rgba(110,142,255,0.12)"
                      } as CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className="home-card__launch"
                      onClick={() => !isDeleteMode && onLaunchFavorite(favorite)}
                      disabled={isDeleteMode}
                    >
                      <div className="home-card__top">
                        <span className="home-card__title">{option.tool.name}</span>
                        <ArrowUpRight size={16} strokeWidth={1.8} className="home-card__icon" aria-hidden />
                      </div>
                      <p className="home-card__description">{option.tool.description}</p>
                      <div className="home-card__footer">
                        <span className="home-card__module">{option.moduleName}</span>
                      </div>
                    </button>
                    <AnimatePresence>
                      {isDeleteMode && (
                        <motion.button
                          key="remove"
                          type="button"
                          className="home-card__remove"
                          onClick={() => onRemoveFavorite(favorite)}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          whileTap={{ scale: 0.9 }}
                          aria-label={`移除 ${option.tool.name}`}
                        >
                          <X size={12} strokeWidth={1.8} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </motion.article>
                ))}
              </motion.div>
            </LayoutGroup>
          ) : (
            <div className="home__favorites-empty">
              <Sparkles size={18} strokeWidth={1.6} />
              <p>还没有常用工具，点击右上角的添加按钮挑选常用功能。</p>
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {isPickerOpen && (
          <motion.div
            className="home__picker"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="home__picker-header">
              <span>添加常用工具</span>
              <button type="button" onClick={handleClosePicker} aria-label="关闭选择器">
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="home__picker-search">
              <Search size={14} strokeWidth={1.6} />
              <input
                type="search"
                value={pickerKeyword}
                onChange={(event) => setPickerKeyword(event.target.value)}
                placeholder="搜索工具或模块"
              />
            </div>
            <div className="home__picker-list">
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={`${option.moduleId}-${option.tool.id}`}
                    type="button"
                    className="home__picker-item"
                    onClick={() => handleAddToFavorites(option)}
                  >
                    <div className="home__picker-item-texts">
                      <span className="home__picker-item-title">{option.tool.name}</span>
                      <span className="home__picker-item-meta">
                        {option.moduleName} · {option.tool.description}
                      </span>
                    </div>
                    <Plus size={14} strokeWidth={1.8} />
                  </button>
                ))
              ) : (
                <div className="home__picker-empty">没有更多工具可添加或搜索结果为空。</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
