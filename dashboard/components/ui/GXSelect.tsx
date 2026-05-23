"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type GXSelectOption<T extends string | number = string> = {
  value: T;
  label: string;
};

type Props<T extends string | number = string> = {
  options: GXSelectOption<T>[];
  value: T;
  onChange: (v: T) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

type Rect = { left: number; top: number; width: number; height: number };

export function GXSelect<T extends string | number = string>({
  options,
  value,
  onChange,
  placeholder = "Seçin",
  disabled,
  ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  // Trigger pozisyonunu fixed dropdown için ölç. Açılırken + scroll/resize
  // sırasında güncel tut. useLayoutEffect ile ilk açılışta paint öncesi ölç,
  // dropdown "yer değiştirme" flash'ı yaşamasın.
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  // Dışarı tık + Escape ile kapat. Portal'da olduğu için rootRef.contains()
  // ile değil; trigger ve dropdown ref'lerini ayrı ayrı kontrol et.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      if (dropdownRef.current && dropdownRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${
            open ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.10)"
          }`,
          borderRadius: "10px",
          padding: "10px 14px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          color: selected ? "#E4E4E7" : "#52525B",
          fontFamily: "var(--font-inter), system-ui",
          fontSize: "14px",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          boxShadow: open ? "0 0 0 3px rgba(124,58,237,0.15)" : "none",
          userSelect: "none",
          outline: "none",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          color="#71717A"
          style={{
            transition: "transform 180ms ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        />
      </div>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            style={{
              position: "fixed",
              top: rect.top + rect.height + 6,
              left: rect.left,
              width: rect.width,
              background: "#111118",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "12px",
              overflow: "hidden",
              zIndex: 9999,
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              maxHeight: "280px",
              overflowY: "auto",
            }}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <div
                  key={String(opt.value)}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontFamily: "var(--font-inter), system-ui",
                    color: active ? "#A78BFA" : "#D4D4D8",
                    background: active
                      ? "rgba(124,58,237,0.12)"
                      : "transparent",
                    transition: "background 0.12s ease",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (active) return;
                    e.currentTarget.style.background =
                      "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (active) return;
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {opt.label}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
