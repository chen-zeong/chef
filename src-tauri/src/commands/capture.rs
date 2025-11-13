use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::fs;

#[tauri::command]
pub fn save_capture_image(base64: String) -> Result<String, String> {
    use rfd::FileDialog;

    let file_path = FileDialog::new()
        .set_title("保存截图")
        .add_filter("PNG Image", &["png"])
        .save_file();

    let Some(path) = file_path else {
        return Err("用户取消保存".into());
    };

    let bytes = STANDARD
        .decode(base64)
        .map_err(|error| format!("解析图片失败: {error}"))?;
    fs::write(&path, bytes).map_err(|error| format!("写入文件失败: {error}"))?;
    Ok(path.display().to_string())
}
