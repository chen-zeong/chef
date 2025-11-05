#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use std::sync::{Mutex, OnceLock};
use tauri::{
    async_runtime,
    window::Color,
    Emitter,
    LogicalPosition,
    LogicalSize,
    Manager,
    Position,
    Size,
    WebviewUrl,
    WebviewWindow,
    WebviewWindowBuilder,
};

#[derive(Debug, Clone, Deserialize)]
struct CaptureRegion {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    #[serde(default = "default_scale", alias = "scaleX")]
    scale_x: f64,
    #[serde(default = "default_scale", alias = "scaleY")]
    scale_y: f64,
}

#[derive(Debug, Serialize)]
struct CaptureSuccessPayload {
    path: String,
    base64: String,
    width: u32,
    height: u32,
    created_at: u128,
    logical_width: u32,
    logical_height: u32,
}

#[derive(Debug, Deserialize)]
struct FinalizeCaptureRequest {
    path: String,
    base64: String,
    width: u32,
    height: u32,
    logical_width: u32,
    logical_height: u32,
}

#[derive(Debug, Serialize)]
struct OverlayMetadata {
    origin_x: i32,
    origin_y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    logical_origin_x: f64,
    logical_origin_y: f64,
    logical_width: f64,
    logical_height: f64,
}

fn default_scale() -> f64 {
    1.0
}

