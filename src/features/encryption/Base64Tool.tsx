import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

type Base64Mode = "encode" | "decode";

function encodeBase64(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

export function Base64Tool() {
  const [mode, setMode] = useState<Base64Mode>("encode");
  const [input, setInput] = useState("Chef Toolbox");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const result = mode === "encode" ? encodeBase64(input) : decodeBase64(input);
      setOutput(result);
      setError(null);
    } catch (convertError) {
      setOutput("");
      setError(
        convertError instanceof Error ? convertError.message : "无法处理当前输入，请检查格式。"
      );
    }
  }, [input, mode]);

  const handleCopy = async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "复制失败，请稍后重试。");
    }
  };

  return (
    <div className="panel">
      <header className="panel__header">
        <div>
          <h3>Base64 编解码</h3>
          <p>快速处理文本的 Base64 编码与解码。</p>
        </div>
        <motion.div className="panel__buttons" layout>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--primary": mode === "encode" })}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("encode")}
          >
            编码
          </motion.button>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--primary": mode === "decode" })}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("decode")}
          >
            解码
          </motion.button>
        </motion.div>
      </header>

      <div className="panel__grid panel__grid--split">
        <div className="panel__block">
          <label className="panel__label">{mode === "encode" ? "原始内容" : "Base64 字符串"}</label>
          <textarea
            className="panel__textarea"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={mode === "encode" ? "请输入要编码的内容" : "请输入 Base64 字符串"}
          />
        </div>
        <div className="panel__block">
          <label className="panel__label">{mode === "encode" ? "编码结果" : "解码结果"}</label>
          <div className={clsx("panel__result", { "panel__muted": !output })}>
            {output || "结果会显示在这里"}
          </div>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--disabled": !output })}
            whileTap={{ scale: output ? 0.95 : 1 }}
            onClick={handleCopy}
            disabled={!output}
          >
            {copied ? "已复制" : "复制结果"}
          </motion.button>
        </div>
      </div>

      {error && <div className="panel__error">{error}</div>}
      <footer className="panel__footer">
        <span>使用浏览器原生 Base64 能力 · 支持 UTF-8 文本</span>
      </footer>
    </div>
  );
}

