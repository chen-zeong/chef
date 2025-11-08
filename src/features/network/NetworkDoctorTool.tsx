import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  PANEL_CONTAINER,
  PANEL_DESCRIPTION,
  PANEL_HEADER,
  PANEL_TITLE,
  PANEL_MUTED,
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL_ERROR
} from "../../ui/styles";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  PlugZap,
  RefreshCcw,
  ShieldOff,
  Waves,
  ClipboardList,
  Sparkles
} from "lucide-react";

type NetworkDiagnosis = {
  online: boolean;
  dnsOk: boolean;
  latencyMs: number | null;
  endpoint: string;
  timestamp: number;
  detailLog: string[];
  error: string | null;
};

type NetworkFixAction = "clear-proxy-env" | "reset-system-proxy" | "flush-dns-cache";

type NetworkFixResult = {
  action: NetworkFixAction;
  success: boolean;
  messages: string[];
};

type RepairStep = {
  id: NetworkFixAction;
  title: string;
  description: string;
  accent: string;
  icon: React.ReactNode;
};

type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

type StepState = {
  status: StepStatus;
  result: NetworkFixResult | null;
};

type StepStateMap = Record<NetworkFixAction, StepState>;

type ActivityEntry = {
  id: string;
  stepId: NetworkFixAction;
  message: string;
  success: boolean;
};

const REPAIR_STEPS: RepairStep[] = [
  {
    id: "clear-proxy-env",
    title: "清理代理变量",
    description: "移除 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY，避免错误代理导致断网。",
    accent: "from-[#bfdbfe] to-[#93c5fd]",
    icon: <ShieldOff className="h-4 w-4" />
  },
  {
    id: "reset-system-proxy",
    title: "重置系统代理",
    description: "尝试关闭系统层的 HTTP / HTTPS / SOCKS 代理开关，恢复默认直连。",
    accent: "from-[#fecdd3] to-[#fda4af]",
    icon: <PlugZap className="h-4 w-4" />
  },
  {
    id: "flush-dns-cache",
    title: "刷新 DNS 缓存",
    description: "执行系统命令刷新 DNS 缓存，确保新的域名解析能立即生效。",
    accent: "from-[#bbf7d0] to-[#86efac]",
    icon: <Waves className="h-4 w-4" />
  }
];

const MAX_ACTIVITY_ENTRIES = 12;

const createInitialStepState = (): StepStateMap =>
  REPAIR_STEPS.reduce<StepStateMap>((state, step) => {
    state[step.id] = { status: "pending", result: null };
    return state;
  }, {} as StepStateMap);

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return "--";
  return new Date(timestamp * 1000).toLocaleString();
};

const stepVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 }
};

const statusBadgeVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 }
};

