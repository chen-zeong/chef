use serde::Serialize;
use tauri::AppHandle;

#[cfg(target_os = "macos")]
use objc2_app_kit::NSColor;

#[derive(Debug, Clone, Serialize)]
pub struct SampledColor {
    pub hex: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

#[tauri::command]
pub async fn pick_screen_color(app: AppHandle) -> Result<Option<SampledColor>, String> {
    #[cfg(target_os = "macos")]
    {
        return pick_screen_color_macos(app).await;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("当前系统暂未支持系统取色。".into())
    }
}

#[cfg(target_os = "macos")]
async fn pick_screen_color_macos(app: AppHandle) -> Result<Option<SampledColor>, String> {
    use block2::StackBlock;
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSColorSampler;
    use std::sync::{Arc, Mutex};
    use tokio::sync::oneshot;

    let (tx, rx) = oneshot::channel::<Result<Option<SampledColor>, String>>();
    let sender = Arc::new(Mutex::new(Some(tx)));

    let startup_sender = Arc::clone(&sender);
    let start_result = app.run_on_main_thread(move || {
        if MainThreadMarker::new().is_none() {
            if let Ok(mut guard) = startup_sender.lock() {
                if let Some(tx) = guard.take() {
                    let _ = tx.send(Err("无法在主线程初始化取色器。".into()));
                }
            }
            return;
        }

        let sampler = NSColorSampler::new();
        let handler_sender = Arc::clone(&startup_sender);
        let handler = StackBlock::new(move |color_ptr: *mut NSColor| {
            if let Ok(mut guard) = handler_sender.lock() {
                if let Some(tx) = guard.take() {
                    let payload = unsafe { color_ptr.as_ref() }.map(nscolor_to_payload);
                    let _ = tx.send(Ok(payload));
                }
            }
        });

        unsafe {
            sampler.showSamplerWithSelectionHandler(&handler);
        }
    });

    if let Err(error) = start_result {
        if let Ok(mut guard) = sender.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(Err(format!("无法启动系统取色：{error}")));
            }
        }
    }

    match rx.await {
        Ok(result) => result,
        Err(_) => Err("系统取色被中断，请重试。".into()),
    }
}

#[cfg(target_os = "macos")]
fn nscolor_to_payload(color: &NSColor) -> SampledColor {
    use objc2_core_foundation::CGFloat;

    let mut red: CGFloat = 0.0;
    let mut green: CGFloat = 0.0;
    let mut blue: CGFloat = 0.0;
    let mut alpha: CGFloat = 0.0;

    unsafe {
        color.getRed_green_blue_alpha(&mut red, &mut green, &mut blue, &mut alpha);
    }

    let clamp = |value: CGFloat| -> u8 {
        let float = value as f64;
        (float.clamp(0.0, 1.0) * 255.0).round() as u8
    };

    let r = clamp(red);
    let g = clamp(green);
    let b = clamp(blue);
    let a = (alpha as f64).clamp(0.0, 1.0) as f32;

    SampledColor {
        hex: format!("#{:02X}{:02X}{:02X}", r, g, b),
        r,
        g,
        b,
        a,
    }
}
