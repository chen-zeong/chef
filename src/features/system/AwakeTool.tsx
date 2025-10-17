import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

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
    <div className="awaketool">
      <div className="awaketool__surface">
        <header>
          <span className="awaketool__eyebrow">Wake Lock</span>
          <h3>电脑常亮</h3>
        </header>
        <p className="awaketool__intro">
          当你需要在演示、视频会议或实时监控时保持屏幕常亮，可在此开启唤醒锁。
        </p>

        <motion.button
          type="button"
          className={isActive ? "awaketool__button awaketool__button--active" : "awaketool__button"}
          whileTap={{ scale: 0.95 }}
          onClick={toggle}
          disabled={!isSupported && !isActive}
        >
          {isActive ? "已保持常亮（点击关闭）" : "启动屏幕常亮"}
        </motion.button>

        <div className="awaketool__hint">
          <h4>使用说明</h4>
          <ul>
            <li>开启后请保持窗口处于前台，以避免浏览器自动释放唤醒锁。</li>
            <li>切换标签页或最小化窗口时，系统可能会自动撤销常亮，需要重新开启。</li>
            <li>若按钮不可用，请在系统设置中关闭自动睡眠，或授予应用更多权限。</li>
          </ul>
        </div>

        <div className="awaketool__status">
          状态：
          <span className={isActive ? "awaketool__status-dot awaketool__status-dot--active" : "awaketool__status-dot"}>
            {isActive ? "运行中" : "已停用"}
          </span>
        </div>

        {error && <div className="awaketool__error">提示：{error}</div>}
      </div>
    </div>
  );
}

function getWakeLock() {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return (navigator as WakeLockNavigator).wakeLock;
}
