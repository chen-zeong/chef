import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

type CodecMode = "encode" | "decode";

const shellOptions = [
  { label: "编码", value: "encode" },
  { label: "解码", value: "decode" }
] as const;

export function UrlCodecTool() {
  const [mode, setMode] = useState<CodecMode>("encode");
  const [usePlus, setUsePlus] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const output = useMemo(() => {
    if (!input) {
      setError(null);
      return "";
    }
    try {
      const trimmed = input.trim();
      const result =
        mode === "encode"
          ? encodeURIComponent(trimmed)
          : decodeURIComponent(trimmed.replace(/\+/g, " "));
      setError(null);
      return mode === "encode" && usePlus ? result.replace(/%20/g, "+") : result;
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "转换失败，请检查输入格式。"
      );
      return "";
    }
  }, [input, mode, usePlus]);

  const handleSwap = () => {
    setMode((prev) => (prev === "encode" ? "decode" : "encode"));
    if (output) {
      setInput(output);
    }
  };

  return (
    <div className="urltool">
      <div className="urltool__surface">
        <header className="urltool__header">
          <div>
            <span className="urltool__eyebrow">URL</span>
            <h3>{mode === "encode" ? "URL 编码" : "URL 解码"}</h3>
          </div>
          <div className="urltool__actions">
            {shellOptions.map((option) => (
              <motion.button
                key={option.value}
                type="button"
                className={clsx("urltool__toggle", {
                  "urltool__toggle--active": mode === option.value
                })}
                onClick={() => setMode(option.value)}
                whileTap={{ scale: 0.95 }}
              >
                {option.label}
              </motion.button>
            ))}
            <motion.button
              type="button"
              className="urltool__swap"
              whileTap={{ scale: 0.94 }}
              onClick={handleSwap}
            >
              对调输入与输出
            </motion.button>
          </div>
        </header>

        <div className="urltool__editor">
          <textarea
            className="urltool__textarea"
            spellCheck={false}
            placeholder={mode === "encode" ? "请输入原始文本" : "请输入已编码的 URL"}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <textarea
            className="urltool__textarea urltool__textarea--muted"
            spellCheck={false}
            value={output}
            readOnly
            placeholder="结果将显示在这里"
          />
        </div>

        <div className="urltool__meta">
          <label className="urltool__option">
            <input
              type="checkbox"
              checked={usePlus}
              onChange={(event) => setUsePlus(event.target.checked)}
              disabled={mode === "decode"}
            />
            空格替换为 +
          </label>
          <span className={clsx("urltool__status", { "urltool__status--error": !!error })}>
            {error
              ? `错误：${error}`
              : `字符 ${input.length} · 输出 ${output.length}`}
          </span>
        </div>
      </div>
    </div>
  );
}
