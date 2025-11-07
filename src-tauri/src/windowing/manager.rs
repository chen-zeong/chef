use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApp, NSApplicationPresentationOptions, NSColor, NSStatusWindowLevel, NSWindow,
    NSWindowCollectionBehavior, NSWindowSharingType,
};
#[cfg(target_os = "macos")]
use objc2_core_foundation::{CFDictionary, CFNumber, CFString, CGRect};
#[cfg(target_os = "macos")]
use objc2_core_graphics::{
    CGRectMakeWithDictionaryRepresentation, CGWindowListCopyWindowInfo, CGWindowListOption,
};
#[cfg(target_os = "macos")]
use std::ffi::c_void;

#[cfg(target_os = "macos")]
const ENABLE_COLLECTION_BEHAVIOR: bool = false;
#[cfg(target_os = "macos")]
const ENABLE_SHARING_TYPE: bool = false;

#[derive(Debug, Serialize)]
pub struct WindowSnapTarget {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub name: String,
}

pub fn apply_overlay_presentation(enable: bool) {
    #[cfg(target_os = "macos")]
    {
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
    {
        let _ = enable;
    }
}

#[cfg(target_os = "macos")]
pub fn apply_window_level(window: &WebviewWindow, allow_input_panel: bool) -> Result<(), String> {
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
pub fn apply_window_level(window: &WebviewWindow, allow_input_panel: bool) -> Result<(), String> {
    window
        .set_always_on_top(!allow_input_panel)
        .map_err(|error| error.to_string())
}

pub fn elevate_overlay_window(window: &WebviewWindow) -> Result<(), String> {
    apply_window_level(window, false)
}

pub fn overlay_labels(app: &AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| label.starts_with("region-overlay"))
        .cloned()
        .collect()
}

pub fn close_overlay_windows(app: &AppHandle) {
    for label in overlay_labels(app) {
        if let Some(window) = app.get_webview_window(label.as_str()) {
            let _ = window.close();
        }
    }

    apply_overlay_presentation(false);
    restore_hidden_window_if_needed(app);
}

pub fn maybe_hide_invoker_window(
    app: &AppHandle,
    window: &WebviewWindow,
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

pub fn restore_hidden_window_if_needed(app: &AppHandle) {
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

fn hidden_window_label_slot() -> &'static Mutex<Option<String>> {
    static FLAG: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    FLAG.get_or_init(|| Mutex::new(None))
}

#[cfg(target_os = "macos")]
pub fn collect_window_snap_targets() -> Result<Vec<WindowSnapTarget>, String> {
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
pub fn collect_window_snap_targets() -> Result<Vec<WindowSnapTarget>, String> {
    Ok(Vec::new())
}
