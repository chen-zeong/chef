import { useRef, useState } from "react";
import { motion } from "framer-motion";

type ConvertedIcon = {
  size: number;
  dataUrl: string;
};

const AVAILABLE_SIZES = [16, 32, 64, 128, 256] as const;

export function IconConverterTool() {
  const [source, setSource] = useState<string>("");
  const [name, setName] = useState<string>("app-icon");
  const [activeSizes, setActiveSizes] = useState<number[]>([32, 64, 128, 256]);
  const [converted, setConverted] = useState<ConvertedIcon[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isReady = Boolean(source && imgRef.current);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件（PNG、JPEG、SVG 等）。");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        setSource(result);
        setConverted([]);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSizes = (size: number) => {
    setActiveSizes((prev) =>
      prev.includes(size) ? prev.filter((item) => item !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const convert = async () => {
    if (!imgRef.current) {
      setError("请先上传图片。");
      return;
    }
    setError(null);
    const image = imgRef.current;
    const results: ConvertedIcon[] = [];
    for (const size of activeSizes) {
      const canvas = document.createElement("canvas");
      const scale = Math.min(image.width, image.height);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        continue;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(
        image,
        (image.width - scale) / 2,
        (image.height - scale) / 2,
        scale,
        scale,
        0,
        0,
        size,
        size
      );
      const dataUrl = canvas.toDataURL("image/png");
      results.push({ size, dataUrl });
    }
    setConverted(results);
  };

  const handleDownload = (icon: ConvertedIcon) => {
    const link = document.createElement("a");
    link.href = icon.dataUrl;
    link.download = `${name || "icon"}-${icon.size}.png`;
    link.click();
  };

  return (
    <div className="icontool">
      <div className="icontool__surface">
        <header className="icontool__header">
          <div>
            <span className="icontool__eyebrow">Icon</span>
            <h3>图片转图标</h3>
          </div>
          <label className="icontool__upload">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  handleFile(file);
                  event.target.value = "";
                }
              }}
            />
            选择图片
          </label>
        </header>

        <div className="icontool__preview">
          {source ? (
            <div className="icontool__preview-stage">
              <img
                ref={(node) => {
                  imgRef.current = node;
                  if (node && node.complete) {
                    setInfo({ width: node.naturalWidth, height: node.naturalHeight });
                  }
                }}
                src={source}
                alt="待转换图片"
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setInfo({ width: target.naturalWidth, height: target.naturalHeight });
                  setConverted([]);
                }}
              />
              {info && (
                <span className="icontool__info">
                  原始尺寸：{info.width} × {info.height}
                </span>
              )}
            </div>
          ) : (
            <div className="icontool__dropzone">
              <p>拖拽图片至此，或点击右上角按钮上传。</p>
              <p>支持 PNG / JPG / SVG / WebP 等常见格式。</p>
            </div>
          )}
        </div>

        <div className="icontool__controls">
          <label className="icontool__name">
            文件名前缀
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="app-icon" />
          </label>
          <div className="icontool__sizes">
            {AVAILABLE_SIZES.map((size) => (
              <label key={size} className={activeSizes.includes(size) ? "active" : ""}>
                <input
                  type="checkbox"
                  checked={activeSizes.includes(size)}
                  onChange={() => handleSizes(size)}
                />
                {size}px
              </label>
            ))}
          </div>
          <motion.button
            type="button"
            className="icontool__convert"
            whileTap={{ scale: 0.95 }}
            onClick={convert}
            disabled={!isReady || !activeSizes.length}
          >
            生成图标
          </motion.button>
        </div>

        {error && <div className="icontool__error">提示：{error}</div>}

        {!!converted.length && (
          <div className="icontool__result">
            {converted.map((icon) => (
              <div key={icon.size} className="icontool__result-item">
                <img src={icon.dataUrl} alt={`${icon.size}px 图标`} />
                <span>{icon.size} × {icon.size}</span>
                <button type="button" onClick={() => handleDownload(icon)}>
                  下载
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
