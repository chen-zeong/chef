#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    async_runtime, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
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
                .set_always_on_top(true)
                .map_err(|error| error.to_string())?;
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
}

#[tauri::command]
async fn cancel_region_capture(app: tauri::AppHandle) -> Result<(), String> {
    close_overlay_windows(&app);
    Ok(())
}

#[tauri::command]
async fn capture_region(
    app: tauri::AppHandle,
    region: CaptureRegion,
) -> Result<CaptureSuccessPayload, String> {
    if region.width == 0 || region.height == 0 {
        return Err("选区尺寸无效，请重试。".into());
    }

    let hidden_labels = hide_overlay_windows(&app).map_err(|error| error.to_string())?;

    let region_clone = region.clone();
    let capture_result =
        match async_runtime::spawn_blocking(move || capture_region_internal(&region_clone)).await {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => {
                let _ = show_overlay_windows(&app, &hidden_labels);
                return Err(error);
            }
            Err(error) => {
                let _ = show_overlay_windows(&app, &hidden_labels);
                return Err(error.to_string());
            }
        };

    let logical_width = region.width;
    let logical_height = region.height;
    let physical_width =
        ((region.width as f64) * region.scale_x).round().max(1.0) as u32;
    let physical_height =
        ((region.height as f64) * region.scale_y).round().max(1.0) as u32;

    let _ = show_overlay_windows(&app, &hidden_labels);

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
}

fn hide_overlay_windows(app: &tauri::AppHandle) -> Result<Vec<String>, tauri::Error> {
    let labels = overlay_labels(app);
    for label in &labels {
        if let Some(window) = app.get_webview_window(label.as_str()) {
            window.hide()?;
        }
    }
    Ok(labels)
}

fn show_overlay_windows(
    app: &tauri::AppHandle,
    labels: &[String],
) -> Result<(), tauri::Error> {
    for (index, label) in labels.iter().enumerate() {
        if let Some(window) = app.get_webview_window(label.as_str()) {
            window.show()?;
            window.set_always_on_top(true)?;
            if index == 0 {
                let _ = window.set_focus();
            }
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            show_region_capture_overlay,
            cancel_region_capture,
            capture_region,
            finalize_region_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
