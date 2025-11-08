use std::{
    net::{IpAddr, Ipv6Addr},
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    body::Body,
    extract::{Path as AxumPath, State as AxumState},
    http::{header, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use mime_guess::MimeGuess;
use once_cell::sync::Lazy;
use rfd::FileDialog;
use serde::Serialize;
use tauri::async_runtime::{self, JoinHandle};
use tokio::{fs::File, net::TcpListener, sync::Mutex};
use tokio_util::io::ReaderStream;
use uuid::Uuid;
use walkdir::WalkDir;

static LAST_SHARE_DIR: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));
static SHARE_PAGE_TEMPLATE: &str = include_str!("../../../share/share-template.html");

#[derive(Default)]
pub struct FileShareManager {
    inner: Mutex<Option<ActiveShare>>,
}

#[derive(Clone)]
struct ServerFile {
    id: String,
    display_name: String,
    download_name: String,
    size: u64,
    extension: Option<String>,
    path: PathBuf,
    mime: MimeGuess,
}

#[derive(Clone, Serialize)]
pub struct SharedFileMeta {
    pub id: String,
    pub display_name: String,
    pub download_name: String,
    pub size: u64,
    pub extension: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct FileShareSession {
    pub port: u16,
    pub addresses: Vec<String>,
    pub primary_url: String,
    pub files: Vec<SharedFileMeta>,
}

struct ActiveShare {
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    handle: JoinHandle<()>,
    session: FileShareSession,
}

impl ActiveShare {
    async fn shutdown(self) {
        if let Some(tx) = self.shutdown {
            let _ = tx.send(());
        }
        let _ = self.handle.await;
    }
}

#[derive(Clone)]
struct HttpState {
    files: Arc<Vec<ServerFile>>,
    accent_color: String,
}

#[tauri::command]
pub async fn start_file_share(
    state: tauri::State<'_, FileShareManager>,
    files: Vec<String>,
) -> Result<FileShareSession, String> {
    state.start(files).await
}

#[tauri::command]
pub async fn stop_file_share(state: tauri::State<'_, FileShareManager>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn get_file_share_status(
    state: tauri::State<'_, FileShareManager>,
) -> Result<Option<FileShareSession>, String> {
    Ok(state.snapshot().await)
}

#[tauri::command]
pub async fn pick_share_files() -> Result<Vec<String>, String> {
    let selection = async_runtime::spawn_blocking(|| {
        FileDialog::new().set_title("选择要分享的文件").pick_files()
    })
    .await
    .map_err(|err| format!("打开文件对话框失败: {err}"))?;

    Ok(selection
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn pick_share_directories() -> Result<Vec<String>, String> {
    let last_dir = {
        let guard = LAST_SHARE_DIR.lock().await;
        guard.clone()
    };

    let last_dir_clone = last_dir.clone();
    let selection = async_runtime::spawn_blocking(move || {
        let mut dialog = FileDialog::new().set_title("选择要分享的文件夹");
        if let Some(path) = last_dir_clone.as_ref() {
            dialog = dialog.set_directory(path);
        }
        dialog.pick_folders()
    })
    .await
    .map_err(|err| format!("打开文件夹对话框失败: {err}"))?;

    let folders = selection
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();

    if let Some(first) = folders.get(0) {
        let mut guard = LAST_SHARE_DIR.lock().await;
        *guard = Some(PathBuf::from(first));
    }

    Ok(folders)
}

impl FileShareManager {
    async fn start(&self, files: Vec<String>) -> Result<FileShareSession, String> {
        if files.is_empty() {
            return Err("请选择至少一个需要分享的文件。".into());
        }

        let server_files = build_server_files(&files)?;
        let files_arc = Arc::new(server_files);
        let http_state = HttpState {
            files: Arc::clone(&files_arc),
            accent_color: "#2563eb".to_string(),
        };
        let files_meta = files_arc
            .iter()
            .map(|file| SharedFileMeta {
                id: file.id.clone(),
                display_name: file.display_name.clone(),
                download_name: file.download_name.clone(),
                size: file.size,
                extension: file.extension.clone(),
            })
            .collect::<Vec<_>>();

        let listener = TcpListener::bind("0.0.0.0:0")
            .await
            .map_err(|err| format!("无法启动服务: {err}"))?;
        let port = listener
            .local_addr()
            .map_err(|err| format!("无法获取端口: {err}"))?
            .port();

        let addresses = collect_accessible_urls(port);
        let preferred_url = addresses
            .iter()
            .find(|url| url.starts_with("http://192."))
            .cloned();
        let primary_url = preferred_url
            .or_else(|| {
                addresses
                    .iter()
                    .find(|url| !url.contains("127.0.0.1") && !url.contains("localhost"))
                    .cloned()
            })
            .unwrap_or_else(|| format!("http://127.0.0.1:{port}"));

        let router = Router::new()
            .route("/", get(serve_index))
            .route("/files/:id", get(download_file))
            .with_state(http_state);

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let handle = async_runtime::spawn(async move {
            let server = axum::serve(listener, router).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
            if let Err(err) = server.await {
                eprintln!("文件分享服务异常: {err}");
            }
        });

        let session = FileShareSession {
            port,
            addresses: vec![primary_url.clone()],
            primary_url: primary_url.clone(),
            files: files_meta,
        };

        let mut guard = self.inner.lock().await;
        if let Some(active) = guard.take() {
            active.shutdown().await;
        }
        *guard = Some(ActiveShare {
            shutdown: Some(shutdown_tx),
            handle,
            session: session.clone(),
        });
        drop(guard);

        Ok(session)
    }

    async fn stop(&self) {
        let active = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(active) = active {
            active.shutdown().await;
        }
    }

    async fn snapshot(&self) -> Option<FileShareSession> {
        let guard = self.inner.lock().await;
        guard.as_ref().map(|share| share.session.clone())
    }
}

fn build_server_files(entries: &[String]) -> Result<Vec<ServerFile>, String> {
    let mut result = Vec::new();
    for raw_path in entries {
        let canonical = Path::new(raw_path)
            .canonicalize()
            .map_err(|err| format!("无法读取路径 {raw_path}: {err}"))?;
        let metadata = canonical
            .metadata()
            .map_err(|err| format!("无法获取文件信息 {raw_path}: {err}"))?;

        if metadata.is_file() {
            let display = canonical
                .file_name()
                .and_then(|os| os.to_str())
                .ok_or_else(|| format!("无法解析文件名：{raw_path}"))?
                .to_string();
            push_file_entry(&mut result, &canonical, display)?;
            continue;
        }

        if metadata.is_dir() {
            let folder_label = canonical
                .file_name()
                .and_then(|os| os.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| canonical.to_string_lossy().to_string());

            for entry in WalkDir::new(&canonical).into_iter() {
                let entry = entry.map_err(|err| format!("读取文件夹 {raw_path} 时出错: {err}"))?;
                if !entry.file_type().is_file() {
                    continue;
                }
                let relative = entry
                    .path()
                    .strip_prefix(&canonical)
                    .map_err(|err| format!("解析文件夹结构失败: {err}"))?;
                let relative_str = relative.to_string_lossy().replace('\\', "/");
                let display = format!("{}/{}", folder_label, relative_str);
                push_file_entry(&mut result, entry.path(), display)?;
            }
        }
    }

    if result.is_empty() {
        return Err("所选项目中没有可分享的文件。".into());
    }
    Ok(result)
}

fn push_file_entry(
    result: &mut Vec<ServerFile>,
    path: &Path,
    display_name: String,
) -> Result<(), String> {
    let metadata = path
        .metadata()
        .map_err(|err| format!("无法获取文件信息 {}: {err}", path.display()))?;
    if !metadata.is_file() {
        return Ok(());
    }
    let download_name = path
        .file_name()
        .and_then(|os| os.to_str())
        .ok_or_else(|| format!("无法解析文件名：{}", path.display()))?
        .to_string();

    result.push(ServerFile {
        id: Uuid::new_v4().to_string(),
        display_name,
        download_name,
        size: metadata.len(),
        extension: path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_string()),
        path: path.to_path_buf(),
        mime: mime_guess::from_path(path),
    });

    Ok(())
}

fn collect_accessible_urls(port: u16) -> Vec<String> {
    let mut urls = vec![
        format!("http://localhost:{port}"),
        format!("http://127.0.0.1:{port}"),
    ];
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            let ip = iface.ip();
            if ip.is_loopback() {
                continue;
            }
            match ip {
                IpAddr::V4(v4) => urls.push(format!("http://{}:{port}", v4)),
                IpAddr::V6(v6) => {
                    let addr = format_ipv6(v6);
                    urls.push(format!("http://[{addr}]:{port}"));
                }
            }
        }
    }
    urls.sort();
    urls.dedup();
    urls
}

