import { useMemo, useState } from "react";
import { motion } from "framer-motion";

export function SvgPreviewTool() {
  const [code, setCode] = useState<string>(defaultSvg);
  const [background, setBackground] = useState<"grid" | "light" | "dark">("grid");

  const sanitizedCode = useMemo(() => code.trim(), [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sanitizedCode);
  };

  return (
    <div className="svgtool">
      <div className="svgtool__surface">
        <header className="svgtool__header">
          <div>
            <span className="svgtool__eyebrow">SVG</span>
            <h3>SVG 代码预览</h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="svgtool__copy"
            type="button"
            onClick={handleCopy}
            disabled={!sanitizedCode}
          >
            复制代码
          </motion.button>
        </header>

        <div className="svgtool__content">
          <textarea
            className="svgtool__textarea"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="<svg>...</svg>"
          />
          <div className="svgtool__preview">
            <div className="svgtool__preview-header">
              <span>预览</span>
              <div className="svgtool__preview-modes">
                <button
                  type="button"
                  className={background === "grid" ? "active" : ""}
                  onClick={() => setBackground("grid")}
                >
                  网格
                </button>
                <button
                  type="button"
                  className={background === "light" ? "active" : ""}
                  onClick={() => setBackground("light")}
                >
                  浅色
                </button>
                <button
                  type="button"
                  className={background === "dark" ? "active" : ""}
                  onClick={() => setBackground("dark")}
                >
                  深色
                </button>
              </div>
            </div>
            <div className={`svgtool__stage svgtool__stage--${background}`}>
              {sanitizedCode ? (
                <div
                  className="svgtool__stage-inner"
                  dangerouslySetInnerHTML={{
                    __html: sanitizedCode
                  }}
                />
              ) : (
                <div className="svgtool__placeholder">粘贴 SVG 代码后立即预览。</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const defaultSvg = `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" rx="24" fill="#EEF2FF"/>
  <path d="M48 20L72 34V62L48 76L24 62V34L48 20Z" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M48 56C53.5228 56 58 51.5228 58 46C58 40.4772 53.5228 36 48 36C42.4772 36 38 40.4772 38 46C38 51.5228 42.4772 56 48 56Z" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;
