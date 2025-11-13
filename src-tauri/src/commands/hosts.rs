use serde::Serialize;
use std::{fs, path::PathBuf};

#[derive(Serialize)]
pub struct HostEntryPayload {
    pub ip: String,
    pub domains: Vec<String>,
    pub comment: Option<String>,
    pub enabled: bool,
    pub raw: String,
}

#[derive(Serialize)]
pub struct HostFilePayload {
    pub source: String,
    pub entries: Vec<HostEntryPayload>,
}

#[tauri::command]
pub fn read_hosts_file() -> Result<HostFilePayload, String> {
    let path = hosts_path().ok_or_else(|| "无法确定 hosts 文件路径".to_string())?;
    let content = fs::read_to_string(&path).map_err(|error| format!("读取 hosts 失败: {error}"))?;
    let entries = parse_hosts_file(&content);
    Ok(HostFilePayload {
        source: path.display().to_string(),
        entries,
    })
}

fn hosts_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let mut path = PathBuf::from(system_root);
        path.push("System32\\drivers\\etc\\hosts");
        Some(path)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Some(PathBuf::from("/etc/hosts"))
    }
}

fn parse_hosts_file(content: &str) -> Vec<HostEntryPayload> {
    content
        .lines()
        .filter_map(|line| parse_host_line(line))
        .collect()
}

fn parse_host_line(line: &str) -> Option<HostEntryPayload> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let (enabled, remainder) = if trimmed.starts_with('#') {
        (false, trimmed.trim_start_matches('#').trim_start())
    } else {
        (true, trimmed)
    };
    if remainder.is_empty() {
        return None;
    }
    let mut parts = remainder.splitn(2, '#');
    let body = parts.next().unwrap_or("").trim();
    if body.is_empty() {
        return None;
    }
    let comment = parts.next().map(|value| value.trim().to_string()).filter(|value| !value.is_empty());

    let mut tokens = body.split_whitespace();
    let ip = tokens.next()?.to_string();
    if !is_valid_ip(&ip) {
        return None;
    }
    let domains: Vec<String> = tokens.map(|token| token.to_string()).collect();
    if domains.is_empty() {
        return None;
    }
    Some(HostEntryPayload {
        ip,
        domains,
        comment,
        enabled,
        raw: line.to_string(),
    })
}

fn is_valid_ip(ip: &str) -> bool {
    is_valid_ipv4(ip) || is_valid_ipv6(ip)
}

fn is_valid_ipv4(ip: &str) -> bool {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    for part in parts {
        if part.is_empty() {
            return false;
        }
        if part.parse::<u8>().is_err() {
            return false;
        }
    }
    true
}

fn is_valid_ipv6(ip: &str) -> bool {
    if ip.contains("::") {
        if ip.matches("::").count() > 1 {
            return false;
        }
    }
    let cleaned = ip.trim_matches(':');
    if cleaned.is_empty() {
        return false;
    }
    cleaned
        .split(':')
        .filter(|segment| !segment.is_empty())
        .all(|segment| segment.len() <= 4 && segment.chars().all(|c| c.is_ascii_hexdigit()))
}
