#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use std::sync::{Mutex, OnceLock};
use tauri::{
    async_runtime, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
#[cfg(target_os = "macos")]
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
#[cfg(target_os = "macos")]
#[allow(deprecated)]
use objc2_core_graphics::{
    CGDataProvider, CGDirectDisplayID, CGDisplayBounds, CGImage, CGWindowID,
    CGWindowImageOption, CGWindowListCreateImage, CGWindowListOption,
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
    app: tauri::AppHandle,
    region: CaptureRegion,
) -> Result<CaptureSuccessPayload, String> {
    if region.width == 0 || region.height == 0 {
        return Err("选区尺寸无效，请重试。".into());
    }

    let region_clone = region.clone();
    let capture_result =
        match async_runtime::spawn_blocking(move || capture_region_internal(&region_clone)).await {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => {
                return Err(error);
            }
            Err(error) => {
                return Err(error.to_string());
            }
        };

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
    use xcap::Monitor;

    let point_x = i32::try_from(region.x)
        .map_err(|_| "选区位置超出支持范围，请重试。".to_string())?;
    let point_y = i32::try_from(region.y)
        .map_err(|_| "选区位置超出支持范围，请重试。".to_string())?;

    let monitor = Monitor::from_point(point_x, point_y)
        .map_err(|error| format!("未能确定显示器：{error}"))?;

    let monitor_x = monitor
        .x()
        .map_err(|error| format!("获取显示器信息失败：{error}"))?;
    let monitor_y = monitor
        .y()
        .map_err(|error| format!("获取显示器信息失败：{error}"))?;

    let offset_x = subtract_logical(region.x, monitor_x)?;
    let offset_y = subtract_logical(region.y, monitor_y)?;
    let display_id = monitor
        .id()
        .map_err(|error| format!("获取显示器信息失败：{error}"))?;

    let (rgba, width, height) = capture_rgba_via_core_graphics(
        display_id,
        monitor_x,
        monitor_y,
        offset_x,
        offset_y,
        region.width,
        region.height,
    )?;

    persist_capture_output(width, height, rgba)
}

#[cfg(target_os = "windows")]
fn capture_region_internal(region: &CaptureRegion) -> Result<CaptureOutput, String> {
    use xcap::Monitor;

    let point_x = i32::try_from(region.x)
        .map_err(|_| "选区位置超出支持范围，请重试。".to_string())?;
    let point_y = i32::try_from(region.y)
        .map_err(|_| "选区位置超出支持范围，请重试。".to_string())?;

    let monitor = Monitor::from_point(point_x, point_y)
        .map_err(|error| format!("未能确定显示器：{error}"))?;

    let monitor_x = monitor
        .x()
        .map_err(|error| format!("获取显示器信息失败：{error}"))?;
    let monitor_y = monitor
        .y()
        .map_err(|error| format!("获取显示器信息失败：{error}"))?;

    let offset_x = subtract_logical(region.x, monitor_x)?;
    let offset_y = subtract_logical(region.y, monitor_y)?;

    let image = monitor
        .capture_region(offset_x, offset_y, region.width, region.height)
        .map_err(|error| format!("截取屏幕区域失败：{error}"))?;

    let width = image.width();
    let height = image.height();
    persist_capture_output(width, height, image.into_raw())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn capture_region_internal(_: &CaptureRegion) -> Result<CaptureOutput, String> {
    Err("当前平台暂未实现框选截图。".into())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn subtract_logical(value: u32, monitor_origin: i32) -> Result<u32, String> {
    let offset = (value as i64) - (monitor_origin as i64);
    if offset < 0 {
        Err("选区超出显示器边界，请重试。".into())
    } else {
        u32::try_from(offset).map_err(|_| "选区位置超出支持范围，请重试。".into())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn encode_rgba_png(width: u32, height: u32, data: &[u8]) -> Result<Vec<u8>, String> {
    use png::{BitDepth, ColorType, Encoder};

    let mut buffer = Vec::new();
    {
        let mut encoder = Encoder::new(&mut buffer, width, height);
        encoder.set_color(ColorType::Rgba);
        encoder.set_depth(BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|error| format!("编码截图失败：{error}"))?;
        writer
            .write_image_data(data)
            .map_err(|error| format!("编码截图失败：{error}"))?;
    }
    Ok(buffer)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn persist_capture_output(
    width: u32,
    height: u32,
    rgba: Vec<u8>,
) -> Result<CaptureOutput, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;

    let png_bytes = encode_rgba_png(width, height, &rgba)?;
    let target_path = temporary_file_path();
    fs::write(&target_path, &png_bytes)
        .map_err(|error| format!("保存截图文件失败：{error}"))?;

    let base64 = BASE64.encode(&png_bytes);

    Ok(CaptureOutput {
        path: target_path,
        base64,
    })
}

#[cfg(target_os = "macos")]
fn capture_rgba_via_core_graphics(
    display_id: u32,
    monitor_origin_x: i32,
    monitor_origin_y: i32,
    offset_x: u32,
    offset_y: u32,
    width: u32,
    height: u32,
) -> Result<(Vec<u8>, u32, u32), String> {
    let display_id = display_id as CGDirectDisplayID;
    let bounds = CGDisplayBounds(display_id);

    let max_width = bounds.size.width.max(0.0);
    let max_height = bounds.size.height.max(0.0);
    let requested_right = (offset_x as f64) + (width as f64);
    let requested_bottom = (offset_y as f64) + (height as f64);
    if requested_right > max_width + 1.0 || requested_bottom > max_height + 1.0 {
        return Err("截取屏幕区域失败：选区超出显示器范围。".into());
    }

    let rect = CGRect {
        origin: CGPoint {
            x: monitor_origin_x as f64 + offset_x as f64,
            y: monitor_origin_y as f64 + offset_y as f64,
        },
        size: CGSize {
            width: width as f64,
            height: height as f64,
        },
    };

    #[allow(deprecated)]
    let cg_image = CGWindowListCreateImage(
        rect,
        CGWindowListOption::OptionOnScreenOnly,
        0 as CGWindowID,
        CGWindowImageOption::Default,
    )
    .ok_or_else(|| "截取屏幕区域失败：未能生成图像。".to_string())?;

    let width = CGImage::width(Some(&cg_image)) as u32;
    let height = CGImage::height(Some(&cg_image)) as u32;
    let bytes_per_row = CGImage::bytes_per_row(Some(&cg_image));
    let data_provider = CGImage::data_provider(Some(&cg_image))
        .ok_or_else(|| "截取屏幕区域失败：未能访问图像数据。".to_string())?;
    let data = CGDataProvider::data(Some(&data_provider))
        .ok_or_else(|| "截取屏幕区域失败：未能获取像素数据。".to_string())?
        .to_vec();

    if width == 0 || height == 0 {
        return Err("截取屏幕区域失败：区域尺寸无效。".into());
    }

    let mut buffer = Vec::with_capacity((width as usize) * (height as usize) * 4);
    let bytes_per_pixel_row = (width as usize) * 4;
    for row in data.chunks_exact(bytes_per_row) {
        buffer.extend_from_slice(&row[..bytes_per_pixel_row]);
    }

    for chunk in buffer.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }

    Ok((buffer, width, height))
}

#[cfg(target_os = "macos")]
fn apply_window_level(window: &WebviewWindow, allow_input_panel: bool) -> Result<(), String> {
    use objc2_app_kit::{
        NSWindow, NSWindowCollectionBehavior, NSStatusWindowLevel,
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