#[tauri::command]
async fn show_region_capture_overlay(app: tauri::AppHandle) -> Result<(), String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;

    if monitors.is_empty() {
        return Err("未能获取显示器信息".into());
    }

    apply_overlay_presentation(true);
    let init_result = (|| -> Result<(), String> {
        let desired_labels: Vec<String> = (0..monitors.len())
            .map(|index| {
                if index == 0 {
                    "region-overlay".to_string()
                } else {
                    format!("region-overlay-{}", index)
                }
            })
            .collect();

        for (index, (label, monitor)) in desired_labels
            .iter()
            .zip(monitors.iter())
            .enumerate()
        {
            let size = *monitor.size();
            let position = *monitor.position();
            let scale_factor = monitor.scale_factor();

            let logical_width = size.width as f64 / scale_factor;
            let logical_height = size.height as f64 / scale_factor;
            let logical_x = position.x as f64 / scale_factor;
            let logical_y = position.y as f64 / scale_factor;

            let logical_size = LogicalSize::new(logical_width, logical_height);
            let logical_position = LogicalPosition::new(logical_x, logical_y);

            let metadata = OverlayMetadata {
                origin_x: position.x,
                origin_y: position.y,
                width: size.width,
                height: size.height,
                scale_factor,
                logical_origin_x: logical_x,
                logical_origin_y: logical_y,
                logical_width,
                logical_height,
            };

            if let Some(existing) = app.get_webview_window(label) {
                existing
                    .set_size(Size::Logical(logical_size))
                    .map_err(|error| error.to_string())?;
                existing
                    .set_position(Position::Logical(logical_position))
                    .map_err(|error| error.to_string())?;
                existing
                    .set_background_color(Some(Color(0, 0, 0, 0)))
                    .map_err(|error| error.to_string())?;
                apply_window_level(&existing, false)?;
                elevate_overlay_window(&existing)?;
                existing.show().map_err(|error| error.to_string())?;
                let _ = app.emit_to(label, "overlay-metadata", &metadata);

                if index == 0 {
                    existing
                        .set_focus()
                        .map_err(|error| error.to_string())?;
                }
                continue;
            }

            let url = format!(
                "/index.html?window=overlay&origin_x={}&origin_y={}&width={}&height={}&scale={}&logical_origin_x={}&logical_origin_y={}&logical_width={}&logical_height={}",
                position.x,
                position.y,
                size.width,
                size.height,
                scale_factor,
                logical_x,
                logical_y,
                logical_width,
                logical_height
            );

            let window = WebviewWindowBuilder::new(&app, label.as_str(), WebviewUrl::App(url.into()))
                .title("Region Capture Overlay")
                .transparent(true)
                .decorations(false)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .position(logical_x, logical_y)
                .inner_size(logical_width, logical_height)
                .visible(true)
                .build()
                .map_err(|error| error.to_string())?;

            window
                .set_background_color(Some(Color(0, 0, 0, 0)))
                .map_err(|error| error.to_string())?;
            elevate_overlay_window(&window)?;
            apply_window_level(&window, false)?;

            let _ = app.emit_to(label, "overlay-metadata", &metadata);

            if index == 0 {
                window
                    .set_focus()
                    .map_err(|error| error.to_string())?;
            }
        }

        let existing_labels: Vec<String> = app
            .webview_windows()
            .keys()
            .filter(|label| label.starts_with("region-overlay"))
            .cloned()
            .collect();

        for label in existing_labels {
            if !desired_labels.iter().any(|wanted| wanted == &label) {
                if let Some(window) = app.get_webview_window(label.as_str()) {
                    let _ = window.close();
                }
            }
        }

        Ok(())
    })();

    if let Err(error) = init_result {
        if overlay_labels(&app).is_empty() {
            apply_overlay_presentation(false);
        }
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
async fn cancel_region_capture(app: tauri::AppHandle) -> Result<(), String> {
    close_overlay_windows(&app);
    Ok(())
}

#[tauri::command]
async fn capture_region(
    _app: tauri::AppHandle,
    region: CaptureRegion,
) -> Result<CaptureSuccessPayload, String> {
    if region.width == 0 || region.height == 0 {
        return Err("选区尺寸无效，请重试。".into());
    }

    let region_clone = region.clone();
    let capture_job = async_runtime::spawn_blocking(move || capture_region_internal(&region_clone))
        .await
        .map_err(|error| error.to_string())?;
    let capture_result = capture_job?;

    let logical_width = region.width;
    let logical_height = region.height;
    let physical_width =
        ((region.width as f64) * region.scale_x).round().max(1.0) as u32;
    let physical_height =
        ((region.height as f64) * region.scale_y).round().max(1.0) as u32;

    let payload = CaptureSuccessPayload {
        path: capture_result.path.to_string_lossy().into_owned(),
        base64: capture_result.base64,
        width: physical_width,
        height: physical_height,
        logical_width,
        logical_height,
        created_at: current_timestamp_millis(),
    };

    Ok(payload)
}

#[tauri::command]
async fn finalize_region_capture(
    app: tauri::AppHandle,
    request: FinalizeCaptureRequest,
) -> Result<CaptureSuccessPayload, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;

    let trimmed = request
        .base64
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&request.base64);

    let bytes = BASE64
        .decode(trimmed)
        .map_err(|error| format!("解析截图数据失败：{error}"))?;

    let target_path = PathBuf::from(&request.path);
    fs::write(&target_path, &bytes)
        .map_err(|error| format!("保存截图文件失败：{error}"))?;

    let payload = CaptureSuccessPayload {
        path: target_path.to_string_lossy().into_owned(),
        base64: trimmed.to_string(),
        width: request.width,
        height: request.height,
        logical_width: request.logical_width,
        logical_height: request.logical_height,
        created_at: current_timestamp_millis(),
    };

    app.emit("region-capture-complete", &payload)
        .map_err(|error| error.to_string())?;

    close_overlay_windows(&app);

    Ok(payload)
}

#[tauri::command]
async fn set_current_window_always_on_top(
    window: tauri::WebviewWindow,
    allow_input_panel: bool,
) -> Result<(), String> {
    apply_window_level(&window, allow_input_panel)
}

struct CaptureOutput {
    path: PathBuf,
    base64: String,
}

fn current_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(target_os = "macos")]
fn capture_region_internal(region: &CaptureRegion) -> Result<CaptureOutput, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;

    let target_path = temporary_file_path();
    let rect_arg = format!(
        "-R{},{},{},{}",
        region.x, region.y, region.width, region.height
    );

    let status = Command::new("screencapture")
        .arg("-x")
        .arg("-t")
        .arg("png")
        .arg(rect_arg)
        .arg(&target_path)
        .status()
        .map_err(|error| format!("无法调用系统截图工具：{error}"))?;

    if !status.success() {
        return Err(format!("系统截图工具执行失败，退出码：{}", status));
    }

    let bytes = fs::read(&target_path)
        .map_err(|error| format!("读取截图文件失败：{error}"))?;

    let base64 = BASE64.encode(&bytes);

    Ok(CaptureOutput {
        path: target_path,
        base64,
    })
}

