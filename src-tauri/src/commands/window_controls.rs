use tauri::WebviewWindow;

use crate::windowing::{apply_window_level, collect_window_snap_targets, WindowSnapTarget};

#[tauri::command]
pub async fn set_current_window_always_on_top(
    window: WebviewWindow,
    allow_input_panel: bool,
) -> Result<(), String> {
    apply_window_level(&window, allow_input_panel)
}

#[tauri::command]
pub async fn list_window_snap_targets() -> Result<Vec<WindowSnapTarget>, String> {
    collect_window_snap_targets()
}
