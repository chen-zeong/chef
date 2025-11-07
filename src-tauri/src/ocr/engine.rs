use ort::{
    session::builder::{GraphOptimizationLevel, SessionBuilder},
    Error as OrtError,
};
use paddle_ocr_rs::ocr_lite::OcrLite;
use std::{
    env,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

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

pub fn run_ocr_from_path(models_dir: &Path, image_path: &Path) -> Result<String, String> {
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
        if engine
            .init_models_custom(&det_path, &cls_path, &rec_path, configure_release_session)
            .is_err()
        {
            engine = OcrLite::new();
            engine
                .init_models(&det_path, &cls_path, &rec_path, OCR_DEFAULT_THREADS)
                .map_err(|error| format!("初始化 OCR 模型失败：{error}"))?;
        }
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

pub fn resolve_ocr_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = app.path().resolve("ocr_models", BaseDirectory::Resource) {
        candidates.push(path);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("ocr_models"));
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("src-tauri/ocr_models"));
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

fn configure_release_session(builder: SessionBuilder) -> Result<SessionBuilder, OrtError> {
    let builder = builder.with_optimization_level(GraphOptimizationLevel::Level3)?;
    let builder = builder.with_intra_threads(OCR_DEFAULT_THREADS)?;
    builder.with_inter_threads(OCR_DEFAULT_THREADS)
}
