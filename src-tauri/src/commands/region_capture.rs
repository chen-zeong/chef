use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{
    async_runtime, window::Color, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager,
    Position, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::ocr::{resolve_ocr_models_dir, run_ocr_from_path};
use crate::utils::{current_timestamp_millis, temporary_file_path};
use crate::windowing::{
    apply_overlay_presentation, apply_window_level, close_overlay_windows, elevate_overlay_window,
    maybe_hide_invoker_window, overlay_labels, restore_hidden_window_if_needed,
};

#[derive(Debug, Clone, Deserialize)]
pub struct CaptureRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    #[serde(default = "default_scale", alias = "scaleX")]
    pub scale_x: f64,
    #[serde(default = "default_scale", alias = "scaleY")]
    pub scale_y: f64,
}

#[derive(Debug, Serialize)]
pub struct CaptureSuccessPayload {
    pub path: String,
    pub base64: String,
    pub width: u32,
    pub height: u32,
    pub created_at: u128,
    pub logical_width: u32,
    pub logical_height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ocr_text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FinalizeCaptureRequest {
    pub path: String,
    pub base64: String,
    pub width: u32,
    pub height: u32,
    pub logical_width: u32,
    pub logical_height: u32,
    #[serde(default)]
    pub run_ocr: bool,
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
    primary_height: f64,
}

#[derive(Debug, Deserialize, Default)]
pub struct RegionCaptureLaunchOptions {
    #[serde(default)]
    #[serde(alias = "hideMainWindow")]
    hide_main_window: bool,
}

#[tauri::command]
pub async fn show_region_capture_overlay(
    window: WebviewWindow,
    options: Option<RegionCaptureLaunchOptions>,
) -> Result<(), String> {
    let app = window.app_handle();
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;

    if monitors.is_empty() {
        return Err("未能获取显示器信息".into());
    }

    let primary_monitor_height = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| monitor.size().height as f64 / monitor.scale_factor())
        .or_else(|| {
            monitors
                .get(0)
                .map(|monitor| monitor.size().height as f64 / monitor.scale_factor())
        })
        .unwrap_or(0.0);

    let launch_options = options.unwrap_or_default();
    let should_hide_main = launch_options.hide_main_window;
    maybe_hide_invoker_window(&app, &window, should_hide_main)?;
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

        for (index, (label, monitor)) in desired_labels.iter().zip(monitors.iter()).enumerate() {
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
                primary_height: primary_monitor_height,
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
                    existing.set_focus().map_err(|error| error.to_string())?;
                }
                continue;
            }

            let url = format!(
                "/index.html?window=overlay&origin_x={}&origin_y={}&width={}&height={}&scale={}&logical_origin_x={}&logical_origin_y={}&logical_width={}&logical_height={}&primary_height={}",
                position.x,
                position.y,
                size.width,
                size.height,
                scale_factor,
                logical_x,
                logical_y,
                logical_width,
                logical_height,
                primary_monitor_height
            );

            let window = WebviewWindowBuilder::<_, tauri::AppHandle>::new(
                &app,
                label.as_str(),
                WebviewUrl::App(url.into()),
            )
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
                window.set_focus().map_err(|error| error.to_string())?;
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
        restore_hidden_window_if_needed(&app);
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_region_capture(app: AppHandle) -> Result<(), String> {
    close_overlay_windows(&app);
    Ok(())
}

#[tauri::command]
pub async fn capture_region(
    _app: AppHandle,
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
    let physical_width = ((region.width as f64) * region.scale_x).round().max(1.0) as u32;
    let physical_height = ((region.height as f64) * region.scale_y).round().max(1.0) as u32;

    let payload = CaptureSuccessPayload {
        path: capture_result.path.to_string_lossy().into_owned(),
        base64: capture_result.base64,
        width: physical_width,
        height: physical_height,
        logical_width,
        logical_height,
        created_at: current_timestamp_millis(),
        ocr_text: None,
    };

    Ok(payload)
}

#[tauri::command]
pub async fn finalize_region_capture(
    app: AppHandle,
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
    fs::write(&target_path, &bytes).map_err(|error| format!("保存截图文件失败：{error}"))?;

    let mut payload = CaptureSuccessPayload {
        path: target_path.to_string_lossy().into_owned(),
        base64: trimmed.to_string(),
        width: request.width,
        height: request.height,
        logical_width: request.logical_width,
        logical_height: request.logical_height,
        created_at: current_timestamp_millis(),
        ocr_text: None,
    };

    if request.run_ocr {
        let models_dir = resolve_ocr_models_dir(&app)?;
        let ocr_target = target_path.clone();
        let ocr_text =
            async_runtime::spawn_blocking(move || run_ocr_from_path(&models_dir, &ocr_target))
                .await
                .map_err(|error| error.to_string())??;
        payload.ocr_text = Some(ocr_text);
    }

    app.emit("region-capture-complete", &payload)
        .map_err(|error| error.to_string())?;

    if !request.run_ocr {
        close_overlay_windows(&app);
    }

    Ok(payload)
}

#[derive(Debug)]
struct CaptureOutput {
    path: PathBuf,
    base64: String,
}

fn default_scale() -> f64 {
    1.0
}

#[cfg(target_os = "macos")]
fn capture_region_internal(region: &CaptureRegion) -> Result<CaptureOutput, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    use std::process::Command;

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

    let bytes = fs::read(&target_path).map_err(|error| format!("读取截图文件失败：{error}"))?;
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
