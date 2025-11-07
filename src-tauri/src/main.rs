#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ocr;
mod utils;
mod windowing;

use commands::{
    cancel_region_capture, capture_region, finalize_region_capture, list_window_snap_targets,
    set_current_window_always_on_top, show_region_capture_overlay,
};

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
