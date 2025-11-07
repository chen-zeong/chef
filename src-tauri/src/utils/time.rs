use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn current_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

pub fn temporary_file_path() -> PathBuf {
    let now = current_timestamp_millis();
    std::env::temp_dir().join(format!("chef-region-{now}.png"))
}
