"use client";

import { ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { Variants } from "framer-motion";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Moon,
  Search,
  Star,
  LayoutGrid,
  Home,
  ChevronRight,
  Settings,
  Braces,
  Shield,
  Image as ImageIcon,
  Monitor,
  PenTool,
  Earth,
  Check,
  Box
} from "lucide-react";
import { modules, ModuleMeta, ToolMeta } from "./data/modules";
import { JsonParser } from "./features/json/JsonParser";
import { Md5Tool } from "./features/encryption/Md5Tool";
import { FileHashTool } from "./features/encryption/FileHashTool";
import { Base64Tool } from "./features/encryption/Base64Tool";
import { AesTool } from "./features/encryption/AesTool";
import { UrlCodecTool } from "./features/encryption/UrlCodecTool";
import { PayloadDiffTool } from "./features/devtools/PayloadDiffTool";
import { HostsTool } from "./features/system/HostsTool";
import { EnvVarTool } from "./features/system/EnvVarTool";
import { AwakeTool } from "./features/system/AwakeTool";
import { SvgPreviewTool } from "./features/icons/SvgPreviewTool";
import { IconConverterTool } from "./features/icons/IconConverterTool";
import { ScreenshotTool } from "./features/system/ScreenshotTool";
import { LanShareTool } from "./features/system/LanShareTool";
import { FileSearchTool } from "./features/system/FileSearchTool";
import { ColorPickerTool } from "./features/system/ColorPickerTool";
import { NetworkInspectorTool } from "./features/network/NetworkInspectorTool";
import { NetworkDoctorTool } from "./features/network/NetworkDoctorTool";
import { BaseConverterTool } from "./features/devtools/BaseConverterTool";
import { TimeConverterTool } from "./features/devtools/TimeConverterTool";
import { TodoTool } from "./features/productivity/TodoTool";
import { NotesTool } from "./features/productivity/NotesTool";

const toolRegistry: Record<string, ComponentType> = {
  "json-parser": JsonParser,
  md5: Md5Tool,
  "file-hash": FileHashTool,
  base64: Base64Tool,
  aes: AesTool,
  "url-codec": UrlCodecTool,
  "payload-diff": PayloadDiffTool,
  "host-manager": HostsTool,
  "env-editor": EnvVarTool,
  "stay-awake": AwakeTool,
  "region-screenshot": ScreenshotTool,
  "color-picker": ColorPickerTool,
  "svg-preview": SvgPreviewTool,
  "icon-converter": IconConverterTool,
  "lan-share": LanShareTool,
  "file-search": FileSearchTool,
  "network-inspector": NetworkInspectorTool,
  "network-doctor": NetworkDoctorTool,
  "radix-converter": BaseConverterTool,
  "time-converter": TimeConverterTool,
  todo: TodoTool,
  notes: NotesTool
};

const moduleIcons: Record<string, LucideIcon> = {
  Braces,
  Shield,
  Image: ImageIcon,
  Monitor,
  PenTool,
  Earth,
  Check
};

const FAVORITES_STORAGE_KEY = "chef-favorites";

function resolveInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = window.localStorage.getItem("chef-theme");
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  return prefersDark ? "dark" : "light";
}

const sidebarListVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } }
};

const launcherItem: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 350, damping: 25 }
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1 } }
};

const contentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 }
};

const toolGridVariants: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.94, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 220, damping: 26 }
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.98,
    filter: "blur(3px)",
    transition: { duration: 0.18, ease: "easeInOut" }
  }
};

type FavoriteToolRef = {
  moduleId: string;
  toolId: string;
};

type ReadyToolOption = {
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  moduleIcon: LucideIcon;
  accent: ModuleMeta["accent"];
  tool: ToolMeta;
};

type ActiveToolData = {
  module: ModuleMeta;
  tool: ToolMeta;
};

const categoryBase = [
  { id: "favorites", label: "我的收藏", icon: Star },
  { id: "all", label: "全部应用", icon: LayoutGrid }
];

function buildDefaultFavorites(): FavoriteToolRef[] {
  return modules
    .map<FavoriteToolRef | null>((module) => {
      const readyTool = module.tools.find((tool) => tool.status === "ready");
      return readyTool ? { moduleId: module.id, toolId: readyTool.id } : null;
    })
    .filter((value): value is FavoriteToolRef => value !== null)
    .slice(0, 4);
}

