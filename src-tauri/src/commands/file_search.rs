use rfd::FileDialog;
use rust_search::{similarity_sort, FileSize, FilterExt, SearchBuilder};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env,
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::async_runtime;

const DEFAULT_RESULT_LIMIT: usize = 200;
const MAX_RESULT_LIMIT: usize = 2000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchRequest {
    pub query: String,
    pub location: Option<String>,
    #[serde(default)]
    pub more_locations: Vec<String>,
    pub limit: Option<usize>,
    pub depth: Option<usize>,
    #[serde(default)]
    pub include_hidden: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub strict: bool,
    #[serde(default)]
    pub sort_by_similarity: bool,
    pub size_min: Option<SizeFilterInput>,
    pub size_max: Option<SizeFilterInput>,
    pub created_after: Option<u64>,
    pub created_before: Option<u64>,
    pub modified_after: Option<u64>,
    pub modified_before: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchHit {
    pub path: String,
    pub file_name: String,
    pub parent_dir: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResponse {
    pub hits: Vec<FileSearchHit>,
    pub duration_ms: u128,
    pub base_location: String,
}

#[tauri::command]
pub async fn search_files(options: FileSearchRequest) -> Result<FileSearchResponse, String> {
    if options.query.trim().is_empty() {
        return Err("请输入要搜索的关键字。".into());
    }

    async_runtime::spawn_blocking(move || run_search(options))
        .await
        .map_err(|err| format!("执行搜索失败: {err}"))?
}

#[tauri::command]
pub async fn pick_search_directories(
    multiple: bool,
    default_path: Option<String>,
) -> Result<Vec<String>, String> {
    let default_dir = default_path.and_then(|value| normalize_path(&value));
    async_runtime::spawn_blocking(move || {
        let mut dialog = FileDialog::new().set_title("选择搜索目录");
        if let Some(ref path) = default_dir {
            dialog = dialog.set_directory(path);
        }
        if multiple {
            Ok(dialog
                .pick_folders()
                .unwrap_or_default()
                .into_iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect())
        } else {
            Ok(dialog
                .pick_folder()
                .into_iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect())
        }
    })
    .await
    .map_err(|err| format!("打开目录选择器失败: {err}"))?
}

#[derive(Debug, Deserialize, Copy, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SizeFilterInput {
    pub value: f64,
    pub unit: SizeUnit,
}

#[derive(Debug, Deserialize, Copy, Clone)]
pub enum SizeUnit {
    #[serde(rename = "B")]
    B,
    #[serde(rename = "KB")]
    KB,
    #[serde(rename = "MB")]
    MB,
    #[serde(rename = "GB")]
    GB,
    #[serde(rename = "TB")]
    TB,
}

impl SizeFilterInput {
    fn to_bytes(self) -> u64 {
        (self.value.max(0.0) * self.unit.multiplier()).round() as u64
    }

    fn to_file_size(self) -> FileSize {
        match self.unit {
            SizeUnit::B => FileSize::Byte(self.value.max(0.0).round() as u64),
            SizeUnit::KB => FileSize::Kilobyte(self.value),
            SizeUnit::MB => FileSize::Megabyte(self.value),
            SizeUnit::GB => FileSize::Gigabyte(self.value),
            SizeUnit::TB => FileSize::Terabyte(self.value),
        }
    }
}

impl SizeUnit {
    fn multiplier(self) -> f64 {
        match self {
            SizeUnit::B => 1.0,
            SizeUnit::KB => 1024.0,
            SizeUnit::MB => 1024.0f64.powi(2),
            SizeUnit::GB => 1024.0f64.powi(3),
            SizeUnit::TB => 1024.0f64.powi(4),
        }
    }
}

fn run_search(options: FileSearchRequest) -> Result<FileSearchResponse, String> {
    let FileSearchRequest {
        query,
        location,
        more_locations,
        limit,
        depth,
        include_hidden,
        case_sensitive,
        strict,
        sort_by_similarity,
        size_min,
        size_max,
        created_after,
        created_before,
        modified_after,
        modified_before,
    } = options;

    let query = query.trim().to_string();
    let mut builder = SearchBuilder::default();

    if let (Some(min), Some(max)) = (size_min, size_max) {
        if min.to_bytes() > max.to_bytes() {
            return Err("最小文件大小不能大于最大文件大小。".into());
        }
    }
    if let (Some(after), Some(before)) = (created_after, created_before) {
        if after > before {
            return Err("创建时间的开始不能晚于结束。".into());
        }
    }
    if let (Some(after), Some(before)) = (modified_after, modified_before) {
        if after > before {
            return Err("修改时间的开始不能晚于结束。".into());
        }
    }

    let base_location = location
        .as_deref()
        .and_then(normalize_path)
        .unwrap_or_else(default_location);
    builder = builder.location(&base_location);

    let limit = limit.unwrap_or(DEFAULT_RESULT_LIMIT).clamp(1, MAX_RESULT_LIMIT);

    if let Some(depth) = depth {
        builder = builder.depth(depth);
    }
    builder = builder.search_input(&query).limit(limit);

    if include_hidden {
        builder = builder.hidden();
    }
    if !case_sensitive {
        builder = builder.ignore_case();
    }
    if strict {
        builder = builder.strict();
    }

    if let Some(min_filter) = size_min {
        builder = builder.file_size_greater(min_filter.to_file_size());
    }
    if let Some(max_filter) = size_max {
        builder = builder.file_size_smaller(max_filter.to_file_size());
    }
    if let Some(created_after) = created_after {
        builder = builder.created_after(millis_to_system_time(created_after));
    }
    if let Some(created_before) = created_before {
        builder = builder.created_before(millis_to_system_time(created_before));
    }
    if let Some(modified_after) = modified_after {
        builder = builder.modified_after(millis_to_system_time(modified_after));
    }
    if let Some(modified_before) = modified_before {
        builder = builder.modified_before(millis_to_system_time(modified_before));
    }

    let extra_locations = parse_additional_locations(&more_locations, &base_location);
    if !extra_locations.is_empty() {
        builder = builder.more_locations(extra_locations);
    }

    let start = Instant::now();
    let mut hits: Vec<String> = builder.build().collect();

    if sort_by_similarity {
        similarity_sort(&mut hits, &query);
    }

    if hits.len() > limit {
        hits.truncate(limit);
    }

    let response_hits = hits.into_iter().map(into_hit).collect();
    Ok(FileSearchResponse {
        hits: response_hits,
        duration_ms: start.elapsed().as_millis(),
        base_location: base_location.display().to_string(),
    })
}

fn into_hit(path: String) -> FileSearchHit {
    let path_buf = PathBuf::from(&path);
    let file_name = path_buf
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let parent_dir = path_buf
        .parent()
        .map(|parent| parent.display().to_string())
        .unwrap_or_else(|| path.clone());

    if let Ok(metadata) = fs::metadata(&path_buf) {
        let is_dir = metadata.is_dir();
        let size = if metadata.is_file() {
            Some(metadata.len())
        } else {
            None
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs());

        FileSearchHit {
            path,
            file_name,
            parent_dir,
            is_dir,
            size,
            modified,
        }
    } else {
        FileSearchHit {
            path,
            file_name,
            parent_dir,
            is_dir: false,
            size: None,
            modified: None,
        }
    }
}

fn parse_additional_locations(paths: &[String], base: &Path) -> Vec<PathBuf> {
    let mut normalized = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    for item in paths {
        if let Some(path) = normalize_path(item) {
            if path == base {
                continue;
            }
            if seen.insert(path.clone()) {
                normalized.push(path);
            }
        }
    }
    normalized
}

fn normalize_path(input: &str) -> Option<PathBuf> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(PathBuf::from(trimmed))
}

