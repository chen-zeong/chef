import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import md5 from "crypto-js/md5";

type CaseStyle = "lower" | "upper";
type BitLength = 16 | 32;

const bitOptions: { label: string; value: BitLength }[] = [
  { label: "32 位", value: 32 },
  { label: "16 位", value: 16 }
];

const caseOptions: { label: string; value: CaseStyle }[] = [
  { label: "小写", value: "lower" },
  { label: "大写", value: "upper" }
];

const emptyMessage = "输入内容即可生成 MD5 摘要。";

export function Md5Tool() {
  const [input, setInput] = useState<string>("Chef Toolbox");
  const [bitLength, setBitLength] = useState<BitLength>(32);
  const [caseStyle, setCaseStyle] = useState<CaseStyle>("lower");
  const [isCopied, setIsCopied] = useState(false);

  const digest = useMemo(() => {
    if (!input) {
      return emptyMessage;
    }
    const hash = md5(input).toString();
    const sliced = bitLength === 32 ? hash : hash.substring(8, 24);
    return caseStyle === "upper" ? sliced.toUpperCase() : sliced.toLowerCase();
  }, [input, bitLength, caseStyle]);

  const handleCopy = async () => {
    if (!input) {
      return;
    }
    try {
      await navigator.clipboard.writeText(digest);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1600);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="panel">
      <header className="panel__header">
        <div>
          <h3>MD5 摘要生成器</h3>
          <p>支持 16 / 32 位输出及大小写快速切换。</p>
        </div>
        <motion.button
          type="button"
          className="btn btn--ghost"
          whileTap={{ scale: 0.94 }}
          onClick={() => setInput("")}
        >
          清空
        </motion.button>
      </header>

      <div className="panel__grid panel__grid--split">
        <div className="panel__block">
          <label className="panel__label">输入文本</label>
          <textarea
            className="panel__textarea"
            spellCheck={false}
            value={input}
            placeholder="请输入要加密的内容"
            onChange={(event) => setInput(event.target.value)}
          />
        </div>

        <div className="panel__block">
          <label className="panel__label">MD5 结果</label>
          <div className="panel__result">
            {input ? <span>{digest}</span> : <span className="panel__muted">{emptyMessage}</span>}
          </div>
          <motion.button
            type="button"
            className={clsx("btn", { "btn--disabled": !input })}
            whileTap={{ scale: input ? 0.95 : 1 }}
            onClick={handleCopy}
            disabled={!input}
          >
            {isCopied ? "已复制" : "复制结果"}
          </motion.button>
        </div>
      </div>

      <div className="panel__options">
        <OptionGroup
          label="位数"
          options={bitOptions}
          current={bitLength}
          onSelect={setBitLength}
        />
        <OptionGroup
          label="大小写"
          options={caseOptions}
          current={caseStyle}
          onSelect={setCaseStyle}
        />
      </div>

      <footer className="panel__footer">
        <span>基于 crypto-js/md5 实现 · 仅用于非安全场景</span>
      </footer>
    </div>
  );
}

type OptionGroupProps<T extends string | number> = {
  label: string;
  options: { label: string; value: T }[];
  current: T;
  onSelect: (value: T) => void;
};

function OptionGroup<T extends string | number>({
  label,
  options,
  current,
  onSelect
}: OptionGroupProps<T>) {
  return (
    <div className="panel__option-group">
      <span className="panel__label">{label}</span>
      <div className="panel__chips">
        {options.map((option) => {
          const active = option.value === current;
          return (
            <motion.button
              key={option.value}
              type="button"
              className={clsx("chip", { "chip--active": active })}
              onClick={() => onSelect(option.value)}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              {option.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
