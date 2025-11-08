use std::{
    collections::HashMap,
    env,
    net::{Ipv4Addr, Ipv6Addr},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(target_os = "macos")]
use std::process::Command;

use encoding_rs::GBK;
use if_addrs::{get_if_addrs, IfAddr};
use reqwest::{Client, Proxy as ReqwestProxy, Url};
use serde::{Deserialize, Serialize};

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

impl ProxyProtocol {
    fn scheme(self) -> &'static str {
        match self {
            ProxyProtocol::Http | ProxyProtocol::Https => "http",
            ProxyProtocol::Socks5 => "socks5h",
        }
    }
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
    const KEYS: [&str; 6] = [
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
    ];
    KEYS.iter()
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

async fn fetch_public_ip_with_client(client: &Client, prefer_global: bool) -> Result<PublicIpInfo, String> {
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
        let mut location = data
            .addr
            .clone()
            .filter(|value| !value.trim().is_empty());
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
                (Some(country), Some(region), Some(city)) => Some(format!("{country} {region} {city}")),
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
            .filter_map(|line| line.split_once(':').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
            .collect();
        if map.get("HTTPEnable").map(|v| v == "1").unwrap_or(false) {
            if let (Some(host), Some(port)) = (map.get("HTTPProxy"), map.get("HTTPPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    push_endpoint(endpoints, ProxyProtocol::Http, host.clone(), port, "mac:scutil");
                }
            }
        }
        if map.get("HTTPSEnable").map(|v| v == "1").unwrap_or(false) {
            if let (Some(host), Some(port)) = (map.get("HTTPSProxy"), map.get("HTTPSPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    push_endpoint(endpoints, ProxyProtocol::Https, host.clone(), port, "mac:scutil");
                }
            }
        }
        if map.get("SOCKSEnable").map(|v| v == "1").unwrap_or(false) {
            if let (Some(host), Some(port)) = (map.get("SOCKSProxy"), map.get("SOCKSPort")) {
                if let Ok(port) = port.parse::<u16>() {
                    push_endpoint(endpoints, ProxyProtocol::Socks5, host.clone(), port, "mac:scutil");
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
    let url = format!("{}://{}:{}", endpoint.protocol.scheme(), endpoint.host, endpoint.port);
    let proxy = ReqwestProxy::all(&url).map_err(|err| err.to_string())?;
    Ok(Some(proxy))
}
