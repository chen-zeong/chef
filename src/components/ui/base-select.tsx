import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";

export type BaseSelectOption<T extends string | number = string> = {
  value: T;
  label: string;
  description?: string;
};

type BaseSelectProps<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  options: BaseSelectOption<T>[];
  placeholder?: string;
  className?: string;
};

export function BaseSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = "请选择",
  className
}: BaseSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    setPortalTarget(typeof document !== "undefined" ? document.body : null);
  }, []);

  const updateMenuPosition = () => {
    if (!buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
      zIndex: 9999
    });
  };

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    updateMenuPosition();
    const handleWindowChange = () => updateMenuPosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    const index = options.findIndex((option) => option.value === value);
    if (index >= 0) {
      const item = listRef.current.children[index] as HTMLLIElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [open, options, value]);

  const toggle = () => setOpen((previous) => !previous);

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        className={clsx(
          "flex w-full items-center justify-between rounded-xl border border-[rgba(15,23,42,0.1)] bg-white/95 px-3 py-2 text-left text-sm text-[var(--text-primary)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="truncate font-mono">
          {selected ? selected.label : <span className="text-[var(--text-tertiary)]">{placeholder}</span>}
        </span>
        <ChevronDown
          size={16}
          className={clsx("text-[var(--text-tertiary)] transition-transform", open && "rotate-180 text-[var(--text-primary)]")}
        />
      </button>
      {open && portalTarget
        ? createPortal(
            <div
              style={menuStyle}
              className="rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white shadow-[0_28px_60px_rgba(15,23,42,0.18)]"
            >
              <ul
                ref={listRef}
                className="scroll-area scroll-area--always max-h-[260px] overflow-auto py-1.5 px-1 space-y-2"
                role="listbox"
              >
                {options.map((option) => {
                  const active = option.value === value;
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        className={clsx(
                          "flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.35)]",
                          active
                            ? "bg-[rgba(37,99,235,0.12)] text-[var(--accent)]"
                            : "text-[var(--text-secondary)] hover:bg-[rgba(15,23,42,0.04)] hover:text-[var(--text-primary)]"
                        )}
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                        role="option"
                        aria-selected={active}
                      >
                        <div className="flex flex-1 flex-col">
                          <span className="truncate font-mono text-[0.85rem]">{option.label}</span>
                          {option.description && (
                            <span className="text-[0.7rem] text-[var(--text-tertiary)]">{option.description}</span>
                          )}
                        </div>
                        {active && <Check size={16} className="text-[var(--accent)]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            portalTarget
          )
        : null}
    </div>
  );
}
