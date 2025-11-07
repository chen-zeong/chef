#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
use objc2_core_foundation::{CFDictionary, CFNumber, CFString, CGRect};
#[cfg(target_os = "macos")]
use objc2_core_graphics::{
    CGRectMakeWithDictionaryRepresentation, CGWindowListCopyWindowInfo, CGWindowListOption,
};
use paddle_ocr_rs::ocr_lite::OcrLite;
use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    async_runtime, path::BaseDirectory, window::Color, Emitter, LogicalPosition, LogicalSize,
    Manager, Position, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[cfg(target_os = "macos")]
const ENABLE_COLLECTION_BEHAVIOR: bool = false;
#[cfg(target_os = "macos")]
const ENABLE_SHARING_TYPE: bool = false;

const OCR_DET_MODEL: &str = "ch_PP-OCRv5_mobile_det.onnx";
const OCR_REC_MODEL: &str = "ch_PP-OCRv5_rec_mobile_infer.onnx";
const OCR_CLS_MODEL: &str = "ch_ppocr_mobile_v2.0_cls_infer.onnx";
const OCR_DEFAULT_THREADS: usize = 2;
const OCR_PADDING: u32 = 50;
const OCR_MAX_SIDE_LEN: u32 = 1024;
const OCR_BOX_SCORE_THRESH: f32 = 0.5;
const OCR_BOX_THRESH: f32 = 0.3;
const OCR_UNCLIP_RATIO: f32 = 1.6;

