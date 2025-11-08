import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import {
  PANEL_CONTAINER,
  PANEL_DESCRIPTION,
  PANEL_TITLE,
  PANEL_HEADER,
  PANEL_MUTED,
  PANEL_ERROR,
  BUTTON_GHOST
} from "../../ui/styles";
import { Activity, Globe, MapPin, Network as NetworkIcon, RefreshCcw, ShieldCheck, Shield } from "lucide-react";

type AddressCategory = "loopback" | "private" | "link-local" | "global";

type IpAddressInfo = {
  interface: string;
  address: string;
  category: AddressCategory;
  version: "IPv4" | "IPv6";
};

type VpnInterfaceInfo = {
  name: string;
  addresses: string[];
};

type VpnStatus = {
  active: boolean;
  interfaces: VpnInterfaceInfo[];
};

type ProxyEnvVar = {
  key: string;
  value: string;
};

type NetworkOverview = {
  primaryPrivateIpv4: string | null;
  primaryIpv6: string | null;
  publicIp: PublicIpInfo | null;
  proxyPublicIp: PublicIpInfo | null;
  ipv4Addresses: IpAddressInfo[];
  ipv6Addresses: IpAddressInfo[];
  lanAddresses: IpAddressInfo[];
  vpnStatus: VpnStatus;
  proxyEnv: ProxyEnvVar[];
  proxyDetected: boolean;
  proxyEndpoints: ProxyEndpoint[];
  captureTimestamp: number;
};

type PublicIpInfo = {
  ip: string;
  location?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  isp?: string | null;
  organization?: string | null;
  countryCode?: string | null;
  timezone?: string | null;
  asn?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source: string;
};

type ProxyEndpoint = {
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  source: string;
};

const CATEGORY_LABELS: Record<AddressCategory, string> = {
  loopback: "回环",
  private: "局域网",
  "link-local": "链路本地",
  global: "公网"
};

const CATEGORY_BADGE: Record<AddressCategory, string> = {
  loopback: "border-[rgba(148,163,184,0.36)] bg-[rgba(148,163,184,0.12)] text-[var(--text-tertiary)]",
  private: "border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.15)] text-[rgba(22,163,74,1)]",
  "link-local": "border-[rgba(249,115,22,0.35)] bg-[rgba(251,146,60,0.15)] text-[rgba(234,88,12,1)]",
  global: "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.15)] text-[rgba(37,99,235,1)]"
};

