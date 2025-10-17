import { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import AES from "crypto-js/aes";
import Utf8 from "crypto-js/enc-utf8";

type AesMode = "encrypt" | "decrypt";

export function AesTool() {
  const [mode, setMode] = useState<AesMode>("encrypt");
  const [message, setMessage] = useState("Chef Toolbox");
  const [key, setKey] = useState("chef-lab");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRun = () => {
    try {
      if (!key.trim()) {
        throw new Error("请输入密钥。");
      }

      if (!message.trim()) {
        throw new Error(mode === "encrypt" ? "请输入需要加密的内容。" : "请输入密文。");
      }

      if (mode === "encrypt") {
        const cipher = AES.encrypt(message, key).toString();
        setResult(cipher);
      } else {
        const bytes = AES.decrypt(message, key);
        const plainText = bytes.toString(Utf8);
        if (!plainText) {
          throw new Error("解密结果为空，密文或密钥可能不匹配。");
        }
        setResult(plainText);
      }
      setError(null);
    } catch (aesError) {
      setResult("");
      setError(aesError instanceof Error ? aesError.message : "处理失败，请检查输入。");
    }
  };

  const handleCopy = async () => {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result);
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
          <h3>AES 对称加密</h3>
          <p>基于密码短语的 AES 加解密，可快速验证文案。</p>
        </div>
        <div className="panel__switch">
          <motion.button
            type="button"
            className={clsx("btn", { "btn--primary": mode === "encrypt" })}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("encrypt")}
          >
            加密
          </motion.button>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--primary": mode === "decrypt" })}
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode("decrypt")}
          >
            解密
          </motion.button>
        </div>
      </header>

      <div className="panel__block">
        <label className="panel__label">{mode === "encrypt" ? "输入明文" : "输入密文"}</label>
        <textarea
          className="panel__textarea"
          spellCheck={false}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={mode === "encrypt" ? "请输入需要加密的内容" : "请输入 AES 密文"}
        />
      </div>

      <div className="panel__block">
        <label className="panel__label">密钥 (Passphrase)</label>
        <input
          className="panel__input"
          type="text"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="请输入密钥"
        />
      </div>

      <div className="panel__block">
        <label className="panel__label">{mode === "encrypt" ? "加密结果" : "解密结果"}</label>
        <div className={clsx("panel__result", { "panel__muted": !result })}>
          {result || "执行后结果会显示在这里"}
        </div>
        <div className="panel__actions-inline">
          <motion.button type="button" className="btn btn--primary" whileTap={{ scale: 0.95 }} onClick={handleRun}>
            立即执行
          </motion.button>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--disabled": !result })}
            whileTap={{ scale: result ? 0.95 : 1 }}
            onClick={handleCopy}
            disabled={!result}
          >
            {copied ? "已复制" : "复制结果"}
          </motion.button>
        </div>
      </div>

      {error && <div className="panel__error">{error}</div>}
      <footer className="panel__footer">
        <span>基于 CryptoJS.AES，实现快速口令加密 · 适用于测试验证场景</span>
      </footer>
    </div>
  );
}

