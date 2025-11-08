use std::{
    collections::HashMap,
    env,
    net::{Ipv4Addr, Ipv6Addr},
    process::Command,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use encoding_rs::GBK;
use if_addrs::{get_if_addrs, IfAddr};
use reqwest::{header::ACCEPT, Client, Proxy as ReqwestProxy, Url};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;

#[derive(Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum AddressCategory {
    Loopback,
    Private,
    LinkLocal,
    Global,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IpAddressInfo {
    interface: String,
    address: String,
    category: AddressCategory,
    version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VpnInterfaceInfo {
    name: String,
    addresses: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VpnStatus {
    active: bool,
    interfaces: Vec<VpnInterfaceInfo>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyEnvVar {
    key: String,
    value: String,
}

const PROXY_ENV_KEYS: [&str; 6] = [
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkOverview {
    primary_private_ipv4: Option<String>,
    primary_ipv6: Option<String>,
    public_ip: Option<PublicIpInfo>,
    proxy_public_ip: Option<PublicIpInfo>,
    ipv4_addresses: Vec<IpAddressInfo>,
    ipv6_addresses: Vec<IpAddressInfo>,
    lan_addresses: Vec<IpAddressInfo>,
    vpn_status: VpnStatus,
    proxy_env: Vec<ProxyEnvVar>,
    proxy_detected: bool,
    proxy_endpoints: Vec<ProxyEndpoint>,
    capture_timestamp: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicIpInfo {
    ip: String,
    location: Option<String>,
    country: Option<String>,
    region: Option<String>,
    city: Option<String>,
    isp: Option<String>,
    organization: Option<String>,
    country_code: Option<String>,
    timezone: Option<String>,
    asn: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    source: String,
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
enum ProxyProtocol {
    Http,
    Https,
    Socks5,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyEndpoint {
    protocol: ProxyProtocol,
    host: String,
    port: u16,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiagnosis {
    online: bool,
    dns_ok: bool,
    latency_ms: Option<u128>,
    endpoint: String,
    timestamp: u64,
    detail_log: Vec<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NetworkFixAction {
    ClearProxyEnv,
    ResetSystemProxy,
    FlushDnsCache,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkFixResult {
    action: NetworkFixAction,
    success: bool,
    messages: Vec<String>,
}

#[derive(Deserialize)]
struct GoogleDnsResponse {
    #[serde(rename = "Status")]
    status: Option<u32>,
    #[serde(rename = "Answer")]
    answer: Option<Vec<GoogleDnsAnswer>>,
}

#[derive(Deserialize)]
struct GoogleDnsAnswer {
    data: Option<String>,
}

impl ProxyProtocol {
    fn scheme(self) -> &'static str {
        match self {
            ProxyProtocol::Http | ProxyProtocol::Https => "http",
            ProxyProtocol::Socks5 => "socks5h",
        }
    }
}

#[tauri::command]
pub async fn diagnose_network_connectivity() -> Result<NetworkDiagnosis, String> {
    let endpoint = "https://www.gstatic.com/generate_204";
    let mut detail_log = Vec::new();
    let mut error_message: Option<String> = None;

    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent("Chef Network Doctor/0.1")
        .build()
        .map_err(|err| err.to_string())?;

    let mut latency_ms = None;
    let mut online = false;

    let start = Instant::now();
    match client.get(endpoint).send().await {
        Ok(resp) => {
            latency_ms = Some(start.elapsed().as_millis());
            if resp.status().is_success() {
                detail_log.push(format!("成功访问 {endpoint}，状态码 {}", resp.status()));
                online = true;
            } else {
                let msg = format!("访问 {endpoint} 返回状态码 {}", resp.status());
                detail_log.push(msg.clone());
                error_message = Some(msg);
            }
        }
        Err(err) => {
            let msg = format!("访问 {endpoint} 失败: {err}");
            detail_log.push(msg.clone());
            error_message = Some(msg);
        }
    }

    let mut dns_ok = false;
    match client
        .get("https://dns.google/resolve")
        .query(&[("name", "example.com"), ("type", "A")])
        .header(ACCEPT, "application/dns-json")
        .send()
        .await
    {
        Ok(resp) => {
            let http_status = resp.status();
            let payload = resp.json::<GoogleDnsResponse>().await;
            match payload {
                Ok(data) => {
                    let has_answer = data
                        .answer
                        .as_ref()
                        .map(|answers| {
                            answers.iter().any(|entry| {
                                entry
                                    .data
                                    .as_deref()
                                    .map(|v| !v.is_empty())
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);
                    if data.status.unwrap_or(1) == 0 && has_answer {
                        dns_ok = true;
                        detail_log.push("DNS 解析 example.com 成功。".into());
                    } else {
                        let msg = format!(
                            "DNS 响应状态 {}，未获得有效记录。",
                            data.status.unwrap_or(1)
                        );
                        detail_log.push(msg.clone());
                        if error_message.is_none() {
                            error_message = Some(msg);
                        }
                    }
                }
                Err(err) => {
                    let msg = format!("解析 DNS 响应失败: {err}");
                    detail_log.push(msg.clone());
                    if error_message.is_none() {
                        error_message = Some(msg);
                    }
                }
            }
            detail_log.push(format!("DNS 接口 HTTP 状态 {}", http_status));
        }
        Err(err) => {
            let msg = format!("请求 DNS 接口失败: {err}");
            detail_log.push(msg.clone());
            if error_message.is_none() {
                error_message = Some(msg);
            }
        }
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(NetworkDiagnosis {
        online,
        dns_ok,
        latency_ms,
        endpoint: endpoint.to_string(),
        timestamp,
        detail_log,
        error: error_message,
    })
}

#[tauri::command]
pub async fn run_network_fix_action(action: NetworkFixAction) -> Result<NetworkFixResult, String> {
    spawn_blocking(move || execute_network_fix(action))
        .await
        .map_err(|err| err.to_string())?
}

fn execute_network_fix(action: NetworkFixAction) -> Result<NetworkFixResult, String> {
    let (success, messages) = match action {
        NetworkFixAction::ClearProxyEnv => Ok(clear_proxy_env_vars()),
        NetworkFixAction::ResetSystemProxy => reset_system_proxy(),
        NetworkFixAction::FlushDnsCache => flush_dns_cache(),
    }?;
    Ok(NetworkFixResult {
        action,
        success,
        messages,
    })
}

#[tauri::command]
pub async fn get_network_overview() -> Result<NetworkOverview, String> {
    let interfaces = get_if_addrs().map_err(|err| format!("获取网络接口失败: {err}"))?;

    let mut ipv4_addresses = Vec::new();
    let mut ipv6_addresses = Vec::new();
    let mut lan_addresses = Vec::new();
    let mut vpn_map: HashMap<String, Vec<String>> = HashMap::new();

    for iface in interfaces {
        let interface_name = iface.name;
        let is_vpn_like = looks_like_vpn(&interface_name);
        match iface.addr {
            IfAddr::V4(v4) => {
                let category = categorize_ipv4(&v4.ip);
                let info = IpAddressInfo {
                    interface: interface_name.clone(),
                    address: v4.ip.to_string(),
                    category: category.clone(),
                    version: "IPv4".into(),
                };
                if category == AddressCategory::Private {
                    lan_addresses.push(info.clone());
                }
                if is_vpn_like {
                    vpn_map
                        .entry(interface_name.clone())
                        .or_default()
                        .push(v4.ip.to_string());
                }
                ipv4_addresses.push(info);
            }
            IfAddr::V6(v6) => {
                let category = categorize_ipv6(&v6.ip);
                let info = IpAddressInfo {
                    interface: interface_name.clone(),
                    address: format_ipv6(v6.ip),
                    category: category.clone(),
                    version: "IPv6".into(),
                };
                if is_vpn_like {
                    vpn_map
                        .entry(interface_name.clone())
                        .or_default()
                        .push(info.address.clone());
                }
                ipv6_addresses.push(info);
            }
        }
    }

    let primary_private_ipv4 = lan_addresses
        .iter()
        .find(|entry| entry.category == AddressCategory::Private)
        .map(|entry| entry.address.clone());
    let primary_ipv6 = ipv6_addresses
        .iter()
        .find(|entry| entry.category != AddressCategory::Loopback)
        .map(|entry| entry.address.clone());

    let mut vpn_interfaces = vpn_map
        .into_iter()
        .map(|(name, mut addresses)| {
            addresses.sort_unstable();
            addresses.dedup();
            VpnInterfaceInfo { name, addresses }
        })
        .collect::<Vec<_>>();
    vpn_interfaces.sort_by(|a, b| a.name.cmp(&b.name));

    let proxy_env = gather_proxy_env();
    let proxy_endpoints = detect_proxy_endpoints();
    let proxy_detected =
        !proxy_env.is_empty() || !vpn_interfaces.is_empty() || !proxy_endpoints.is_empty();

    let public_ip = match fetch_public_ip_info(None).await {
        Ok(info) => Some(info),
        Err(err) => {
            eprintln!("获取公网 IP 失败: {err}");
            None
        }
    };
    let proxy_public_ip = resolve_proxy_public_ip(&proxy_endpoints).await;

    let capture_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(NetworkOverview {
        primary_private_ipv4,
        primary_ipv6,
        public_ip,
        proxy_public_ip,
        ipv4_addresses,
        ipv6_addresses,
        lan_addresses,
        vpn_status: VpnStatus {
            active: !vpn_interfaces.is_empty(),
            interfaces: vpn_interfaces,
        },
        proxy_env,
        proxy_detected,
        proxy_endpoints,
        capture_timestamp,
    })
}

fn clear_proxy_env_vars() -> (bool, Vec<String>) {
    let mut cleared = Vec::new();
    for key in PROXY_ENV_KEYS {
        if env::var_os(key).is_some() {
            env::remove_var(key);
            cleared.push(key.to_string());
        }
    }
    if cleared.is_empty() {
        (true, vec!["未检测到需要清理的代理环境变量。".into()])
    } else {
        (
            true,
            vec![format!("已清理以下环境变量：{}", cleared.join(", "))],
        )
    }
}

fn reset_system_proxy() -> Result<(bool, Vec<String>), String> {
    #[cfg(target_os = "macos")]
    {
        return macos_reset_system_proxy();
    }
    #[cfg(target_os = "windows")]
    {
        return windows_reset_system_proxy();
    }
    #[cfg(target_os = "linux")]
    {
        return linux_reset_system_proxy();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok((false, vec!["当前系统暂不支持自动重置代理。".into()]))
    }
}

fn flush_dns_cache() -> Result<(bool, Vec<String>), String> {
    #[cfg(target_os = "macos")]
    {
        return macos_flush_dns_cache();
    }
    #[cfg(target_os = "windows")]
    {
        return windows_flush_dns_cache();
    }
    #[cfg(target_os = "linux")]
    {
        return linux_flush_dns_cache();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok((false, vec!["当前系统暂不支持自动刷新 DNS 缓存。".into()]))
    }
}

#[cfg(target_os = "macos")]
fn macos_reset_system_proxy() -> Result<(bool, Vec<String>), String> {
    let output = Command::new("networksetup")
        .arg("-listallnetworkservices")
        .output()
        .map_err(|err| format!("无法列出网络服务: {err}"))?;
    if !output.status.success() {
        return Err(format!(
            "networksetup 返回错误：{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let services: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("An asterisk") {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect();
    if services.is_empty() {
        return Ok((
            false,
            vec!["未找到可操作的网络服务，已跳过代理重置。".into()],
        ));
    }
    let mut success = false;
    let mut messages = Vec::new();
    for service in services.iter() {
        success |=
            disable_macos_proxy_flag(service, "-setwebproxystate", "HTTP 代理", &mut messages);
        success |= disable_macos_proxy_flag(
            service,
            "-setsecurewebproxystate",
            "HTTPS 代理",
            &mut messages,
        );
        success |= disable_macos_proxy_flag(
            service,
            "-setsocksfirewallproxystate",
            "SOCKS 代理",
            &mut messages,
        );
    }
    Ok((success, messages))
}

#[cfg(target_os = "macos")]
fn disable_macos_proxy_flag(
    service: &str,
    flag: &str,
    label: &str,
    messages: &mut Vec<String>,
) -> bool {
    match Command::new("networksetup")
        .arg(flag)
        .arg(service)
        .arg("off")
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                messages.push(format!("{service}: {label} 已关闭。"));
                true
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let err = stderr.trim();
                messages.push(format!(
                    "{service}: {label} 关闭失败 - {}",
                    if err.is_empty() {
                        format!("退出码 {:?}", output.status.code())
                    } else {
                        err.to_string()
                    }
                ));
                false
            }
        }
        Err(err) => {
            messages.push(format!("{service}: {label} 命令执行失败 - {err}"));
            false
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_reset_system_proxy() -> Result<(bool, Vec<String>), String> {
    let mut success = false;
    let mut messages = Vec::new();
    let commands: &[(&[&str], &str)] = &[
        (&["winhttp", "reset", "proxy"], "WinHTTP 代理已重置"),
        (
            &["winhttp", "import", "proxy", "source=ie"],
            "已同步系统代理配置",
        ),
    ];
    for (args, label) in commands {
        match Command::new("netsh").args(*args).output() {
            Ok(output) => {
                if output.status.success() {
                    success = true;
                    messages.push(label.to_string());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let msg = stderr.trim().to_string();
                    messages.push(if msg.is_empty() {
                        format!("{label} 失败，退出码 {:?}", output.status.code())
                    } else {
                        format!("{label} 失败：{msg}")
                    });
                }
            }
            Err(err) => {
                messages.push(format!("{label} 执行失败：{err}"));
            }
        }
    }
    Ok((success, messages))
}

#[cfg(target_os = "linux")]
fn linux_reset_system_proxy() -> Result<(bool, Vec<String>), String> {
    let mut success = false;
    let mut messages = Vec::new();
    let commands: &[(&str, &[&str], &str)] = &[
        (
            "gsettings",
            &["set", "org.gnome.system.proxy", "mode", "none"],
            "已关闭 GNOME 代理模式",
        ),
        (
            "gsettings",
            &["reset-recursively", "org.gnome.system.proxy"],
            "已重置 GNOME 代理配置",
        ),
    ];
    for (program, args, label) in commands {
        match Command::new(program).args(*args).output() {
            Ok(output) => {
                if output.status.success() {
                    success = true;
                    messages.push(label.to_string());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let msg = stderr.trim().to_string();
                    messages.push(if msg.is_empty() {
                        format!("{label} 失败，退出码 {:?}", output.status.code())
                    } else {
                        format!("{label} 失败：{msg}")
                    });
                }
            }
            Err(err) => {
                messages.push(format!("{label} 执行失败：{err}"));
            }
        }
    }
    if !success {
        messages.push("未检测到可自动重置的桌面代理设置，请手动检查。".into());
    }
    Ok((success, messages))
}

#[cfg(target_os = "macos")]
fn macos_flush_dns_cache() -> Result<(bool, Vec<String>), String> {
    let mut success = false;
    let mut messages = Vec::new();
    let commands: &[(&str, &[&str], &str)] = &[
        (
            "dscacheutil",
            &["-flushcache"],
            "已执行 dscacheutil -flushcache",
        ),
        (
            "killall",
            &["-HUP", "mDNSResponder"],
            "已通知 mDNSResponder 刷新缓存",
        ),
    ];
    for (program, args, label) in commands {
        match Command::new(program).args(*args).output() {
            Ok(output) => {
                if output.status.success() {
                    success = true;
                    messages.push(label.to_string());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let msg = stderr.trim().to_string();
                    messages.push(if msg.is_empty() {
                        format!("{label} 失败，退出码 {:?}", output.status.code())
                    } else {
                        format!("{label} 失败：{msg}")
                    });
                }
            }
            Err(err) => messages.push(format!("{label} 执行失败：{err}")),
        }
    }
    Ok((success, messages))
}

#[cfg(target_os = "windows")]
fn windows_flush_dns_cache() -> Result<(bool, Vec<String>), String> {
    match Command::new("ipconfig").arg("/flushdns").output() {
        Ok(output) => {
            if output.status.success() {
                Ok((true, vec!["已刷新 DNS 解析缓存。".into()]))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let msg = stderr.trim().to_string();
                Ok((
                    false,
                    vec![if msg.is_empty() {
                        format!("刷新 DNS 缓存失败，退出码 {:?}", output.status.code())
                    } else {
                        format!("刷新 DNS 缓存失败：{msg}")
                    }],
                ))
            }
        }
        Err(err) => Err(format!("无法调用 ipconfig: {err}")),
    }
}

#[cfg(target_os = "linux")]
fn linux_flush_dns_cache() -> Result<(bool, Vec<String>), String> {
    let mut success = false;
    let mut messages = Vec::new();
    let commands: &[(&str, &[&str], &str)] = &[
        ("resolvectl", &["flush-caches"], "resolvectl 已刷新缓存"),
        (
            "systemd-resolve",
            &["--flush-caches"],
            "systemd-resolve 已刷新缓存",
        ),
        ("nscd", &["-i", "hosts"], "nscd hosts 缓存已刷新"),
    ];
    for (program, args, label) in commands {
        match Command::new(program).args(*args).output() {
            Ok(output) => {
                if output.status.success() {
                    success = true;
                    messages.push(label.to_string());
                    break;
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let msg = stderr.trim().to_string();
                    messages.push(if msg.is_empty() {
                        format!("{label} 失败，退出码 {:?}", output.status.code())
                    } else {
                        format!("{label} 失败：{msg}")
                    });
                }
            }
            Err(err) => messages.push(format!("{label} 执行失败：{err}")),
        }
    }
    if !success {
        messages.push("未能自动刷新 DNS 缓存，请手动执行对应命令。".into());
    }
    Ok((success, messages))
}

fn categorize_ipv4(addr: &Ipv4Addr) -> AddressCategory {
    if addr.is_loopback() {
        return AddressCategory::Loopback;
    }
    if addr.is_private() {
        return AddressCategory::Private;
    }
    if addr.is_link_local() {
        return AddressCategory::LinkLocal;
    }
    AddressCategory::Global
}

fn categorize_ipv6(addr: &Ipv6Addr) -> AddressCategory {
    if addr.is_loopback() || addr.is_unspecified() {
        return AddressCategory::Loopback;
    }
    if addr.is_unique_local() {
        return AddressCategory::Private;
    }
    if addr.is_unicast_link_local() {
        return AddressCategory::LinkLocal;
    }
    AddressCategory::Global
}

fn looks_like_vpn(name: &str) -> bool {
    let lower = name.to_lowercase();
    [
        "tun",
        "tap",
        "ppp",
        "vpn",
        "utun",
        "wg",
        "tailscale",
        "zerotier",
        "nebula",
        "clash",
        "proxy",
        "warp",
        "surge",
        "v2ray",
        "trojan",
        "shadow",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn gather_proxy_env() -> Vec<ProxyEnvVar> {
    PROXY_ENV_KEYS
        .iter()
        .filter_map(|key| env::var(key).ok().map(|value| (key, value)))
        .filter_map(|(key, value)| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return None;
            }
            Some(ProxyEnvVar {
                key: (*key).to_string(),
                value: trimmed.to_string(),
            })
        })
        .collect()
}

fn format_ipv6(addr: Ipv6Addr) -> String {
    addr.to_string()
}

#[derive(Deserialize)]
struct UserAgentInfoResponse {
    ip: Option<String>,
    country: Option<String>,
    region: Option<String>,
    city: Option<String>,
    isp: Option<String>,
    location: Option<String>,
}

#[derive(Deserialize)]
struct IpSbResponse {
    ip: Option<String>,
    country: Option<String>,
    region: Option<String>,
    city: Option<String>,
    isp: Option<String>,
    organization: Option<String>,
    country_code: Option<String>,
    timezone: Option<String>,
    asn: Option<u64>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

async fn fetch_public_ip_info(proxy: Option<&ProxyEndpoint>) -> Result<PublicIpInfo, String> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent("Chef Network Inspector/0.1");
    if let Some(endpoint) = proxy {
        if let Some(proxy) = build_reqwest_proxy(endpoint)? {
            builder = builder.proxy(proxy);
        }
    }
    let client = builder.build().map_err(|err| err.to_string())?;
    fetch_public_ip_with_client(&client, proxy.is_some()).await
}

async fn fetch_public_ip_with_client(
    client: &Client,
    prefer_global: bool,
) -> Result<PublicIpInfo, String> {
    if prefer_global {
        if let Ok(info) = query_ipsb(client).await {
            return Ok(info);
        }
        if let Ok(info) = query_useragentinfo(client).await {
            return Ok(info);
        }
        if let Ok(info) = query_pconline(client).await {
            return Ok(info);
        }
    } else {
        if let Ok(info) = query_pconline(client).await {
            return Ok(info);
        }
        if let Ok(info) = query_useragentinfo(client).await {
            return Ok(info);
        }
        if let Ok(info) = query_ipsb(client).await {
            return Ok(info);
        }
    }
    Err("无法获取公网 IP".into())
}

#[derive(Deserialize)]
struct PconlineResponse {
    ip: Option<String>,
    pro: Option<String>,
    region: Option<String>,
    city: Option<String>,
    addr: Option<String>,
    err: Option<String>,
}

async fn query_pconline(client: &Client) -> Result<PublicIpInfo, String> {
    let resp = client
        .get("https://whois.pconline.com.cn/ipJson.jsp")
        .query(&[("json", "true")])
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?;
    let bytes = resp.bytes().await.map_err(|err| err.to_string())?;
    let (text, _, _) = GBK.decode(&bytes);
    let payload = text.into_owned();
    let data: PconlineResponse = serde_json::from_str(&payload).map_err(|err| err.to_string())?;
    if let Some(ip) = data.ip.clone() {
        let mut location = data.addr.clone().filter(|value| !value.trim().is_empty());
        if location.is_none() {
            let mut parts = Vec::new();
            if let Some(pro) = data.pro.clone().filter(|v| !v.trim().is_empty()) {
                parts.push(pro);
            }
            if let Some(city) = data.city.clone().filter(|v| !v.trim().is_empty()) {
                parts.push(city);
            }
            if let Some(region) = data.region.clone().filter(|v| !v.trim().is_empty()) {
                parts.push(region);
            }
            if !parts.is_empty() {
                location = Some(parts.join(" "));
            }
        }
        return Ok(PublicIpInfo {
            ip,
            country: data.pro.clone(),
            region: data.region.clone(),
            city: data.city.clone(),
            isp: data.addr.clone(),
            organization: None,
            country_code: None,
            timezone: None,
            asn: None,
            latitude: None,
            longitude: None,
            location,
            source: "whois.pconline.com.cn".into(),
        });
    }
    Err(data.err.unwrap_or_else(|| "pconline 响应缺少 IP".into()))
}

async fn query_useragentinfo(client: &Client) -> Result<PublicIpInfo, String> {
    let resp = client
        .get("https://ip.useragentinfo.com/json")
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?;
    let data: UserAgentInfoResponse = resp.json().await.map_err(|err| err.to_string())?;
    if let Some(ip) = data.ip.clone() {
        return Ok(PublicIpInfo {
            ip,
            country: data.country.clone(),
            region: data.region.clone(),
            city: data.city.clone(),
            isp: data.isp.clone(),
            organization: None,
            country_code: None,
            timezone: None,
            asn: None,
            latitude: None,
            longitude: None,
            location: data
                .location
                .or_else(|| match (&data.country, &data.region, &data.city) {
                    (Some(country), Some(region), Some(city)) => {
                        Some(format!("{country} {region} {city}"))
                    }
                    (Some(country), Some(region), None) => Some(format!("{country} {region}")),
                    (Some(country), None, None) => Some(country.clone()),
                    _ => None,
                }),
            source: "ip.useragentinfo.com".into(),
        });
    }
    Err("useragentinfo 响应缺少 IP".into())
}

async fn query_ipsb(client: &Client) -> Result<PublicIpInfo, String> {
    let resp = client
        .get("https://api.ip.sb/geoip")
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?;
    let data: IpSbResponse = resp.json().await.map_err(|err| err.to_string())?;
    if let Some(ip) = data.ip.clone() {
        return Ok(PublicIpInfo {
            ip,
            country: data.country.clone(),
            region: data.region.clone(),
            city: data.city.clone(),
            isp: data.isp.clone(),
            organization: data.organization.clone(),
            country_code: data.country_code.clone(),
            timezone: data.timezone.clone(),
            asn: data
                .asn
                .map(|asn| format!("AS{asn}"))
                .or_else(|| data.organization.clone()),
            latitude: data.latitude,
            longitude: data.longitude,
            location: match (&data.country, &data.region, &data.city) {
                (Some(country), Some(region), Some(city)) => {
                    Some(format!("{country} {region} {city}"))
                }
                (Some(country), Some(region), None) => Some(format!("{country} {region}")),
                (Some(country), None, None) => Some(country.clone()),
                _ => None,
            },
            source: "api.ip.sb".into(),
        });
    }
    Err("ip.sb 响应缺少 IP".into())
}

async fn resolve_proxy_public_ip(endpoints: &[ProxyEndpoint]) -> Option<PublicIpInfo> {
    for endpoint in endpoints {
        match fetch_public_ip_info(Some(endpoint)).await {
            Ok(info) => return Some(info),
            Err(err) => eprintln!(
                "通过代理 {}:{} ({:?}) 获取公网 IP 失败: {err}",
                endpoint.host, endpoint.port, endpoint.protocol
            ),
        }
    }
    None
}

fn detect_proxy_endpoints() -> Vec<ProxyEndpoint> {
    let mut endpoints = Vec::new();
    detect_env_proxy_endpoints(&mut endpoints);
    #[cfg(target_os = "macos")]
    detect_macos_proxy_endpoints(&mut endpoints);
    endpoints
}

fn detect_env_proxy_endpoints(endpoints: &mut Vec<ProxyEndpoint>) {
    const CANDIDATES: [(&str, ProxyProtocol); 8] = [
        ("HTTP_PROXY", ProxyProtocol::Http),
        ("http_proxy", ProxyProtocol::Http),
        ("HTTPS_PROXY", ProxyProtocol::Https),
        ("https_proxy", ProxyProtocol::Https),
        ("ALL_PROXY", ProxyProtocol::Socks5),
        ("all_proxy", ProxyProtocol::Socks5),
        ("SOCKS_PROXY", ProxyProtocol::Socks5),
        ("socks_proxy", ProxyProtocol::Socks5),
    ];
    for (key, protocol) in CANDIDATES {
        if let Ok(value) = env::var(key) {
            if let Some((host, port)) = parse_proxy_value(&value, protocol) {
                push_endpoint(endpoints, protocol, host, port, &format!("env:{key}"));
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn detect_macos_proxy_endpoints(endpoints: &mut Vec<ProxyEndpoint>) {
    if let Ok(output) = Command::new("scutil").arg("--proxy").output() {
        if !output.status.success() {
            return;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let map: HashMap<_, _> = stdout
            .lines()
            .filter_map(|line| {
                line.split_once(':')
                    .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
            })
            .collect();
        if map.get("HTTPEnable").map(|v| v == "1").unwrap_or(false) {
            if let (Some(host), Some(port)) = (map.get("HTTPProxy"), map.get("HTTPPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    push_endpoint(
                        endpoints,
                        ProxyProtocol::Http,
                        host.clone(),
                        port,
                        "mac:scutil",
                    );
                }
            }
        }
        if map.get("HTTPSEnable").map(|v| v == "1").unwrap_or(false) {
            if let (Some(host), Some(port)) = (map.get("HTTPSProxy"), map.get("HTTPSPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    push_endpoint(
                        endpoints,
                        ProxyProtocol::Https,
                        host.clone(),
                        port,
                        "mac:scutil",
                    );
                }
            }
        }
        if map.get("SOCKSEnable").map(|v| v == "1").unwrap_or(false) {
            if let (Some(host), Some(port)) = (map.get("SOCKSProxy"), map.get("SOCKSPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    push_endpoint(
                        endpoints,
                        ProxyProtocol::Socks5,
                        host.clone(),
                        port,
                        "mac:scutil",
                    );
                }
            }
        }
    }
}

fn parse_proxy_value(value: &str, protocol: ProxyProtocol) -> Option<(String, u16)> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("{}://{}", protocol.scheme(), trimmed)
    };
    let parsed = Url::parse(&candidate).ok()?;
    let host = parsed.host_str()?.to_string();
    let port = parsed.port_or_known_default()?;
    Some((host, port))
}

fn push_endpoint(
    endpoints: &mut Vec<ProxyEndpoint>,
    protocol: ProxyProtocol,
    host: String,
    port: u16,
    source: &str,
) {
    if endpoints.iter().any(|existing| {
        existing.protocol == protocol && existing.host == host && existing.port == port
    }) {
        return;
    }
    endpoints.push(ProxyEndpoint {
        protocol,
        host,
        port,
        source: source.to_string(),
    });
}

fn build_reqwest_proxy(endpoint: &ProxyEndpoint) -> Result<Option<ReqwestProxy>, String> {
    let url = format!(
        "{}://{}:{}",
        endpoint.protocol.scheme(),
        endpoint.host,
        endpoint.port
    );
    let proxy = ReqwestProxy::all(&url).map_err(|err| err.to_string())?;
    Ok(Some(proxy))
}