export function NetworkDoctorTool() {
  const [diagnosis, setDiagnosis] = useState<NetworkDiagnosis | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [stepState, setStepState] = useState<StepStateMap>(() => createInitialStepState());
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [repairRunning, setRepairRunning] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  const refreshDiagnosis = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) {
        setDiagnosisLoading(true);
      }
      setDiagnosisError(null);
      try {
        const result = await invoke<NetworkDiagnosis>("diagnose_network_connectivity");
        setDiagnosis(result);
        return result;
      } catch (issue) {
        const message = issue instanceof Error ? issue.message : "无法连接诊断接口。";
        setDiagnosisError(message);
        return null;
      } finally {
        if (!silent) {
          setDiagnosisLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void refreshDiagnosis();
  }, [refreshDiagnosis]);

  const connectionHealthy = diagnosis?.online && diagnosis?.dnsOk;

  const latencyText = useMemo(() => {
    if (diagnosis?.latencyMs == null) return "--";
    return `${diagnosis.latencyMs} ms`;
  }, [diagnosis?.latencyMs]);

  const addActivityEntries = useCallback((stepId: NetworkFixAction, result: NetworkFixResult | null) => {
    if (!result || result.messages.length === 0) return;
    setActivityLog((prev) => {
      const entries = result.messages.map<ActivityEntry>((message, idx) => ({
        id: `${stepId}-${Date.now()}-${idx}`,
        stepId,
        message,
        success: result.success
      }));
      const merged = [...prev, ...entries];
      return merged.slice(-MAX_ACTIVITY_ENTRIES);
    });
  }, []);

  const markRemainingSteps = useCallback((fromIndex: number, status: StepStatus) => {
    setStepState((prev) => {
      const next = { ...prev };
      for (let i = fromIndex + 1; i < REPAIR_STEPS.length; i += 1) {
        const nextStep = REPAIR_STEPS[i];
        const current = next[nextStep.id];
        if (current && (current.status === "pending" || current.status === "running")) {
          next[nextStep.id] = { ...current, status };
        }
      }
      return next;
    });
  }, []);

  const handleRepair = useCallback(async () => {
    if (repairRunning) return;
    setRepairError(null);
    setActivityLog([]);
    setStepState(createInitialStepState());
    setRepairRunning(true);
    let restored = false;
    let aborted = false;

    try {
      for (let index = 0; index < REPAIR_STEPS.length; index += 1) {
        const step = REPAIR_STEPS[index];
        setStepState((prev) => ({
          ...prev,
          [step.id]: { ...prev[step.id], status: "running" }
        }));

        let stepResult: NetworkFixResult | null = null;
        try {
          stepResult = await invoke<NetworkFixResult>("run_network_fix_action", { action: step.id });
        } catch (issue) {
          const message = issue instanceof Error ? issue.message : "执行修复命令失败。";
          setRepairError(message);
          aborted = true;
          setStepState((prev) => ({
            ...prev,
            [step.id]: { ...prev[step.id], status: "failed", result: null }
          }));
          break;
        }

        const successState: StepStatus = stepResult.success ? "success" : "failed";
        addActivityEntries(step.id, stepResult);
        setStepState((prev) => ({
          ...prev,
          [step.id]: { status: successState, result: stepResult }
        }));

        const latestDiagnosis = await refreshDiagnosis({ silent: true });
        if (latestDiagnosis?.online && latestDiagnosis?.dnsOk) {
          restored = true;
          markRemainingSteps(index, "skipped");
          break;
        }
      }
    } finally {
      setRepairRunning(false);
    }

    await refreshDiagnosis();
    if (restored) {
      setRepairError(null);
    } else if (!aborted) {
      setRepairError("已尝试全部修复项，但网络仍未恢复，请手动进一步排查。");
    }
  }, [addActivityEntries, markRemainingSteps, refreshDiagnosis, repairRunning]);

  return (
    <section className={clsx(PANEL_CONTAINER, "gap-6")}>
      <div className={clsx(PANEL_HEADER, "gap-4")}>
        <div className="flex flex-col gap-1">
          <h3 className={PANEL_TITLE}>网络急救</h3>
          <p className={PANEL_DESCRIPTION}>检测当前网络连通性并提供一键修复清单，自动尝试最常见的断网原因。</p>
          <p className={clsx(PANEL_MUTED, "text-xs")}>最后检测：{formatTimestamp(diagnosis?.timestamp)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={clsx(BUTTON_GHOST, "h-10 px-4")}
            onClick={() => refreshDiagnosis()}
            disabled={diagnosisLoading || repairRunning}
          >
            <RefreshCcw className={clsx("mr-2 h-4 w-4", diagnosisLoading && "animate-spin")} />
            {diagnosisLoading ? "检测中..." : "重新检测"}
          </button>
          <button
            type="button"
            className={clsx(BUTTON_PRIMARY, "h-10 px-5")}
            onClick={() => void handleRepair()}
            disabled={repairRunning}
          >
            <Sparkles className={clsx("mr-2 h-4 w-4", repairRunning && "animate-spin")} />
            {repairRunning ? "修复中..." : "一键修复"}
          </button>
        </div>
      </div>

      {(diagnosisError || repairError) && (
        <div className="space-y-2">
          {diagnosisError && <p className={PANEL_ERROR}>{diagnosisError}</p>}
          {repairError && <p className={PANEL_ERROR}>{repairError}</p>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          layout
          className="relative overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-gradient-to-br from-[rgba(59,130,246,0.08)] via-white to-white p-6 shadow-[0_24px_50px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">当前状态</p>
              <p className="text-3xl font-semibold text-[var(--text-primary)]">{connectionHealthy ? "已连通" : "异常"}</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right text-sm">
              <AnimatePresence mode="wait">
                <motion.span
                  key={connectionHealthy ? "online" : "offline"}
                  variants={statusBadgeVariants}
                  initial="initial"
                  animate="animate"
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    connectionHealthy ? "bg-[rgba(34,197,94,0.15)] text-[rgba(22,163,74,1)]" : "bg-[rgba(248,113,113,0.15)] text-[rgba(220,38,38,1)]"
                  )}
                >
                  {connectionHealthy ? "网络正常" : "等待修复"}
                </motion.span>
              </AnimatePresence>
              <span className="text-xs text-[var(--text-tertiary)]">
                延迟：<strong className="font-semibold text-[var(--text-primary)]">{latencyText}</strong>
              </span>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatusItem
              title="互联网连通性"
              value={diagnosis?.online ? "可访问公网" : "连接失败"}
              positive={!!diagnosis?.online}
              icon={<Activity className="h-4 w-4" />}
            />
            <StatusItem
              title="DNS 解析"
              value={diagnosis?.dnsOk ? "解析正常" : "解析异常"}
              positive={!!diagnosis?.dnsOk}
              icon={<ClipboardList className="h-4 w-4" />}
            />
          </div>
        </motion.div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/80 p-5">
          <div className="flex items-center justify-between text-sm font-medium text-[var(--text-secondary)]">
            <span>诊断日志</span>
            <span className="text-xs text-[var(--text-tertiary)]">来源：{diagnosis?.endpoint ?? "--"}</span>
          </div>
          {diagnosis?.detailLog?.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {diagnosis.detailLog.map((log, index) => (
                <motion.li key={`${log}-${index}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl bg-[rgba(248,250,252,0.9)] px-3 py-2 text-[var(--text-secondary)]">
                  {log}
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">等待检测结果...</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/90 p-5">
          <div className="mb-4 flex items-center justify-between text-sm font-medium text-[var(--text-secondary)]">
            <span>修复清单</span>
            <span className="text-xs text-[var(--text-tertiary)]">{repairRunning ? "执行中..." : "待命"}</span>
          </div>
          <ul className="flex flex-col gap-3">
            {REPAIR_STEPS.map((step) => {
              const current = stepState[step.id];
              const status = current?.status ?? "pending";
              return (
                <motion.li
                  key={step.id}
                  layout
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  className="rounded-2xl border border-[rgba(226,232,240,1)] bg-white/80 p-4 shadow-[0_15px_30px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx("rounded-xl bg-gradient-to-br p-2 text-[var(--text-primary)]", step.accent)}>{step.icon}</div>
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</p>
                        <StatusPill status={status} />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)]">{step.description}</p>
                      <AnimatePresence>
                        {current?.result?.messages && current.result.messages.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 rounded-xl bg-[rgba(248,250,252,0.95)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                          >
                            {current.result.messages.join(" / ")}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
        <div className="flex h-full flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/90 p-5">
          <div className="flex items-center justify-between text-sm font-medium text-[var(--text-secondary)]">
            <span>执行轨迹</span>
            <span className="text-xs text-[var(--text-tertiary)]">最多保留 {MAX_ACTIVITY_ENTRIES} 条</span>
          </div>
          {activityLog.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(226,232,240,1)] bg-[rgba(248,250,252,0.7)] p-6 text-center text-sm text-[var(--text-tertiary)]">
              <ListPlaceholder />
              <p>等待修复执行，日志会实时展示在这里。</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2 overflow-hidden">
              <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {activityLog.map((entry) => (
                    <motion.li
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={clsx(
                        "rounded-xl px-3 py-2 text-sm",
                        entry.success ? "bg-[rgba(220,252,231,0.8)] text-[rgba(22,101,52,1)]" : "bg-[rgba(254,226,226,0.75)] text-[rgba(185,28,28,1)]"
                      )}
                    >
                      {entry.message}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusItem({
  title,
  value,
  positive,
  icon
}: {
  title: string;
  value: string;
  positive: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[rgba(226,232,240,1)] bg-white/90 px-3 py-2">
      <div
        className={clsx(
          "rounded-xl p-2",
          positive ? "bg-[rgba(187,247,208,0.6)] text-[rgba(22,163,74,1)]" : "bg-[rgba(254,226,226,0.6)] text-[rgba(239,68,68,1)]"
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col text-sm">
        <span className="text-[var(--text-tertiary)]">{title}</span>
        <span className="font-semibold text-[var(--text-primary)]">{value}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: StepStatus }) {
  const ICON_MAP: Record<StepStatus, React.ReactNode> = {
    pending: <Circle className="h-3.5 w-3.5 text-[rgba(148,163,184,1)]" />,
    running: <Loader2 className="h-3.5 w-3.5 animate-spin text-[rgba(59,130,246,1)]" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-[rgba(34,197,94,1)]" />,
    failed: <AlertTriangle className="h-3.5 w-3.5 text-[rgba(248,113,113,1)]" />,
    skipped: <Circle className="h-3.5 w-3.5 text-[rgba(203,213,225,1)]" />
  };
  const LABEL_MAP: Record<StepStatus, string> = {
    pending: "待执行",
    running: "执行中",
    success: "已完成",
    failed: "失败",
    skipped: "已跳过"
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(248,250,252,1)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--text-secondary)]">
      {ICON_MAP[status]}
      {LABEL_MAP[status]}
    </span>
  );
}

function ListPlaceholder() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-dashed border-[rgba(191,219,254,1)] bg-[rgba(239,246,255,0.8)] px-3 py-1 text-xs text-[var(--text-secondary)]">
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>暂无执行日志</span>
    </div>
  );
}
