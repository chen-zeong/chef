import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "react-qr-code";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_CONTAINER,
  PANEL_DESCRIPTION,
  PANEL_TITLE
} from "../../ui/styles";
import { CheckCircle2, Copy, FolderPlus, Link2, Loader2, Share2, StopCircle, Wifi } from "lucide-react";

type SharedFile = {
  id: string;
  display_name: string;
  download_name: string;
  size: number;
  extension?: string | null;
};

type ShareSession = {
  port: number;
  addresses: string[];
  primary_url: string;
  files: SharedFile[];
};

const pulseVariants = {
  animate: {
    opacity: [0.35, 0.9, 0.35],
    scale: [1, 1.05, 1],
    transition: { duration: 3.6, repeat: Infinity }
  }
};

export function LanShareTool() {
  const [session, setSession] = useState<ShareSession | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    invoke<ShareSession | null>("get_file_share_status")
      .then((result) => {
        if (!mounted || !result) return;
        setSession(result);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!copiedUrl) return;
    const timeout = window.setTimeout(() => setCopiedUrl(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [copiedUrl]);

  const formatBytes = useCallback((size: number) => {
    if (size === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    const value = size / 1024 ** exponent;
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  }, []);

  const totalSize = useMemo(() => {
    if (!session) return "0 B";
    const size = session.files.reduce((sum, file) => sum + file.size, 0);
    return formatBytes(size);
  }, [session, formatBytes]);

  const handleCopyUrl = useCallback((url: string) => {
    if (!url) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => setCopiedUrl(url)).catch(() => setCopiedUrl(url));
      return;
    }
    setCopiedUrl(url);
  }, []);

  const handleSelectFolder = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const folders = await invoke<string[]>("pick_share_directories");
      if (!folders || folders.length === 0) {
        setBusy(false);
        return;
      }
      const newSession = await invoke<ShareSession>("start_file_share", { files: folders });
      setSession(newSession);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "启动分享失败，请重试。");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleStopShare = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await invoke("stop_file_share");
      setSession(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "停止分享失败，请重试。");
    } finally {
      setBusy(false);
    }
  }, []);

  const lanUrl = session?.primary_url ?? "";

  return (
    <section className={clsx(PANEL_CONTAINER, "relative overflow-hidden bg-gradient-to-br from-[rgba(59,130,246,0.08)] via-[rgba(15,23,42,0.03)] to-white/65 shadow-xl backdrop-blur-[3px]")}
    >
      <motion.div className="pointer-events-none absolute inset-0" variants={pulseVariants} animate="animate">
        <div className="absolute -top-24 left-10 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_70%)]" />
        <div className="absolute -bottom-28 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_bottom,_rgba(14,165,233,0.35),_transparent_75%)]" />
      </motion.div>

      <div className="relative flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-tertiary)]">Chef LAN Share</span>
        <h3 className={PANEL_TITLE}>局域网文件夹速传</h3>
        <p className={clsx(PANEL_DESCRIPTION, "max-w-3xl")}>一次选择一个文件夹，Chef 会记住最近路径并启动临时 HTTP 服务。手机或其他电脑扫描二维码即可在同一网络内访问下载页。</p>
      </div>

      <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex flex-col gap-5 rounded-3xl border border-[rgba(59,130,246,0.12)] bg-white/85 p-6 shadow-[0_25px_60px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="flex items-start gap-3 rounded-2xl bg-[rgba(59,130,246,0.07)] p-4 text-sm text-[var(--text-secondary)]">
            <Share2 className="mt-1 h-4 w-4 text-[var(--accent)]" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">仅需一个文件夹</p>
              <p>目前版本专注文件夹分享，自动打包其中的所有文件并生成下载页。</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <motion.button
              type="button"
              className={clsx(BUTTON_PRIMARY, "flex-1 min-w-[200px] text-base")}
              whileTap={{ scale: 0.97 }}
              onClick={handleSelectFolder}
              disabled={isBusy}
            >
              {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
              选择要分享的文件夹
            </motion.button>

            {session && (
              <motion.button
                type="button"
                className={clsx(BUTTON_GHOST, "flex-1 min-w-[160px] border-[rgba(37,99,235,0.25)] text-[var(--negative)]")}
                whileTap={{ scale: 0.97 }}
                onClick={handleStopShare}
                disabled={isBusy}
              >
                <StopCircle className="mr-2 h-4 w-4" />
                结束分享
              </motion.button>
            )}
          </div>

          <div className="grid gap-4 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/90 p-4 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
            <div className="rounded-2xl bg-[rgba(59,130,246,0.08)] p-3">
              <span className="text-xs text-[var(--text-tertiary)]">当前状态</span>
              <div className="mt-1 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                <Wifi size={16} />
                {session ? "分享中" : "待开始"}
              </div>
            </div>
            <div className="rounded-2xl bg-[rgba(59,130,246,0.05)] p-3">
              <span className="text-xs text-[var(--text-tertiary)]">包含文件</span>
              <div className="mt-1 text-base font-semibold text-[var(--text-primary)]">{session ? `${session.files.length} 个` : "-"}</div>
            </div>
            <div className="rounded-2xl bg-[rgba(59,130,246,0.05)] p-3">
              <span className="text-xs text-[var(--text-tertiary)]">累计大小</span>
              <div className="mt-1 text-base font-semibold text-[var(--text-primary)]">{session ? totalSize : "-"}</div>
            </div>
          </div>

          <p className="text-xs text-[var(--text-tertiary)]">提示：Chef 会记忆最近一次选择的文件夹路径，方便连续分享相邻目录。</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="flex flex-col gap-5 rounded-3xl border border-[rgba(15,23,42,0.08)] bg-gradient-to-b from-white via-white/90 to-[rgba(191,219,254,0.3)] p-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.15)]"
        >
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-tertiary)]">访问入口</span>
            <h4 className="text-xl font-semibold text-[var(--text-primary)]">扫码或复制链接</h4>
            <p className="text-sm text-[var(--text-secondary)]">二维码与链接同步指向 192 网段地址，贴合大多数 Wi-Fi 场景。</p>
          </div>

          <div className="grid w-full gap-4 rounded-3xl border border-[rgba(15,23,42,0.08)] bg-white/90 p-4 shadow-inner sm:grid-cols-[auto,1fr]">
            <div className="flex items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/80 p-3">
              <QRCode value={lanUrl || "Chef"} size={110} />
            </div>
            <div className="flex flex-col gap-3 text-left text-sm text-[var(--text-secondary)]">
              <div>
                <span className="text-xs uppercase tracking-[0.25em] text-[var(--text-tertiary)]">LAN URL</span>
                <div className="mt-2 flex items-center gap-2 text-[var(--text-primary)]">
                  <Link2 size={16} />
                  <span className="truncate font-mono text-sm">
                    {lanUrl || "请选择文件夹后生成"}
                  </span>
                </div>
              </div>
              {lanUrl && (
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(37,99,235,0.25)] transition hover:brightness-110"
                  onClick={() => handleCopyUrl(lanUrl)}
                >
                  {copiedUrl === lanUrl ? <CheckCircle2 size={16} className="text-white" /> : <Copy size={16} />}
                  {copiedUrl === lanUrl ? "已复制" : "复制链接"}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">关闭“结束分享”后，二维码与链接会立刻失效。确保分享对象与您处于同一 192.* 局域网。</p>
        </motion.div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-[rgba(248,113,113,0.35)] bg-[rgba(254,226,226,0.92)] px-3 py-2 text-sm text-[var(--negative)]">
          {error}
        </motion.div>
      )}
    </section>
  );
}
