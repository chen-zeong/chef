import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { BUTTON_PRIMARY, PANEL_CONTAINER, PANEL_ERROR, PANEL_TITLE } from "../../ui/styles";

type WakeLockSentinel = {
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

export function AwakeTool() {
  const [isSupported, setSupported] = useState<boolean>(false);
  const [isActive, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const wakeLock = getWakeLock();
    setSupported(!!wakeLock);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isActive) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isActive]);

  const requestWakeLock = async () => {
    const wakeLock = getWakeLock();
    if (!wakeLock || typeof wakeLock.request !== "function") {
      setSupported(false);
      setError("当前环境不支持屏幕常亮 API，请手动调整系统节能设置。");
      return;
    }
    try {
      const sentinel = await wakeLock.request("screen");
      wakeLockRef.current = sentinel as WakeLockSentinel;
      setActive(true);
      setError(null);
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "唤醒失败，请检查系统节能策略或权限。"
      );
      setActive(false);
    }
  };

  const releaseWakeLock = async () => {
    if (!wakeLockRef.current) {
      setActive(false);
      return;
    }
    try {
      await wakeLockRef.current.release();
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "无法释放唤醒锁，请稍后再试。"
      );
    } finally {
      wakeLockRef.current = null;
      setActive(false);
    }
  };

  const toggle = async () => {
    if (isActive) {
      await releaseWakeLock();
    } else {
      await requestWakeLock();
    }
  };

  return (
    <div className={clsx(PANEL_CONTAINER, "gap-4")}> 
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.32em] text-[var(--text-tertiary)]">Wake Lock</span>
        <h3 className={PANEL_TITLE}>电脑常亮</h3>
      </header>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
        当你需要在演示、视频会议或实时监控时保持屏幕常亮，可在此开启唤醒锁。
      </p>

      <motion.button
        type="button"
        className={clsx(
          BUTTON_PRIMARY,
          "w-full justify-center",
          isActive
            ? "bg-[var(--positive)] hover:bg-[var(--positive)]"
            : ""
        )}
        whileTap={{ scale: 0.95 }}
        onClick={toggle}
        disabled={!isSupported && !isActive}
      >
        {isActive ? "已保持常亮（点击关闭）" : "启动屏幕常亮"}
      </motion.button>

      <div className="space-y-3 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] p-4 text-sm text-[var(--text-secondary)]">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">使用说明</h4>
        <ul className="list-disc space-y-2 pl-5">
          <li>开启后请保持窗口处于前台，以避免浏览器自动释放唤醒锁。</li>
          <li>切换标签页或最小化窗口时，系统可能会自动撤销常亮，需要重新开启。</li>
          <li>若按钮不可用，请在系统设置中关闭自动睡眠，或授予应用更多权限。</li>
        </ul>
      </div>

      <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">状态：</span>
        <span
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
            isActive
              ? "border-[rgba(21,128,61,0.35)] bg-[rgba(21,128,61,0.12)] text-[var(--positive)]"
              : "border-[color:var(--border-subtle)] bg-[var(--surface-alt-bg)] text-[var(--text-tertiary)]"
          )}
        >
          <span
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              isActive ? "bg-[var(--positive)]" : "bg-[var(--text-tertiary)]"
            )}
          />
          {isActive ? "运行中" : "已停用"}
        </span>
      </div>

      {error && <div className={PANEL_ERROR}>提示：{error}</div>}
    </div>
  );
}

function getWakeLock() {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return (navigator as WakeLockNavigator).wakeLock;
}