export function NetworkInspectorTool() {
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<NetworkOverview>("get_network_overview");
      setOverview(result);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "无法获取网络信息，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const lastUpdated = useMemo(() => {
    if (!overview) return "--";
    const seconds = overview.captureTimestamp;
    return new Date(seconds * 1000).toLocaleString();
  }, [overview]);

  const lanCount = overview?.lanAddresses.length ?? 0;
  const ipv4Count = overview?.ipv4Addresses.length ?? 0;
  const ipv6Count = overview?.ipv6Addresses.length ?? 0;
  const publicIp = overview?.publicIp;
  const proxyIp = overview?.proxyPublicIp ?? null;
  const hasProxyPort = (overview?.proxyEndpoints.length ?? 0) > 0;

  return (
    <section className={clsx(PANEL_CONTAINER, "gap-5")}>
      <div className={clsx(PANEL_HEADER, "items-start gap-3")}>
        <div className="flex flex-col gap-1">
          <h3 className={PANEL_TITLE}>网络状态速览</h3>
          <p className={PANEL_DESCRIPTION}>一眼查看 IPv4 / IPv6、本地局域网地址以及 VPN / 代理是否开启。</p>
          <p className={clsx(PANEL_MUTED, "text-xs")}>上次更新：{lastUpdated}</p>
        </div>
        <button
          type="button"
          className={clsx(BUTTON_GHOST, "h-10 min-w-[120px] self-center text-sm")}
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCcw className={clsx("mr-2 h-4 w-4", loading && "animate-spin")} />
          {loading ? "刷新中..." : "刷新数据"}
        </button>
      </div>

      {error && <p className={PANEL_ERROR}>{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<MapPin className="h-4 w-4" />}
          title="公网 IP"
          value={publicIp?.ip ?? "--"}
          hint={publicIp?.location ?? "暂未获取到公网地址"}
        />
        <SummaryCard
          icon={<Globe className="h-4 w-4" />}
          title="首选局域网 IP"
          value={overview?.primaryPrivateIpv4 ?? "--"}
          hint={lanCount > 0 ? `${lanCount} 个可用局域网地址` : "未检测到局域网地址"}
        />
        <SummaryCard
          icon={<Shield className="h-4 w-4" />}
          title="代理出口 IP"
          value={proxyIp?.ip ?? "--"}
          hint={
            proxyIp
              ? proxyIp.location ?? "未知归属地"
              : hasProxyPort
                ? "检测到代理端口，可点击刷新获取"
                : "未发现代理端口"
          }
        />
        <SummaryCard
          icon={<NetworkIcon className="h-4 w-4" />}
          title="IPv4 地址"
          value={`${ipv4Count} 个`}
          hint={lanCount > 0 ? `${lanCount} 个局域网 / ${ipv4Count} 个总计` : "暂无局域网地址"}
        />
        <SummaryCard
          icon={<Activity className="h-4 w-4" />}
          title="IPv6 地址"
          value={`${ipv6Count} 个`}
          hint={overview?.primaryIpv6 ?? "尚未检测到 IPv6"}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="VPN / 代理"
          value={overview?.proxyDetected ? "已检测" : "未开启"}
          hint={overview?.vpnStatus.active ? `${overview.vpnStatus.interfaces.length} 个 VPN 接口` : "未发现 VPN 适配器"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AddressList title="局域网 IPv4" addresses={overview?.lanAddresses ?? []} emptyHint="没有检测到 10.x / 172.x / 192.168 网段" />
        <AddressList title="全部 IPv4" addresses={overview?.ipv4Addresses ?? []} emptyHint="暂无 IPv4 地址" />
        <AddressList title="全部 IPv6" addresses={overview?.ipv6Addresses ?? []} emptyHint="暂无 IPv6 地址" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <IpPanel title="公网 IP 与归属地" info={publicIp} loading={loading} emptyHint="点击刷新，通过 whois.pconline.com.cn 获取公网地址。" />
        <IpPanel
          title="代理出口 IP"
          info={proxyIp}
          loading={loading && hasProxyPort}
          emptyHint={hasProxyPort ? "检测到代理端口，等待刷新获取代理出口 IP。" : "未检测到代理端口，无法通过代理查询。"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VpnPanel status={overview?.vpnStatus} loading={loading} />
        <ProxyEndpointPanel endpoints={overview?.proxyEndpoints ?? []} />
      </div>

      <ProxyEnvPanel proxyEnv={overview?.proxyEnv ?? []} proxyDetected={overview?.proxyDetected ?? false} />
    </section>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  hint
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className="rounded-full bg-[rgba(59,130,246,0.12)] p-2 text-[var(--accent)]">
          {icon}
        </span>
        <span>{title}</span>
      </div>
      <p className="text-xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
    </div>
  );
}

function AddressList({
  title,
  addresses,
  emptyHint
}: {
  title: string;
  addresses: IpAddressInfo[];
  emptyHint: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-4">
      <div className="flex items-center justify-between text-sm font-medium text-[var(--text-secondary)]">
        <span>{title}</span>
        <span className="text-xs text-[var(--text-tertiary)]">{addresses.length} 条</span>
      </div>
      {addresses.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{emptyHint}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {addresses.map((addr) => (
            <li key={`${addr.interface}-${addr.address}`} className="rounded-xl border border-[rgba(226,232,240,1)] bg-[rgba(248,250,252,0.8)] px-4 py-3 text-sm">
              <p className="font-mono text-[var(--text-primary)]">{addr.address}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>{addr.interface}</span>
                <span className={clsx("rounded-full border px-2 py-0.5 text-[0.7rem]", CATEGORY_BADGE[addr.category])}>
                  {CATEGORY_LABELS[addr.category]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IpPanel({
  title,
  info,
  loading,
  emptyHint
}: {
  title: string;
  info: PublicIpInfo | null | undefined;
  loading: boolean;
  emptyHint: string;
}) {
  const detailRows = info
    ? [
        { label: "归属地", value: info.location ?? "未知" },
        { label: "国家", value: info.country ?? "未知" },
        { label: "地区", value: info.region ?? "未知" },
        { label: "城市", value: info.city ?? "未知" },
        { label: "运营商", value: info.isp ?? "未知" },
        info.organization ? { label: "组织", value: info.organization } : null,
        info.countryCode ? { label: "国家/地区代码", value: info.countryCode } : null,
        info.timezone ? { label: "时区", value: info.timezone } : null,
        info.asn ? { label: "ASN", value: info.asn } : null,
        info.latitude != null && info.longitude != null
          ? {
              label: "坐标",
              value: `${info.latitude.toFixed(4)}, ${info.longitude.toFixed(4)}`
            }
          : null
      ].filter(Boolean) as { label: string; value: string }[]
    : [];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/85 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h4>
        <span className="text-xs text-[var(--text-tertiary)]">{info ? `数据源：${info.source}` : loading ? "查询中..." : "等待刷新"}</span>
      </div>
      {info ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 rounded-xl bg-[rgba(59,130,246,0.08)] px-3 py-2 font-mono text-base text-[var(--text-primary)]">{info.ip}</div>
          {detailRows.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">{loading ? "正在通过接口刷新..." : emptyHint}</p>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-[rgba(226,232,240,1)] bg-[rgba(249,250,251,0.8)] px-3 py-2">
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function VpnPanel({ status, loading }: { status?: VpnStatus; loading: boolean }) {
  const hasVpn = status?.active && status.interfaces.length > 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/80 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">VPN / 代理适配器</h4>
        <span className={clsx("text-xs", hasVpn ? "text-green-600" : "text-[var(--text-tertiary)]")}>{hasVpn ? "已检测" : loading ? "扫描中" : "未发现"}</span>
      </div>
      {hasVpn ? (
        <ul className="flex flex-col gap-2">
          {status!.interfaces.map((adapter) => (
            <li key={adapter.name} className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(134,239,172,0.15)] px-3 py-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{adapter.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{adapter.addresses.join(", ")}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">暂未捕获到 VPN 或代理网卡，若已开启请点击刷新。</p>
      )}
    </div>
  );
}

function ProxyEndpointPanel({ endpoints }: { endpoints: ProxyEndpoint[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/80 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">代理端口探测</h4>
        <span className="text-xs text-[var(--text-tertiary)]">{endpoints.length ? `${endpoints.length} 个监听` : "未发现"}</span>
      </div>
      {endpoints.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">没有检测到常见的 HTTP / HTTPS / SOCKS5 代理端口。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {endpoints.map((endpoint) => (
            <li key={`${endpoint.protocol}-${endpoint.host}-${endpoint.port}`} className="rounded-xl border border-[rgba(59,130,246,0.2)] bg-[rgba(219,234,254,0.4)] px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">
                  {endpoint.host}:{endpoint.port}
                </span>
                <span className="rounded-full bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-xs uppercase tracking-wide text-[var(--accent)]">
                  {endpoint.protocol}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">来源：{endpoint.source}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProxyEnvPanel({ proxyEnv, proxyDetected }: { proxyEnv: ProxyEnvVar[]; proxyDetected: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/80 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">系统代理变量</h4>
        <span className={clsx("text-xs", proxyDetected ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]")}>{proxyDetected ? "已设置" : "未设置"}</span>
      </div>
      {proxyEnv.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">HTTP_PROXY / HTTPS_PROXY / ALL_PROXY 尚未设置。</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-[var(--text-primary)]">
          {proxyEnv.map((proxy) => (
            <li key={proxy.key} className="rounded-xl border border-[rgba(59,130,246,0.2)] bg-[rgba(191,219,254,0.35)] px-3 py-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">{proxy.key}</p>
              <p className="font-mono">{proxy.value}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