fn format_ipv6(addr: Ipv6Addr) -> String {
    if addr.segments().iter().all(|segment| *segment == 0) {
        return "::".into();
    }
    addr.to_string()
}

async fn serve_index(AxumState(state): AxumState<HttpState>) -> impl IntoResponse {
    let file_list_markup = state
        .files
        .iter()
        .map(|file| {
            let description = match &file.extension {
                Some(ext) => format!("{} · {}", ext.to_uppercase(), format_size(file.size)),
                None => format_size(file.size),
            };
            format!(
                r#"<article class=\"file-card\"><div class=\"file-card__main\"><span class=\"file-card__icon\">📁</span><div><p class=\"file-name\">{}</p><p class=\"file-desc\">{}</p></div></div><div class=\"file-meta\">{}</div><a class=\"file-btn\" href=\"/files/{}\" download><span>下载</span><span class=\"file-btn__icon\">⤓</span></a></article>"#,
                escape_html(&file.display_name),
                escape_html(&description),
                format_size(file.size),
                file.id
            )
        })
        .collect::<Vec<_>>()
        .join("");

    let total_files = state.files.len().to_string();
    let total_size = format_size(state.files.iter().map(|file| file.size).sum());

    let html = SHARE_PAGE_TEMPLATE
        .replace("__ACCENT__", &state.accent_color)
        .replace("__FILE_COUNT__", &total_files)
        .replace("__TOTAL_SIZE__", &total_size)
        .replace("__FILE_LIST__", &file_list_markup);

    Html(html)
}