static OCR_ENGINE: OnceLock<Mutex<Option<OcrLite>>> = OnceLock::new();

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
    #[serde(skip_serializing_if = "Option::is_none")]
    ocr_text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FinalizeCaptureRequest {
    path: String,
    base64: String,
    width: u32,
    height: u32,
    logical_width: u32,
    logical_height: u32,
    #[serde(default)]
    run_ocr: bool,
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

#[derive(Debug, Serialize)]
struct WindowSnapTarget {
    id: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    name: String,
}

#[derive(Debug, Deserialize, Default)]
struct RegionCaptureLaunchOptions {
    #[serde(default)]
    #[serde(alias = "hideMainWindow")]
    hide_main_window: bool,
}

fn default_scale() -> f64 {
    1.0
}

#[tauri::command]
async fn show_region_capture_overlay(
    window: tauri::WebviewWindow,
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

#[tauri::command]
async fn set_current_window_always_on_top(
    window: tauri::WebviewWindow,
    allow_input_panel: bool,
) -> Result<(), String> {
    apply_window_level(&window, allow_input_panel)
}

#[tauri::command]
async fn list_window_snap_targets() -> Result<Vec<WindowSnapTarget>, String> {
    collect_window_snap_targets()
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

#[cfg(target_os = "macos")]
fn apply_window_level(window: &WebviewWindow, allow_input_panel: bool) -> Result<(), String> {
    use objc2_app_kit::{
        NSColor, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowSharingType,
    };

    unsafe {
        let ns_ptr = window.ns_window().map_err(|error| error.to_string())? as *mut NSWindow;
        if let Some(reference) = ns_ptr.as_ref() {
            let target_level = if allow_input_panel {
                20isize
            } else {
                (NSStatusWindowLevel + 1) as isize
            };
            reference.setLevel(target_level);
            if ENABLE_COLLECTION_BEHAVIOR {
                reference.setCollectionBehavior(
                    NSWindowCollectionBehavior::CanJoinAllSpaces
                        | NSWindowCollectionBehavior::FullScreenAuxiliary
                        | NSWindowCollectionBehavior::Stationary
                        | NSWindowCollectionBehavior::IgnoresCycle,
                );
            }
            if ENABLE_SHARING_TYPE {
                reference.setSharingType(NSWindowSharingType::None);
            }
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

#[cfg(target_os = "macos")]
fn collect_window_snap_targets() -> Result<Vec<WindowSnapTarget>, String> {
    const MIN_DIMENSION: f64 = 40.0;
    let options =
        CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements;

    unsafe {
        let cf_array = match CGWindowListCopyWindowInfo(options, 0) {
            Some(array) => array,
            None => return Ok(Vec::new()),
        };
        let count = cf_array.count();
        let current_pid = std::process::id() as i32;
        let mut targets = Vec::new();

        for index in 0..count {
            let dict_ptr = cf_array.value_at_index(index) as *const CFDictionary;
            if dict_ptr.is_null() {
                continue;
            }
            let dictionary = &*dict_ptr;

            if dictionary_number_i32(dictionary, "kCGWindowOwnerPID") == Some(current_pid) {
                continue;
            }
            if dictionary_number_i32(dictionary, "kCGWindowSharingState") == Some(0) {
                continue;
            }
            if dictionary_number_i32(dictionary, "kCGWindowLayer").unwrap_or(0) != 0 {
                continue;
            }
            if dictionary_number_f64(dictionary, "kCGWindowAlpha").unwrap_or(1.0) <= 0.01 {
                continue;
            }

            let rect = match dictionary_rect(dictionary) {
                Some(value) => value,
                None => continue,
            };

            if rect.size.width < MIN_DIMENSION || rect.size.height < MIN_DIMENSION {
                continue;
            }

            let id = match dictionary_number_i64(dictionary, "kCGWindowNumber") {
                Some(value) if value >= 0 => value as u32,
                _ => continue,
            };

            let name = dictionary_string(dictionary, "kCGWindowName")
                .filter(|value| !value.trim().is_empty())
                .or_else(|| dictionary_string(dictionary, "kCGWindowOwnerName"))
                .unwrap_or_else(|| "窗口".to_string());

            targets.push(WindowSnapTarget {
                id,
                x: rect.origin.x as f64,
                y: rect.origin.y as f64,
                width: rect.size.width as f64,
                height: rect.size.height as f64,
                name,
            });
        }

        Ok(targets)
    }
}

#[cfg(target_os = "macos")]
fn dictionary_value(dictionary: &CFDictionary, key: &str) -> Option<*const c_void> {
    unsafe {
        let cf_key = CFString::from_str(key);
        let key_ref = cf_key.as_ref() as *const CFString;
        let value = dictionary.value(key_ref.cast());
        if value.is_null() {
            None
        } else {
            Some(value)
        }
    }
}

#[cfg(target_os = "macos")]
fn dictionary_number_i32(dictionary: &CFDictionary, key: &str) -> Option<i32> {
    let ptr = dictionary_value(dictionary, key)? as *const CFNumber;
    unsafe { ptr.as_ref()?.as_i32() }
}

#[cfg(target_os = "macos")]
fn dictionary_number_i64(dictionary: &CFDictionary, key: &str) -> Option<i64> {
    let ptr = dictionary_value(dictionary, key)? as *const CFNumber;
    unsafe { ptr.as_ref()?.as_i64() }
}

#[cfg(target_os = "macos")]
fn dictionary_number_f64(dictionary: &CFDictionary, key: &str) -> Option<f64> {
    let ptr = dictionary_value(dictionary, key)? as *const CFNumber;
    unsafe { ptr.as_ref()?.as_f64() }
}

#[cfg(target_os = "macos")]
fn dictionary_string(dictionary: &CFDictionary, key: &str) -> Option<String> {
    let ptr = dictionary_value(dictionary, key)? as *const CFString;
    unsafe { ptr.as_ref().map(|value| value.to_string()) }
}

#[cfg(target_os = "macos")]
fn dictionary_rect(dictionary: &CFDictionary) -> Option<CGRect> {
    let bounds_ptr = dictionary_value(dictionary, "kCGWindowBounds")? as *const CFDictionary;
    if bounds_ptr.is_null() {
        return None;
    }
    let mut rect = CGRect::default();
    let success = unsafe { CGRectMakeWithDictionaryRepresentation(Some(&*bounds_ptr), &mut rect) };
    if success {
        Some(rect)
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn collect_window_snap_targets() -> Result<Vec<WindowSnapTarget>, String> {
    Ok(Vec::new())
}

fn run_ocr_from_path(models_dir: &Path, image_path: &Path) -> Result<String, String> {
    if !image_path.exists() {
        return Err("截图文件不存在，无法执行 OCR。".into());
    }

    let det_model = models_dir.join(OCR_DET_MODEL);
    let rec_model = models_dir.join(OCR_REC_MODEL);
    let cls_model = models_dir.join(OCR_CLS_MODEL);

    for path in [&det_model, &rec_model, &cls_model] {
        let display_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| path.to_string_lossy().into_owned());
        if !path.exists() {
            return Err(format!("缺少 OCR 模型文件：{display_name}"));
        }
    }

    let mut guard = OCR_ENGINE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "OCR 引擎正忙，请稍后再试。".to_string())?;

    if guard.is_none() {
        let det_path = det_model.to_string_lossy().into_owned();
        let cls_path = cls_model.to_string_lossy().into_owned();
        let rec_path = rec_model.to_string_lossy().into_owned();

        let mut engine = OcrLite::new();
        engine
            .init_models(&det_path, &cls_path, &rec_path, OCR_DEFAULT_THREADS)
            .map_err(|error| format!("初始化 OCR 模型失败：{error}"))?;
        *guard = Some(engine);
    }

    let image_path_string = image_path.to_string_lossy().into_owned();
    let engine = guard
        .as_mut()
        .ok_or_else(|| "OCR 引擎初始化失败，请重试。".to_string())?;

    let detection = engine
        .detect_from_path(
            &image_path_string,
            OCR_PADDING,
            OCR_MAX_SIDE_LEN,
            OCR_BOX_SCORE_THRESH,
            OCR_BOX_THRESH,
            OCR_UNCLIP_RATIO,
            true,
            true,
        )
        .map_err(|error| format!("OCR 识别失败：{error}"))?;

    let lines: Vec<String> = detection
        .text_blocks
        .into_iter()
        .map(|block| block.text.trim().to_string())
        .filter(|text| !text.is_empty())
        .collect();

    if lines.is_empty() {
        Ok(String::new())
    } else {
        Ok(lines.join("\n"))
    }
}

fn resolve_ocr_models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = app.path().resolve("ocr_models", BaseDirectory::Resource) {
        candidates.push(path);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("ocr_models"));
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("src-tauri/resources/ocr_models"));
        candidates.push(current_dir.join("resources/ocr_models"));
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            candidates.push(parent.join("../Resources/ocr_models"));
            candidates.push(parent.join("../lib/ocr_models"));
            candidates.push(parent.join("ocr_models"));
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("未找到 OCR 模型目录，请确保 resources/ocr_models 已打包到应用中。".into())
}

fn temporary_file_path() -> PathBuf {
    let now = current_timestamp_millis();
    std::env::temp_dir().join(format!("chef-region-{now}.png"))
}

fn hidden_window_label_slot() -> &'static Mutex<Option<String>> {
    static FLAG: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    FLAG.get_or_init(|| Mutex::new(None))
}

fn maybe_hide_invoker_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    should_hide: bool,
) -> Result<(), String> {
    if !should_hide {
        return Ok(());
    }

    let target = app
        .get_webview_window("main")
        .unwrap_or_else(|| window.clone());
    let label = target.label().to_string();

    target.hide().map_err(|error| error.to_string())?;
    if let Ok(mut slot) = hidden_window_label_slot().lock() {
        *slot = Some(label);
    }

    Ok(())
}

fn restore_hidden_window_if_needed(app: &tauri::AppHandle) {
    let label = match hidden_window_label_slot().lock() {
        Ok(mut slot) => slot.take(),
        Err(_) => None,
    };

    if let Some(label) = label {
        if let Some(window) = app.get_webview_window(label.as_str()) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
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
    restore_hidden_window_if_needed(app);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            show_region_capture_overlay,
            cancel_region_capture,
            capture_region,
            finalize_region_capture,
            set_current_window_always_on_top,
            list_window_snap_targets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
