"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";

type Props = {
  value: string;                  // "HH:MM"
  onChange: (v: string) => void;
  minHour?: number;
  maxHour?: number;
  step?: 30 | 60;                 // dakika kolonu: [0, 30] veya [0]
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

function parseHHMM(s: string): { h: number; m: number } | null {
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return { h, m };
}

function fmt(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function GXTimePicker({
  value,
  onChange,
  minHour = 9,
  maxHour = 19,
  step = 30,
  placeholder = "Saat seç",
  disabled,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const parsed = parseHHMM(value);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = minHour; h <= maxHour; h++) out.push(h);
    return out;
  }, [minHour, maxHour]);

  const minutes = useMemo<number[]>(() => {
    if (step === 60) return [0];
    return [0, 30];
  }, [step]);

  // Yarim secim state'i: kullanici onceki saatte tikladi ama dakika secmedi.
  // Acilirken value'dan baslat, sonra her saat tiklamasinda update et.
  const [draftHour, setDraftHour] = useState<number | null>(
    parsed?.h ?? null,
  );
  useEffect(() => {
    if (open) setDraftHour(parsed?.h ?? null);
  }, [open, parsed?.h]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current && rootRef.current.contains(t)) return;
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

  function pickMinute(m: number) {
    const h = draftHour ?? parsed?.h ?? minHour;
    onChange(fmt(h, m));
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
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
          color: value ? "#E4E4E7" : "#52525B",
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
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            flex: 1,
            minWidth: 0,
          }}
        >
          <Clock size={14} color="#8B5CF6" />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value || placeholder}
          </span>
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

      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "12px",
            overflow: "hidden",
            zIndex: 9999,
            boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            width: "220px",
          }}
        >
          {/* Saat kolonu */}
          <div
            style={{
              maxHeight: "200px",
              overflowY: "auto",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {hours.map((h) => {
              const active = (draftHour ?? parsed?.h ?? -1) === h;
              return (
                <div
                  key={h}
                  onClick={() => setDraftHour(h)}
                  style={{
                    padding: "9px 16px",
                    textAlign: "center",
                    fontSize: "14px",
                    fontFamily: "var(--font-display), system-ui",
                    color: active ? "#A78BFA" : "#D4D4D8",
                    background: active
                      ? "rgba(124,58,237,0.15)"
                      : "transparent",
                    cursor: "pointer",
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
                  {String(h).padStart(2, "0")}
                </div>
              );
            })}
          </div>

          {/* Dakika kolonu */}
          <div
            style={{
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {minutes.map((m) => {
              const active = parsed?.m === m && (draftHour ?? parsed?.h) === parsed?.h;
              return (
                <div
                  key={m}
                  onClick={() => pickMinute(m)}
                  style={{
                    padding: "9px 16px",
                    textAlign: "center",
                    fontSize: "14px",
                    fontFamily: "var(--font-display), system-ui",
                    color: active ? "#A78BFA" : "#D4D4D8",
                    background: active
                      ? "rgba(124,58,237,0.15)"
                      : "transparent",
                    cursor: "pointer",
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
                  {String(m).padStart(2, "0")}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