fn default_location() -> PathBuf {
    detect_home_dir().unwrap_or_else(|| {
        env::current_dir().unwrap_or_else(|_| {
            #[cfg(target_os = "windows")]
            {
                PathBuf::from("C:\\")
            }
            #[cfg(not(target_os = "windows"))]
            {
                PathBuf::from("/")
            }
        })
    })
}

fn detect_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        env::var("USERPROFILE")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                let drive = env::var("HOMEDRIVE").ok();
                let path = env::var("HOMEPATH").ok();
                match (drive, path) {
                    (Some(drive), Some(path)) => Some(PathBuf::from(format!("{drive}{path}"))),
                    _ => None,
                }
            })
    }
    #[cfg(not(target_os = "windows"))]
    {
        env::var("HOME").ok().map(PathBuf::from)
    }
}

fn millis_to_system_time(millis: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_millis(millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs::{self, File},
        io::Write,
    };
    use uuid::Uuid;

    fn create_temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("chef_search_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[test]
    fn filters_by_megabyte_threshold() {
        let temp_dir = create_temp_dir();
        let file_path = temp_dir.join("large_sample.bin");
        let mut file = File::create(&file_path).expect("failed to create test file");
        file.write_all(&vec![0u8; 2 * 1024 * 1024])
            .expect("failed to write test data");

        let request = FileSearchRequest {
            query: "large_sample".into(),
            location: Some(temp_dir.display().to_string()),
            more_locations: vec![],
            limit: Some(10),
            depth: Some(1),
            include_hidden: false,
            case_sensitive: false,
            strict: false,
            sort_by_similarity: false,
            size_min: Some(SizeFilterInput {
                value: 1.0,
                unit: SizeUnit::MB,
            }),
            size_max: None,
            created_after: None,
            created_before: None,
            modified_after: None,
            modified_before: None,
        };

        let response = run_search(request).expect("search should succeed");
        assert_eq!(response.hits.len(), 1, "expected one file larger than 1MB");

        let _ = fs::remove_file(&file_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
