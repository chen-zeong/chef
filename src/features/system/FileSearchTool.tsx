import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_BLOCK,
  PANEL_CONTAINER,
  PANEL_DESCRIPTION,
  PANEL_HEADER,
  PANEL_INPUT,
  PANEL_LABEL,
  PANEL_RESULT,
  PANEL_TITLE
} from "../../ui/styles";
import { CheckCircle2, Copy, FolderOpen, Loader2, RefreshCcw, Search, X } from "lucide-react";

type SizeUnit = "B" | "KB" | "MB" | "GB" | "TB";

type FileSearchHit = {
  path: string;
  fileName: string;
  parentDir: string;
  isDir: boolean;
  size?: number;
  modified?: number;
};

type FileSearchResponse = {
  hits: FileSearchHit[];
  durationMs: number;
  baseLocation: string;
};

type SizeFilterPayload = {
  value: number;
  unit: SizeUnit;
};

const MAX_RESULTS = 2000;
const SIZE_UNITS: SizeUnit[] = ["B", "KB", "MB", "GB", "TB"];

export function FileSearchTool() {
  const [query, setQuery] = useState("");
  const [basePath, setBasePath] = useState("");
  const [extraPaths, setExtraPaths] = useState<string[]>([]);
  const [limitInput, setLimitInput] = useState("200");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMinUnit, setSizeMinUnit] = useState<SizeUnit>("MB");
  const [sizeMax, setSizeMax] = useState("");
  const [sizeMaxUnit, setSizeMaxUnit] = useState<SizeUnit>("GB");
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [modifiedAfter, setModifiedAfter] = useState("");
  const [modifiedBefore, setModifiedBefore] = useState("");
  const [isSizeModalOpen, setSizeModalOpen] = useState(false);
  const [isCreatedModalOpen, setCreatedModalOpen] = useState(false);
  const [isModifiedModalOpen, setModifiedModalOpen] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [result, setResult] = useState<FileSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    homeDir()
      .then((dir) => {
        if (mounted && !basePath) {
          setBasePath(dir.replace(/\/$/, ""));
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [basePath]);

  useEffect(() => {
    if (!copiedPath) return;
    const timer = window.setTimeout(() => setCopiedPath(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedPath]);

  const limitValue = useMemo(() => {
    const parsed = parseInt(limitInput, 10);
    return Number.isFinite(parsed) ? Math.min(parsed, MAX_RESULTS) : undefined;
  }, [limitInput]);

  const handlePickBase = useCallback(async () => {
    try {
      const selection = await invoke<string[]>("pick_search_directories", {
        multiple: false,
        defaultPath: basePath || undefined
      });
      if (Array.isArray(selection) && selection[0]) {
        setBasePath(selection[0]);
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "无法打开目录选择器。");
    }
  }, [basePath]);

  const handleAddExtraPath = useCallback(async () => {
    try {
      const selection = await invoke<string[]>("pick_search_directories", {
        multiple: true,
        defaultPath: basePath || undefined
      });

      if (!selection || selection.length === 0) return;

      setExtraPaths((previous) => {
        const existing = new Set(previous);
        selection.forEach((path) => {
          if (path && path.trim() && !existing.has(path)) {
            existing.add(path);
          }
        });
        return Array.from(existing);
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "无法选择额外目录。");
    }
  }, [basePath]);

  const handleRemoveExtra = useCallback((target: string) => {
    setExtraPaths((paths) => paths.filter((path) => path !== target));
  }, []);

  const clearSizeFilter = useCallback(() => {
    setSizeMin("");
    setSizeMinUnit("MB");
    setSizeMax("");
    setSizeMaxUnit("GB");
  }, []);

  const clearCreatedFilter = useCallback(() => {
    setCreatedAfter("");
    setCreatedBefore("");
  }, []);

  const clearModifiedFilter = useCallback(() => {
    setModifiedAfter("");
    setModifiedBefore("");
  }, []);

  const formatBytes = useCallback((value?: number) => {
    if (!value || value <= 0) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / 1024 ** exponent;
    return `${size.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  }, []);

  const formatDate = useCallback((timestamp?: number) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }, []);

  const formatTimeLabel = useCallback((value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }, []);

  const buildTimeSummary = useCallback(
    (afterValue: string, beforeValue: string) => {
      if (!afterValue && !beforeValue) {
        return "未设置";
      }
      if (afterValue && beforeValue) {
        return `${formatTimeLabel(afterValue)} ~ ${formatTimeLabel(beforeValue)}`;
      }
      if (afterValue) {
        return `≥ ${formatTimeLabel(afterValue)}`;
      }
      return `≤ ${formatTimeLabel(beforeValue)}`;
    },
    [formatTimeLabel]
  );

  const convertToBytes = useCallback((value: number, unit: SizeUnit) => {
    const index = SIZE_UNITS.indexOf(unit);
    if (index <= 0) return Math.round(value);
    return Math.round(value * 1024 ** index);
  }, []);

  const buildSizeFilter = useCallback((value: string, unit: SizeUnit): SizeFilterPayload | undefined => {
    if (!value.trim()) return undefined;
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }
    return { value: parsed, unit };
  }, []);

  const parseDateInput = useCallback((value: string) => {
    if (!value) return undefined;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp) || timestamp <= 0) {
      return undefined;
    }
    return Math.round(timestamp);
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopiedPath(path);
      return;
    }
    navigator.clipboard
      .writeText(path)
      .then(() => setCopiedPath(path))
      .catch(() => setCopiedPath(path));
  }, []);

  const sizeSummary = useMemo(() => {
    if (!sizeMin && !sizeMax) {
      return "未设置";
    }
    if (sizeMin && sizeMax) {
      return `${sizeMin}${sizeMinUnit} ~ ${sizeMax}${sizeMaxUnit}`;
    }
    if (sizeMin) {
      return `≥ ${sizeMin}${sizeMinUnit}`;
    }
    return `≤ ${sizeMax}${sizeMaxUnit}`;
  }, [sizeMax, sizeMaxUnit, sizeMin, sizeMinUnit]);

  const createdSummary = useMemo(
    () => buildTimeSummary(createdAfter, createdBefore),
    [buildTimeSummary, createdAfter, createdBefore]
  );

  const modifiedSummary = useMemo(
    () => buildTimeSummary(modifiedAfter, modifiedBefore),
    [buildTimeSummary, modifiedAfter, modifiedBefore]
  );

  const hasSizeFilter = Boolean(sizeMin || sizeMax);
  const hasCreatedFilter = Boolean(createdAfter || createdBefore);
  const hasModifiedFilter = Boolean(modifiedAfter || modifiedBefore);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setError("请输入搜索关键字。");
      return;
    }

    const sizeMinFilter = buildSizeFilter(sizeMin, sizeMinUnit);
    const sizeMaxFilter = buildSizeFilter(sizeMax, sizeMaxUnit);
    const sizeMinValue =
      sizeMinFilter !== undefined ? convertToBytes(sizeMinFilter.value, sizeMinFilter.unit) : undefined;
    const sizeMaxValue =
      sizeMaxFilter !== undefined ? convertToBytes(sizeMaxFilter.value, sizeMaxFilter.unit) : undefined;
    if (sizeMinValue !== undefined && sizeMaxValue !== undefined && sizeMinValue > sizeMaxValue) {
      setError("最小文件体积不能大于最大文件体积。");
      return;
    }

    const createdAfterValue = parseDateInput(createdAfter);
    const createdBeforeValue = parseDateInput(createdBefore);
    if (
      createdAfterValue !== undefined &&
      createdBeforeValue !== undefined &&
      createdAfterValue > createdBeforeValue
    ) {
      setError("创建时间的开始不能晚于结束。");
      return;
    }

    const modifiedAfterValue = parseDateInput(modifiedAfter);
    const modifiedBeforeValue = parseDateInput(modifiedBefore);
    if (
      modifiedAfterValue !== undefined &&
      modifiedBeforeValue !== undefined &&
      modifiedAfterValue > modifiedBeforeValue
    ) {
      setError("修改时间的开始不能晚于结束。");
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const payload = {
        query,
        location: basePath.trim() || undefined,
        moreLocations: extraPaths,
        limit: limitValue,
        sizeMin: sizeMinFilter,
        sizeMax: sizeMaxFilter,
        createdAfter: createdAfterValue,
        createdBefore: createdBeforeValue,
        modifiedAfter: modifiedAfterValue,
        modifiedBefore: modifiedBeforeValue
      };

      const response = await invoke<FileSearchResponse>("search_files", { options: payload });
      setResult(response);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "搜索失败，请稍后再试。");
    } finally {
      setSearching(false);
    }
  }, [
    basePath,
    extraPaths,
    limitValue,
    parseDateInput,
    buildSizeFilter,
    convertToBytes,
    sizeMax,
    sizeMaxUnit,
    sizeMin,
    sizeMinUnit,
    query,
    createdAfter,
    createdBefore,
    modifiedAfter,
    modifiedBefore
  ]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (isSearching) return;
      void handleSearch();
    },
    [handleSearch, isSearching]
  );

  const resetForm = useCallback(() => {
    setQuery("");
    setExtraPaths([]);
    setLimitInput("200");
    clearSizeFilter();
    clearCreatedFilter();
    clearModifiedFilter();
    setSizeModalOpen(false);
    setCreatedModalOpen(false);
    setModifiedModalOpen(false);
    setResult(null);
    setError(null);
  }, [clearCreatedFilter, clearModifiedFilter, clearSizeFilter]);

  const hasResults = result && result.hits.length > 0;

  return (
    <section className={clsx(PANEL_CONTAINER, "gap-6")}>
      <header className={PANEL_HEADER}>
        <div>
          <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">System Search</span>
          <h3 className={PANEL_TITLE}>全局文件搜索</h3>
          <p className={PANEL_DESCRIPTION}>依托 rust_search 快速定位文件，可配置根目录、结果数与体积 / 时间筛选条件。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.97 }} onClick={resetForm}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            重置
          </motion.button>
          <motion.button
            type="button"
            className={clsx(BUTTON_PRIMARY, "min-w-[120px]")}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              void handleSearch();
            }}
            disabled={isSearching}
          >
            {isSearching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                搜索中…
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                开始搜索
              </>
            )}
          </motion.button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <form
          className="flex flex-col gap-6 rounded-2xl border border-[color:var(--border-subtle)] bg-white/80 p-5 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div className={clsx(PANEL_BLOCK, "gap-4")}>
            <label className={PANEL_LABEL}>搜索关键字</label>
            <input
              className={PANEL_INPUT}
              placeholder="请输入文件名或关键字"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="grid gap-4">
            <div className={PANEL_BLOCK}>
              <label className={PANEL_LABEL}>根目录</label>
              <div className="flex flex-wrap gap-3">
                <input
                  className={clsx(PANEL_INPUT, "flex-1 min-w-[240px]")}
                  placeholder="例如 /Users/alice"
                  value={basePath}
                  onChange={(event) => setBasePath(event.target.value)}
                />
                <motion.button
                  type="button"
                  className={BUTTON_GHOST}
                  whileTap={{ scale: 0.97 }}
                  onClick={handlePickBase}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  选择文件夹
                </motion.button>
              </div>
            </div>

            <div>
              <label className={PANEL_LABEL}>最大结果数</label>
              <input
                type="number"
                min={1}
                max={MAX_RESULTS}
                className={PANEL_INPUT}
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
              />
            </div>
          </div>

          <div className={PANEL_BLOCK}>
            <div className="flex items-center justify-between">
              <label className={PANEL_LABEL}>额外检索目录</label>
              <motion.button
                type="button"
                className={BUTTON_GHOST}
                whileTap={{ scale: 0.97 }}
                onClick={handleAddExtraPath}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                添加目录
              </motion.button>
            </div>
            {extraPaths.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)]">尚未指定额外范围，默认仅搜索根目录。</p>
            )}
            {extraPaths.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {extraPaths.map((path) => (
                  <span
                    key={path}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                  >
                    <span className="max-w-[220px] truncate" title={path}>
                      {path}
                    </span>
                    <button
                      type="button"
                      className="text-[var(--text-tertiary)] transition hover:text-[var(--negative)]"
                      onClick={() => handleRemoveExtra(path)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={clsx(
                "flex min-h-[96px] flex-col rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-white",
                hasSizeFilter && "border-[var(--accent)] shadow-[0_10px_30px_rgba(37,99,235,0.08)]"
              )}
              onClick={() => setSizeModalOpen(true)}
            >
              <span className="text-sm font-semibold text-[var(--text-primary)]">体积筛选</span>
              <span className={clsx("text-xs", hasSizeFilter ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}>
                {sizeSummary}
              </span>
            </button>
            <button
              type="button"
              className={clsx(
                "flex min-h-[96px] flex-col rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-white",
                hasCreatedFilter && "border-[var(--accent)] shadow-[0_10px_30px_rgba(37,99,235,0.08)]"
              )}
              onClick={() => setCreatedModalOpen(true)}
            >
              <span className="text-sm font-semibold text-[var(--text-primary)]">创建时间筛选</span>
              <span
                className={clsx("text-xs", hasCreatedFilter ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}
              >
                {createdSummary}
              </span>
            </button>
            <button
              type="button"
              className={clsx(
                "flex min-h-[96px] flex-col rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-white",
                hasModifiedFilter && "border-[var(--accent)] shadow-[0_10px_30px_rgba(37,99,235,0.08)]"
              )}
              onClick={() => setModifiedModalOpen(true)}
            >
              <span className="text-sm font-semibold text-[var(--text-primary)]">修改时间筛选</span>
              <span
                className={clsx("text-xs", hasModifiedFilter ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}
              >
                {modifiedSummary}
              </span>
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-[rgba(220,38,38,0.25)] bg-[rgba(254,226,226,0.4)] px-4 py-3 text-sm text-[var(--negative)]">
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            className={clsx(BUTTON_PRIMARY, "w-full justify-center text-base")}
            whileTap={{ scale: 0.98 }}
            disabled={isSearching}
          >
            {isSearching ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                正在检索…
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                立即搜索
              </>
            )}
          </motion.button>
        </form>

        <div className="flex h-full flex-col gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">搜索结果</p>
              <p className="text-xs text-[var(--text-tertiary)]">{result ? `使用路径 ${result.baseLocation}` : "等待搜索…"}</p>
            </div>
            {result && (
              <div className="text-xs text-[var(--text-tertiary)]">
                <span className="mr-4">耗时 {result.durationMs} ms</span>
                <span>命中 {result.hits.length} 条</span>
              </div>
            )}
          </header>

          {!hasResults && (
            <div className={PANEL_RESULT}>
              <p className="text-sm text-[var(--text-tertiary)]">暂无结果，试试更短的关键字或调整检索范围。</p>
            </div>
          )}

          {hasResults && (
            <ul className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
              {result!.hits.map((hit) => (
                <li
                  key={hit.path}
                  className="flex flex-col gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-white/80 px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{hit.fileName}</p>
                      <p className="text-xs text-[var(--text-tertiary)]" title={hit.parentDir}>
                        {hit.parentDir}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-bg)] p-1 text-[var(--text-tertiary)] transition hover:text-[var(--accent)]"
                        onClick={() => handleCopyPath(hit.path)}
                      >
                        {copiedPath === hit.path ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                    <span>类型：{hit.isDir ? "文件夹" : "文件"}</span>
                    <span>大小：{hit.isDir ? "-" : formatBytes(hit.size)}</span>
                    <span>修改时间：{formatDate(hit.modified)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <FilterModal
        open={isSizeModalOpen}
        title="体积筛选"
        description="设置最小与最大体积，支持 B / KB / MB / GB / TB"
        onClose={() => setSizeModalOpen(false)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={PANEL_LABEL}>最小体积</p>
            <div className="mt-2 flex gap-2">
              <input
                className={clsx(PANEL_INPUT, "flex-1 min-w-[150px]")}
                type="number"
                min={0}
                placeholder="如 10"
                value={sizeMin}
                onChange={(event) => setSizeMin(event.target.value)}
              />
              <select
                className={clsx(PANEL_INPUT, "w-28 min-w-[110px]")}
                value={sizeMinUnit}
                onChange={(event) => setSizeMinUnit(event.target.value as SizeUnit)}
              >
                {SIZE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className={PANEL_LABEL}>最大体积</p>
            <div className="mt-2 flex gap-2">
              <input
                className={clsx(PANEL_INPUT, "flex-1 min-w-[150px]")}
                type="number"
                min={0}
                placeholder="如 200"
                value={sizeMax}
                onChange={(event) => setSizeMax(event.target.value)}
              />
              <select
                className={clsx(PANEL_INPUT, "w-28 min-w-[110px]")}
                value={sizeMaxUnit}
                onChange={(event) => setSizeMaxUnit(event.target.value as SizeUnit)}
              >
                {SIZE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-between gap-3">
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.97 }} onClick={clearSizeFilter}>
            清空条件
          </motion.button>
          <motion.button type="button" className={BUTTON_PRIMARY} whileTap={{ scale: 0.97 }} onClick={() => setSizeModalOpen(false)}>
            完成
          </motion.button>
        </div>
      </FilterModal>

      <FilterModal
        open={isCreatedModalOpen}
        title="创建时间筛选"
        description="选择开始 / 结束时间范围"
        onClose={() => setCreatedModalOpen(false)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={PANEL_LABEL}>不早于</p>
            <input
              type="datetime-local"
              className={clsx(PANEL_INPUT, "mt-2")}
              value={createdAfter}
              onChange={(event) => setCreatedAfter(event.target.value)}
            />
          </div>
          <div>
            <p className={PANEL_LABEL}>不晚于</p>
            <input
              type="datetime-local"
              className={clsx(PANEL_INPUT, "mt-2")}
              value={createdBefore}
              onChange={(event) => setCreatedBefore(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-between gap-3">
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.97 }} onClick={clearCreatedFilter}>
            清空条件
          </motion.button>
          <motion.button type="button" className={BUTTON_PRIMARY} whileTap={{ scale: 0.97 }} onClick={() => setCreatedModalOpen(false)}>
            完成
          </motion.button>
        </div>
      </FilterModal>

      <FilterModal
        open={isModifiedModalOpen}
        title="修改时间筛选"
        description="选择开始 / 结束时间范围"
        onClose={() => setModifiedModalOpen(false)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={PANEL_LABEL}>不早于</p>
            <input
              type="datetime-local"
              className={clsx(PANEL_INPUT, "mt-2")}
              value={modifiedAfter}
              onChange={(event) => setModifiedAfter(event.target.value)}
            />
          </div>
          <div>
            <p className={PANEL_LABEL}>不晚于</p>
            <input
              type="datetime-local"
              className={clsx(PANEL_INPUT, "mt-2")}
              value={modifiedBefore}
              onChange={(event) => setModifiedBefore(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-between gap-3">
          <motion.button type="button" className={BUTTON_GHOST} whileTap={{ scale: 0.97 }} onClick={clearModifiedFilter}>
            清空条件
          </motion.button>
          <motion.button
            type="button"
            className={BUTTON_PRIMARY}
            whileTap={{ scale: 0.97 }}
            onClick={() => setModifiedModalOpen(false)}
          >
            完成
          </motion.button>
        </div>
      </FilterModal>
    </section>
  );
}

type FilterModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

function FilterModal({ open, title, description, onClose, children }: FilterModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="relative z-[71] w-full max-w-lg rounded-2xl border border-[color:var(--border-subtle)] bg-white p-6 shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">{title}</p>
                {description && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{description}</p>}
              </div>
              <button
                type="button"
                className="rounded-full border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-2 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
