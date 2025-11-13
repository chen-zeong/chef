use serde::Serialize;
use std::{env, fs, path::PathBuf};

#[derive(Serialize)]
pub struct EnvEntryPayload {
    pub key: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct EnvSourcePayload {
    pub source: String,
    pub entries: Vec<EnvEntryPayload>,
}

#[tauri::command]
pub fn read_environment_sources() -> Result<Vec<EnvSourcePayload>, String> {
    #[cfg(target_os = "windows")]
    {
        read_windows_env_sources()
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(read_unix_env_sources())
    }
}

#[cfg(not(target_os = "windows"))]
fn read_unix_env_sources() -> Vec<EnvSourcePayload> {
    let home = env::var("HOME").unwrap_or_default();
    let mut candidates: Vec<PathBuf> = vec![
        ".zshrc".into(),
        ".zprofile".into(),
        ".bash_profile".into(),
        ".bashrc".into(),
        ".profile".into(),
        ".env".into(),
    ];

    let mut absolute_candidates: Vec<PathBuf> = candidates
        .drain(..)
        .map(|relative| {
            if relative.is_absolute() {
                relative
            } else {
                PathBuf::from(&home).join(relative)
            }
        })
        .collect();

    absolute_candidates.push(PathBuf::from("/etc/environment"));
    absolute_candidates.push(PathBuf::from("/etc/paths"));

    let mut sources = Vec::new();
    for path in absolute_candidates {
        if let Ok(content) = fs::read_to_string(&path) {
            let entries = parse_env_file(&content);
            if !entries.is_empty() {
                sources.push(EnvSourcePayload {
                    source: display_path(&path, &home),
                    entries,
                });
            }
        }
    }

    if sources.is_empty() {
        let entries = env::vars()
            .map(|(key, value)| EnvEntryPayload { key, value })
            .collect::<Vec<_>>();
        if !entries.is_empty() {
            sources.push(EnvSourcePayload {
                source: "process".into(),
                entries,
            });
        }
    }

    sources
}

#[cfg(target_os = "windows")]
fn read_windows_env_sources() -> Result<Vec<EnvSourcePayload>, String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut sources = Vec::new();

    let hives = [
        (HKEY_CURRENT_USER, "Environment", "HKCU\\Environment"),
        (
            HKEY_LOCAL_MACHINE,
            "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
            "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
        ),
    ];

    for (hive, path, label) in hives {
        let reg = RegKey::predef(hive);
        if let Ok(subkey) = reg.open_subkey(path) {
            let entries = subkey
                .enum_values()
                .filter_map(|value| value.ok())
                .map(|(name, data)| EnvEntryPayload {
                    key: name,
                    value: data.to_string(),
                })
                .collect::<Vec<_>>();
            if !entries.is_empty() {
                sources.push(EnvSourcePayload {
                    source: label.to_string(),
                    entries,
                });
            }
        }
    }

    if sources.is_empty() {
        let entries = env::vars()
            .map(|(key, value)| EnvEntryPayload { key, value })
            .collect::<Vec<_>>();
        if !entries.is_empty() {
            sources.push(EnvSourcePayload {
                source: "Process".into(),
                entries,
            });
        }
    }

    Ok(sources)
}

fn parse_env_file(content: &str) -> Vec<EnvEntryPayload> {
    let mut entries = Vec::new();
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        if line.is_empty() {
            continue;
        }
        let sanitized = strip_inline_comment(line);
        let mut parts = sanitized.splitn(2, '=');
        let key = parts.next().unwrap_or("").trim();
        if key.is_empty() {
            continue;
        }
        let value = parts.next().unwrap_or("").trim();
        let value = value.trim_matches(|c| c == '"' || c == '\'');
        entries.push(EnvEntryPayload {
            key: key.to_string(),
            value: value.to_string(),
        });
    }
    entries
}

fn strip_inline_comment(input: &str) -> String {
    let mut result = String::new();
    let mut chars = input.chars();
    let mut in_single = false;
    let mut in_double = false;
    while let Some(ch) = chars.next() {
        match ch {
            '\'' if !in_double => {
                in_single = !in_single;
                result.push(ch);
            }
            '"' if !in_single => {
                in_double = !in_double;
                result.push(ch);
            }
            '#' if !in_single && !in_double => break,
            _ => result.push(ch),
        }
    }
    result.trim().to_string()
}

fn display_path(path: &PathBuf, home: &str) -> String {
    let path_str = path.display().to_string();
    if home.is_empty() {
        return path_str;
    }
    let home_with_sep = format!("{home}/");
    if path_str.starts_with(&home_with_sep) {
        path_str.replacen(&home_with_sep, "~/", 1)
    } else {
        path_str
    }
}
