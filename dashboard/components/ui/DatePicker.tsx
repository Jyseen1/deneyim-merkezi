"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TR_DAYS_SHORT_MON,
  TR_MONTHS,
  calendarCells,
  isSameLocalDay,
  toLocalIso,
} from "@/lib/date";

type Props = {
  value: string;                     // YYYY-MM-DD or "" (empty)
  onChange: (v: string) => void;
  min?: string;                      // YYYY-MM-DD
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  // Sayfanin tepe seviyesi overlay tetiklendiginde stack icin.
  // Default 9999 — modaller (60-70) ve drawer (50) uzerinde kalir.
  zIndex?: number;
};

function parseISO(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(s: string): string {
  const d = parseISO(s);
  if (!d) return "";
  // "12 Mart 2026"
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Tarih seç",
  disabled,
  ariaLabel,
  zIndex = 9999,
}: Props) {
  const [open, setOpen] = useState(false);
  const initial = parseISO(value) ?? new Date();
  const [anchor, setAnchor] = useState<Date>(initial);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Acildiginda anchor'i value'ye senkronize et (kullanici son seciminden devam etsin)
  useEffect(() => {
    if (open) {
      setAnchor(parseISO(value) ?? new Date());
    }
  }, [open, value]);

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const minDate = useMemo(() => parseISO(min ?? ""), [min]);
  const maxDate = useMemo(() => parseISO(max ?? ""), [max]);

  const cells = useMemo(
    () => calendarCells(anchor.getFullYear(), anchor.getMonth()),
    [anchor],
  );

  const today = useMemo(() => new Date(), []);

  function shiftMonth(delta: number) {
    setAnchor(
      (a) => new Date(a.getFullYear(), a.getMonth() + delta, 1),
    );
  }

  function isDisabled(d: Date): boolean {
    if (minDate && d < startOfDay(minDate)) return true;
    if (maxDate && d > startOfDay(maxDate)) return true;
    return false;
  }

  function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function pick(d: Date) {
    onChange(toLocalIso(d));
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || "Tarih seç"}
        onClick={() => !disabled && setOpen(true)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "10px 12px",
          borderRadius: "10px",
          background: "var(--gx-surface)",
          border: "1px solid var(--gx-border)",
          color: value ? "var(--gx-text)" : "var(--gx-text-hint)",
          fontSize: "13px",
          textAlign: "left",
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          boxSizing: "border-box",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--gx-accent)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.20)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--gx-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--gx-accent-light)", flexShrink: 0 }}
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            opacity: 1,
            transition: "opacity 150ms ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: "340px",
              background:
                "linear-gradient(135deg, rgba(124,58,237,0.14), rgba(255,255,255,0.02)), #0F0F18",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(124,58,237,0.30)",
              borderRadius: "18px",
              padding: "18px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
              color: "var(--gx-text)",
            }}
          >
            {/* Ay navigasyonu */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
              }}
            >
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Önceki ay"
                style={navBtn()}
              >
                ‹
              </button>
              <div
                className="font-display"
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--gx-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                {TR_MONTHS[anchor.getMonth()]} {anchor.getFullYear()}
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Sonraki ay"
                style={navBtn()}
              >
                ›
              </button>
            </div>

            {/* Gun basliklari */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "4px",
                marginBottom: "6px",
              }}
            >
              {TR_DAYS_SHORT_MON.map((d) => (
                <div
                  key={d}
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "var(--gx-text-hint)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textAlign: "center",
                    padding: "4px 0",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Hucreler */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "4px",
              }}
            >
              {cells.map((d) => {
                const inMonth = d.getMonth() === anchor.getMonth();
                const isToday = isSameLocalDay(d, today);
                const isSelected = value ? isSameLocalDay(d, parseISO(value)!) : false;
                const disabledCell = isDisabled(d);

                let bg = "transparent";
                let color = "var(--gx-text)";
                let border = "1px solid transparent";
                if (isSelected) {
                  bg = "var(--gx-gradient)";
                  color = "#FFFFFF";
                } else if (isToday) {
                  border = "1px solid var(--gx-accent)";
                  color = "var(--gx-accent-light)";
                }
                if (!inMonth) {
                  color = "var(--gx-text-hint)";
                }
                if (disabledCell) {
                  color = "rgba(113,113,122,0.4)";
                }

                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    disabled={disabledCell}
                    onClick={() => !disabledCell && pick(d)}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      minHeight: "36px",
                      borderRadius: "50%",
                      background: bg,
                      border,
                      color,
                      fontSize: "13px",
                      fontWeight: isSelected || isToday ? 600 : 400,
                      cursor: disabledCell ? "not-allowed" : "pointer",
                      opacity: disabledCell ? 0.4 : inMonth ? 1 : 0.45,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.12s ease, transform 0.12s ease",
                      fontFamily: "inherit",
                      boxShadow: isSelected ? "0 4px 14px rgba(124,58,237,0.45)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (disabledCell || isSelected) return;
                      e.currentTarget.style.background = "rgba(124,58,237,0.12)";
                    }}
                    onMouseLeave={(e) => {
                      if (disabledCell || isSelected) return;
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Alt aksiyonlar */}
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <button
                type="button"
                onClick={() => pick(new Date())}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: "99px",
                  background: "rgba(124,58,237,0.10)",
                  border: "1px solid rgba(124,58,237,0.30)",
                  color: "var(--gx-accent-light)",
                  cursor: "pointer",
                }}
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: "99px",
                  background: "transparent",
                  border: "1px solid var(--gx-border)",
                  color: "var(--gx-text-muted)",
                  cursor: "pointer",
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function navBtn(): React.CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    background: "rgba(124,58,237,0.10)",
    border: "1px solid rgba(124,58,237,0.20)",
    color: "var(--gx-accent-light)",
    fontSize: "18px",
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s ease",
  };
}
