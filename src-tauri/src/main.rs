#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ocr;
mod utils;
mod windowing;

use commands::{
    cancel_region_capture, capture_region, diagnose_network_connectivity, finalize_region_capture,
    get_file_share_status, get_network_overview, list_window_snap_targets, pick_screen_color,
    pick_search_directories, pick_share_directories, pick_share_files, read_environment_sources,
    read_hosts_file, run_network_fix_action, save_capture_image, search_files,
    set_current_window_always_on_top, show_region_capture_overlay, start_file_share, stop_file_share,
    FileShareManager,
};

fn main() {
    tauri::Builder::default()
        .manage(FileShareManager::default())
        .invoke_handler(tauri::generate_handler![
            show_region_capture_overlay,
            cancel_region_capture,
            capture_region,
            finalize_region_capture,
            set_current_window_always_on_top,
            list_window_snap_targets,
            start_file_share,
            stop_file_share,
            get_file_share_status,
            pick_share_files,
            pick_share_directories,
            pick_search_directories,
            search_files,
            pick_screen_color,
            get_network_overview,
            diagnose_network_connectivity,
            run_network_fix_action,
            read_environment_sources,
            read_hosts_file,
            save_capture_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