const isFavoriteSupported = (favorite: FavoriteToolRef) =>
  modules.some(
    (module) =>
      module.id === favorite.moduleId &&
      module.tools.some((tool) => tool.id === favorite.toolId && tool.status === "ready")
  );

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(resolveInitialTheme);
  const [searchTerm, setSearchTerm] = useState("");
  const [favoriteTools, setFavoriteTools] = useState<FavoriteToolRef[]>(() => buildDefaultFavorites());
  const [activeCategory, setActiveCategory] = useState<string>("favorites");
  const [activeToolRef, setActiveToolRef] = useState<FavoriteToolRef | null>(null);
  const [isMacPlatform, setIsMacPlatform] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedFavorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!storedFavorites) {
      return;
    }
    try {
      const parsed = JSON.parse(storedFavorites);
      if (!Array.isArray(parsed)) {
        return;
      }
      const next = parsed
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
      if (next.length) {
        setFavoriteTools(next);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    body.classList.remove("theme-dark", "theme-light");
    body.classList.add(`theme-${theme}`);
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("chef-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteTools));
  }, [favoriteTools]);

  useEffect(() => {
    setFavoriteTools((previous) => {
      const filtered = previous.filter(isFavoriteSupported);
      return filtered.length === previous.length ? previous : filtered;
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    const platform = navigator.userAgent || navigator.platform || "";
    setIsMacPlatform(/Mac|iPhone|iPad|iPod/i.test(platform));
  }, []);

  useEffect(() => {
    if (!activeToolRef) {
      return;
    }
    const module = modules.find((item) => item.id === activeToolRef.moduleId);
    const tool = module?.tools.find((item) => item.id === activeToolRef.toolId);
    if (!module || !tool) {
      setActiveToolRef(null);
    }
  }, [activeToolRef]);

  const readyToolOptions = useMemo<ReadyToolOption[]>(
    () =>
      modules.flatMap((module) =>
        module.tools
          .filter((tool) => tool.status === "ready")
          .map((tool) => ({
            moduleId: module.id,
            moduleName: module.name,
            moduleDescription: module.description,
            moduleIcon: moduleIcons[module.icon] ?? Box,
            accent: module.accent,
            tool
          }))
      ),
    []
  );

  const categories = useMemo(() => {
    const moduleCategories = modules.map((module) => ({
      id: module.id,
      label: module.name,
      icon: moduleIcons[module.icon] ?? Box
    }));
    return [...categoryBase, ...moduleCategories];
  }, []);

  useEffect(() => {
    if (categories.some((category) => category.id === activeCategory)) {
      return;
    }
    setActiveCategory("favorites");
  }, [categories, activeCategory]);

  const categoryCounts = useMemo(() => {
    const moduleCounts: Record<string, number> = {};
    readyToolOptions.forEach((option) => {
      moduleCounts[option.moduleId] = (moduleCounts[option.moduleId] ?? 0) + 1;
    });
    return {
      favorites: favoriteTools.length,
      all: readyToolOptions.length,
      ...moduleCounts
    } as Record<string, number>;
  }, [favoriteTools, readyToolOptions]);

  const filteredTools = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesCategory = (option: ReadyToolOption) => {
      if (activeCategory === "favorites") {
        return favoriteTools.some(
          (favorite) => favorite.moduleId === option.moduleId && favorite.toolId === option.tool.id
        );
      }
      if (activeCategory === "all") {
        return true;
      }
      return option.moduleId === activeCategory;
    };
    return readyToolOptions.filter((option) => {
      if (!matchesCategory(option)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const toolName = option.tool.name.toLowerCase();
      const description = option.tool.description.toLowerCase();
      const moduleName = option.moduleName.toLowerCase();
      return (
        toolName.includes(normalizedSearch) ||
        description.includes(normalizedSearch) ||
        moduleName.includes(normalizedSearch)
      );
    });
  }, [readyToolOptions, activeCategory, favoriteTools, searchTerm]);

  const activeTool = useMemo<ActiveToolData | undefined>(() => {
    if (!activeToolRef) {
      return undefined;
    }
    const module = modules.find((item) => item.id === activeToolRef.moduleId);
    const tool = module?.tools.find((item) => item.id === activeToolRef.toolId);
    if (!module || !tool) {
      return undefined;
    }
    return { module, tool };
  }, [activeToolRef]);

  const ActiveToolComponent = activeTool ? toolRegistry[activeTool.tool.id] : undefined;
  const isDark = theme === "dark";
  const activeCategoryLabel =
    categories.find((item) => item.id === activeCategory)?.label ?? "全部应用";
  const ActiveToolIcon = activeTool ? moduleIcons[activeTool.module.icon] ?? Box : undefined;

  const handleCategorySelect = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    setActiveToolRef(null);
    setSearchTerm("");
  }, []);

  const handleToggleFavorite = useCallback((option: ReadyToolOption) => {
    setFavoriteTools((previous) => {
      const exists = previous.some(
        (favorite) => favorite.moduleId === option.moduleId && favorite.toolId === option.tool.id
      );
      if (exists) {
        return previous.filter(
          (favorite) => !(favorite.moduleId === option.moduleId && favorite.toolId === option.tool.id)
        );
      }
      return [...previous, { moduleId: option.moduleId, toolId: option.tool.id }];
    });
  }, []);

  const handleSelectTool = useCallback((option: ReadyToolOption) => {
    setActiveToolRef({ moduleId: option.moduleId, toolId: option.tool.id });
  }, []);

  const handleBackHome = useCallback(() => {
    setActiveToolRef(null);
    setActiveCategory("favorites");
  }, []);

  const handleThemeToggle = useCallback(() => {
    setTheme((previous) => (previous === "dark" ? "light" : "dark"));
  }, []);

  const handleBreadcrumbModuleClick = useCallback(() => {
    if (!activeTool) {
      return;
    }
    setActiveToolRef(null);
    setActiveCategory(activeTool.module.id);
  }, [activeTool]);

  return (
    <div
      className={clsx(
        "flex h-screen w-full overflow-hidden font-sans antialiased transition-colors duration-500",
        isDark ? "bg-zinc-900 text-zinc-100" : "bg-zinc-50 text-zinc-900"
      )}
    >
      <motion.aside
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-56 border-r border-zinc-200 dark:border-zinc-700/60 flex flex-col bg-white/80 dark:bg-zinc-800/90 backdrop-blur-xl z-20"
      >
        <div className={clsx("px-4 pb-4", isMacPlatform ? "pt-10" : "pt-4")}>
          <div className="relative group">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-orange-500 transition-colors"
            />
            <input
              type="search"
              placeholder="Search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                if (activeToolRef) {
                  setActiveToolRef(null);
                }
              }}
              className="flex h-9 w-full rounded-lg border border-transparent bg-zinc-100 dark:bg-zinc-900/50 px-3 pl-9 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 focus-visible:border-orange-500/30 focus:bg-white dark:focus:bg-zinc-800 shadow-inner"
            />
          </div>
        </div>

        <div className="flex-1 px-3 overflow-y-auto custom-scrollbar">
          <motion.div variants={sidebarListVariants} initial="hidden" animate="show">
            <LayoutGroup>
              {categories.map((category) => (
                <SidebarItem
                  key={category.id}
                  icon={category.icon}
                  label={category.label}
                  count={categoryCounts[category.id] ?? 0}
                  active={activeCategory === category.id}
                  onClick={() => handleCategorySelect(category.id)}
                />
              ))}
            </LayoutGroup>
          </motion.div>
        </div>

        <div className="p-3 border-t border-zinc-200 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-600">v0.1.1</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleThemeToggle}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-all shadow-sm hover:shadow"
                title="切换主题"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <button
                type="button"
                onClick={() => handleCategorySelect("favorites")}
                className={clsx(
                  "p-1.5 rounded-md transition-all shadow-sm hover:shadow",
                  activeCategory === "favorites"
                    ? "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400"
                    : "hover:bg-white dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400"
                )}
                title="收藏"
              >
                <Settings size={14} />
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-zinc-50/50 dark:bg-zinc-900 relative transition-colors overflow-hidden">
        <header className="h-12 border-b border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between px-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xl z-10 sticky top-0">
          <div className="flex items-center text-sm text-zinc-500 gap-2">
            <button
              type="button"
              onClick={handleBackHome}
              className="hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-2 transition-colors group"
            >
              <Home size={16} className="group-hover:text-orange-500 transition-colors" />
            </button>
            <ChevronRight size={14} className="opacity-30" />
            {activeTool ? (
              <button
                type="button"
                onClick={handleBreadcrumbModuleClick}
                className="text-zinc-900 dark:text-zinc-100 font-medium bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md text-xs hover:bg-zinc-200/80 dark:hover:bg-zinc-700 transition-colors"
              >
                {activeTool.module.name}
              </button>
            ) : (
              <span
                className={clsx(
                  "transition-colors text-xs px-2 py-0.5 rounded-md",
                  "text-zinc-900 dark:text-zinc-100 font-medium bg-zinc-100 dark:bg-zinc-800"
                )}
              >
                {activeCategoryLabel}
              </span>
            )}
            <AnimatePresence>
              {activeTool && (
                <motion.div
                  key={activeTool.tool.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-2"
                >
                  <ChevronRight size={14} className="opacity-30" />
                  <span className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-1 rounded-md border border-orange-200 dark:border-orange-500/20">
                    {ActiveToolIcon && <ActiveToolIcon size={14} />}
                    {activeTool.tool.name}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </header>

        <main className="flex-1 min-h-0 overflow-auto p-6 custom-scrollbar relative z-0">
          <div className="max-w-7xl mx-auto h-full">
            <AnimatePresence mode="wait">
              {activeTool ? (
                <motion.div
                  key={activeTool.tool.id}
                  variants={contentVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="h-full flex flex-col"
                >
                  <div className="flex-1 min-h-0 rounded-2xl overflow-hidden">
                    <div className="h-full w-full">
                      {ActiveToolComponent ? (
                        <ActiveToolComponent />
                      ) : (
                        <Placeholder module={activeTool.module} tool={activeTool.tool} />
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <ToolLauncher
                  key="launcher"
                  tools={filteredTools}
                  favorites={favoriteTools}
                  activeCategory={activeCategory}
                  searchTerm={searchTerm}
                  onToggleFavorite={handleToggleFavorite}
                  onSelectTool={handleSelectTool}
                />
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

type SidebarItemProps = {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
};

function SidebarItem({ icon: Icon, label, count, active, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "relative group w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 mb-1 outline-none",
        active
          ? "text-orange-600 dark:text-orange-400"
          : "text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-orange-100 dark:bg-orange-500/10 rounded-lg"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <div className="relative flex items-center gap-3 z-10">
        <Icon
          size={18}
          className={clsx(
            "transition-colors",
            active
              ? "text-orange-600 dark:text-orange-400"
              : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
          )}
        />
        {label}
      </div>
      {count > 0 && (
        <span
          className={clsx(
            "relative z-10 text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors",
            active
              ? "bg-orange-200/50 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300"
              : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-500 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

type ToolLauncherProps = {
  tools: ReadyToolOption[];
  favorites: FavoriteToolRef[];
  activeCategory: string;
  searchTerm: string;
  onToggleFavorite: (option: ReadyToolOption) => void;
  onSelectTool: (option: ReadyToolOption) => void;
};

function ToolLauncher({ tools, favorites, activeCategory, searchTerm, onToggleFavorite, onSelectTool }: ToolLauncherProps) {
  const emptyMessage = useMemo(() => {
    if (searchTerm.trim()) {
      return "未找到相关工具";
    }
    if (activeCategory === "favorites") {
      return "暂无收藏工具";
    }
    return "该分类下暂无工具";
  }, [activeCategory, searchTerm]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={`${activeCategory}-${searchTerm ? "search" : "default"}`}
        variants={toolGridVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        className="space-y-6 pb-10"
      >
        <motion.div
          layout
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3"
        >
          <AnimatePresence mode="popLayout">
            {tools.map((option) => (
              <ToolCard
                key={`${option.moduleId}-${option.tool.id}`}
                option={option}
                isFavorite={favorites.some(
                  (favorite) => favorite.moduleId === option.moduleId && favorite.toolId === option.tool.id
                )}
                onToggleFavorite={() => onToggleFavorite(option)}
                onSelect={() => onSelectTool(option)}
              />
            ))}
          </AnimatePresence>
          {!tools.length && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-zinc-400">
              <Search size={48} className="mb-4 opacity-10" />
              <p className="text-sm font-medium">{emptyMessage}</p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

type ToolCardProps = {
  option: ReadyToolOption;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
};

function ToolCard({ option, isFavorite, onToggleFavorite, onSelect }: ToolCardProps) {
  const Icon = option.moduleIcon;
  return (
    <motion.div layout variants={launcherItem} initial="hidden" animate="show" exit="exit" className="relative">
      <motion.button
        type="button"
        onClick={onSelect}
        whileHover={{ y: -3, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.15)" }}
        whileTap={{ scale: 0.92 }}
        className="group w-full aspect-square flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600/50 hover:border-orange-300 dark:hover:border-orange-500/50 hover:shadow-md"
      >
        <div className="relative flex-shrink-0 w-10 h-10 mb-2 flex items-center justify-center rounded-lg bg-zinc-50 dark:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 group-hover:text-orange-500 dark:group-hover:text-orange-400 group-hover:bg-orange-50 dark:group-hover:bg-orange-500/10 transition-colors duration-200">
          <Icon size={20} />
        </div>
        <div className="w-full text-center px-0.5">
          <h3 className="font-bold text-xs text-zinc-700 dark:text-zinc-200 mb-0.5 truncate w-full group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
            {option.tool.name}
          </h3>
          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium leading-tight line-clamp-2 opacity-70 group-hover:opacity-100 transition-opacity">
            {option.tool.description}
          </p>
        </div>
      </motion.button>
      <motion.button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-2 right-2 p-1 rounded-full z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all duration-200"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Star
          size={12}
          className={clsx(
            "transition-colors duration-200",
            isFavorite ? "fill-orange-500 text-orange-500" : "text-zinc-400 hover:text-orange-400"
          )}
        />
      </motion.button>
    </motion.div>
  );
}

function Placeholder({ module, tool }: { module?: ModuleMeta; tool?: ToolMeta }) {
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