#[cfg(not(target_os = "macos"))]
fn capture_region_internal(_: &CaptureRegion) -> Result<CaptureOutput, String> {
    Err("当前平台暂未实现框选截图。".into())
}

#[cfg(target_os = "macos")]
fn apply_window_level(window: &WebviewWindow, allow_input_panel: bool) -> Result<(), String> {
    use objc2_app_kit::{
        NSColor, NSWindow, NSWindowCollectionBehavior, NSWindowSharingType, NSStatusWindowLevel,
    };

    unsafe {
        let ns_ptr = window
            .ns_window()
            .map_err(|error| error.to_string())? as *mut NSWindow;
        if let Some(reference) = ns_ptr.as_ref() {
            let target_level = if allow_input_panel {
                20isize
            } else {
                (NSStatusWindowLevel + 1) as isize
            };
            reference.setLevel(target_level);
            reference.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary
                    | NSWindowCollectionBehavior::Stationary
                    | NSWindowCollectionBehavior::IgnoresCycle,
            );
            // Keep overlay visible to the user but exclude it from captured frames.
            reference.setSharingType(NSWindowSharingType::None);
            if !allow_input_panel {
                reference.setOpaque(false);
                reference.setHasShadow(false);
                let clear = NSColor::clearColor();
                reference.setBackgroundColor(Some(&clear));
            }
        }
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply_window_level(window: &WebviewWindow, allow_input_panel: bool) -> Result<(), String> {
    window
        .set_always_on_top(!allow_input_panel)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn elevate_overlay_window(window: &WebviewWindow) -> Result<(), String> {
    apply_window_level(window, false)
}

#[cfg(not(target_os = "macos"))]
fn elevate_overlay_window(window: &WebviewWindow) -> Result<(), String> {
    apply_window_level(window, false)
}

#[cfg(target_os = "macos")]
fn apply_overlay_presentation(enable: bool) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApp, NSApplicationPresentationOptions};

    fn state() -> &'static Mutex<Option<usize>> {
        static STORE: OnceLock<Mutex<Option<usize>>> = OnceLock::new();
        STORE.get_or_init(|| Mutex::new(None))
    }

    if let Some(mtm) = MainThreadMarker::new() {
        let app = NSApp(mtm);
        if let Ok(mut slot) = state().lock() {
            if enable {
                if slot.is_none() {
                    let current = app.presentationOptions().bits() as usize;
                    *slot = Some(current);
                }
                let mut options = NSApplicationPresentationOptions::HideMenuBar;
                options |= NSApplicationPresentationOptions::DisableMenuBarTransparency;
                app.setPresentationOptions(options);
            } else if let Some(saved) = slot.take() {
                let restored = NSApplicationPresentationOptions::from_bits_retain(saved as _);
                app.setPresentationOptions(restored);
            } else {
                app.setPresentationOptions(NSApplicationPresentationOptions::Default);
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn apply_overlay_presentation(_: bool) {}

fn temporary_file_path() -> PathBuf {
    let now = current_timestamp_millis();
    std::env::temp_dir().join(format!("chef-region-{now}.png"))
}

fn overlay_labels(app: &tauri::AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| label.starts_with("region-overlay"))
        .cloned()
        .collect()
}

fn close_overlay_windows(app: &tauri::AppHandle) {
    for label in overlay_labels(app) {
        if let Some(window) = app.get_webview_window(label.as_str()) {
            let _ = window.close();
        }
    }

    apply_overlay_presentation(false);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            show_region_capture_overlay,
            cancel_region_capture,
            capture_region,
            finalize_region_capture,
            set_current_window_always_on_top
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