async fn download_file(
    AxumPath(file_id): AxumPath<String>,
    AxumState(state): AxumState<HttpState>,
) -> impl IntoResponse {
    if let Some(file) = state.files.iter().find(|file| file.id == file_id) {
        match File::open(&file.path).await {
            Ok(f) => {
                let stream = ReaderStream::new(f);
                let body = Body::from_stream(stream);
                let mut response = Response::new(body);
                let mime = file.mime.first_raw().unwrap_or("application/octet-stream");
                if let Ok(value) = HeaderValue::from_str(mime) {
                    response.headers_mut().insert(header::CONTENT_TYPE, value);
                }
                let disposition = format!(
                    "attachment; filename=\"{}\"",
                    sanitize_filename(&file.download_name)
                );
                if let Ok(value) = HeaderValue::from_str(&disposition) {
                    response
                        .headers_mut()
                        .insert(header::CONTENT_DISPOSITION, value);
                }
                response
            }
            Err(_) => (StatusCode::NOT_FOUND, "文件不再可用，请在桌面端重新选择。").into_response(),
        }
    } else {
        (StatusCode::NOT_FOUND, "你要找的文件不存在。").into_response()
    }
}

fn escape_html(input: &str) -> String {
    input
        .chars()
        .map(|ch| match ch {
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            '\'' => "&#39;".into(),
            '&' => "&amp;".into(),
            _ => ch.to_string(),
        })
        .collect()
}

fn sanitize_filename(input: &str) -> String {
    input
        .chars()
        .map(|ch| match ch {
            '"' | '\\' | '/' | ':' | '*' | '?' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect()
}

fn format_size(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if size == 0 {
        return "0 B".into();
    }
    let mut value = size as f64;
    let mut unit_index = 0;
    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }
    if unit_index == 0 {
        format!("{size} {}", UNITS[unit_index])
    } else {
        format!("{value:.1} {}", UNITS[unit_index])
    }
}
