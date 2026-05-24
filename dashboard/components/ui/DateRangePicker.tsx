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

// Tek takvim açılışında range seçim. İlk tık → from, ikinci tık → to.
// from'dan önce tıklanırsa swap. İki tarih arası vurgulanır; phase="to" iken
// hover preview ile from↔hover arası da preview olarak gösterilir.
// Backend kontratı korunur — onChange `{ from, to }` döner, her ikisi
// "YYYY-MM-DD" veya "" olabilir.

type RangeValue = { from: string; to: string };

type Props = {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  zIndex?: number;
};

function parseISO(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function compactDisplay(from: string, to: string): string {
  const f = parseISO(from);
  const t = parseISO(to);
  if (!f || !t) return "";
  // Aynı ay/yıl: "5 – 29 Mayıs"
  if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
    return `${f.getDate()} – ${t.getDate()} ${TR_MONTHS[f.getMonth()]}`;
  }
  // Aynı yıl, farklı ay: "5 Mayıs – 14 Haziran"
  if (f.getFullYear() === t.getFullYear()) {
    return `${f.getDate()} ${TR_MONTHS[f.getMonth()]} – ${t.getDate()} ${TR_MONTHS[t.getMonth()]}`;
  }
  // Farklı yıl: "5 Mayıs 2025 – 14 Haziran 2026"
  return `${f.getDate()} ${TR_MONTHS[f.getMonth()]} ${f.getFullYear()} – ${t.getDate()} ${TR_MONTHS[t.getMonth()]} ${t.getFullYear()}`;
}

function partialDisplay(from: string): string {
  const f = parseISO(from);
  if (!f) return "";
  return `${f.getDate()} ${TR_MONTHS[f.getMonth()]} – …`;
}

export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Tarih aralığı seç",
  disabled,
  ariaLabel,
  zIndex = 9999,
}: Props) {
  const [open, setOpen] = useState(false);
  // İki aşamalı tıklama: önce from beklenir, sonra to
  type Phase = "from" | "to";
  const [phase, setPhase] = useState<Phase>("from");
  const [hovered, setHovered] = useState<Date | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const fromDate = parseISO(value.from);
  const toDate = parseISO(value.to);

  const [anchor, setAnchor] = useState<Date>(() => fromDate ?? new Date());

  // Açılırken state'i value'ya senkronize et — fromDate dependency'sini doğrudan
  // koyarsak her render'da yeni Date örneği üretip sonsuz loop'a sokar. Bu
  // yüzden value.from string'ini gözle.
  useEffect(() => {
    if (open) {
      setAnchor(parseISO(value.from) ?? new Date());
      setPhase(value.from && !value.to ? "to" : "from");
      setHovered(null);
    }
  }, [open, value.from, value.to]);

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
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  }

  function isDisabled(d: Date): boolean {
    if (minDate && d < startOfDay(minDate)) return true;
    if (maxDate && d > startOfDay(maxDate)) return true;
    return false;
  }

  // Range içinde mi (yalnızca commit edilmiş from+to arası)
  function isInCommittedRange(d: Date): boolean {
    if (!fromDate || !toDate) return false;
    const t = startOfDay(d).getTime();
    const a = Math.min(fromDate.getTime(), toDate.getTime());
    const b = Math.max(fromDate.getTime(), toDate.getTime());
    return t > a && t < b;
  }

  // Preview range (phase=="to" iken from ↔ hovered arası)
  function isInHoverRange(d: Date): boolean {
    if (phase !== "to" || !fromDate || !hovered) return false;
    const t = startOfDay(d).getTime();
    const a = Math.min(fromDate.getTime(), hovered.getTime());
    const b = Math.max(fromDate.getTime(), hovered.getTime());
    return t > a && t < b;
  }

  function isAnchor(d: Date): "from" | "to" | null {
    if (fromDate && isSameLocalDay(d, fromDate)) return "from";
    if (toDate && isSameLocalDay(d, toDate)) return "to";
    return null;
  }

  function pick(d: Date) {
    const iso = toLocalIso(d);
    if (phase === "from") {
      // İlk tık: from set, to temizle
      onChange({ from: iso, to: "" });
      setPhase("to");
      setHovered(d);
      return;
    }
    // İkinci tık: from'dan önceyse swap
    if (fromDate && d < startOfDay(fromDate)) {
      onChange({ from: iso, to: value.from });
    } else {
      onChange({ from: value.from, to: iso });
    }
    setOpen(false);
    setPhase("from");
    setHovered(null);
  }

  function clear() {
    onChange({ from: "", to: "" });
    setPhase("from");
    setHovered(null);
  }

  const displayText =
    value.from && value.to
      ? compactDisplay(value.from, value.to)
      : value.from
        ? partialDisplay(value.from)
        : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || "Tarih aralığı seç"}
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
          color: displayText ? "var(--gx-text)" : "var(--gx-text-hint)",
          fontSize: "13px",
          textAlign: "left",
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          boxSizing: "border-box",
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
          {displayText || placeholder}
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

      {open && typeof document !== "undefined" &&
        createPortal(
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
              {/* Üst başlık: faz hint'i */}
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--muted2)",
                  fontWeight: 600,
                  marginBottom: "10px",
                  textAlign: "center",
                }}
              >
                {phase === "from"
                  ? "Başlangıç tarihini seçin"
                  : "Bitiş tarihini seçin"}
              </div>

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

              {/* Gün başlıkları */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: "2px",
                  marginBottom: "4px",
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

              {/* Hücreler */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: "2px",
                }}
              >
                {cells.map((d) => {
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const isToday = isSameLocalDay(d, today);
                  const anchorKind = isAnchor(d);
                  const inRange = isInCommittedRange(d);
                  const inHover = isInHoverRange(d);
                  const disabledCell = isDisabled(d);

                  // Anchor (from veya to) — mor solid
                  // In-range — mor tint
                  // Hover-range (preview) — daha hafif mor tint
                  // Bugün — accent border (anchor değilse)
                  let bg = "transparent";
                  let color = "var(--gx-text)";
                  let border = "1px solid transparent";
                  let radius = "50%";
                  let fontWeight: number = 400;

                  if (anchorKind) {
                    bg = "var(--gx-gradient)";
                    color = "#FFFFFF";
                    fontWeight = 600;
                    // Anchor'da uç köşelerden range'e doğru flat — görsel devamlılık
                    if (anchorKind === "from" && toDate) {
                      radius = "50% 0 0 50%";
                    } else if (anchorKind === "to" && fromDate) {
                      radius = "0 50% 50% 0";
                    }
                  } else if (inRange) {
                    bg = "rgba(124,58,237,0.20)";
                    color = "var(--gx-text)";
                    radius = "0";
                  } else if (inHover) {
                    bg = "rgba(124,58,237,0.10)";
                    color = "var(--gx-text)";
                    radius = "0";
                  } else if (isToday) {
                    border = "1px solid var(--gx-accent)";
                    color = "var(--gx-accent-light)";
                    fontWeight = 600;
                  }
                  if (!inMonth) color = "var(--gx-text-hint)";
                  if (disabledCell) color = "rgba(113,113,122,0.4)";

                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={disabledCell}
                      onClick={() => !disabledCell && pick(d)}
                      onMouseEnter={() => {
                        if (disabledCell) return;
                        if (phase === "to") setHovered(d);
                      }}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        minHeight: "36px",
                        borderRadius: radius,
                        background: bg,
                        border,
                        color,
                        fontSize: "13px",
                        fontWeight,
                        cursor: disabledCell ? "not-allowed" : "pointer",
                        opacity: disabledCell ? 0.4 : inMonth ? 1 : 0.45,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition:
                          "background 0.12s ease, border-color 0.12s ease",
                        fontFamily: "inherit",
                        boxShadow: anchorKind
                          ? "0 4px 14px rgba(124,58,237,0.45)"
                          : "none",
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
                  onClick={clear}
                  disabled={!value.from && !value.to}
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    padding: "6px 14px",
                    borderRadius: "99px",
                    background: "transparent",
                    border: "1px solid var(--gx-border)",
                    color: "var(--muted)",
                    cursor:
                      !value.from && !value.to ? "not-allowed" : "pointer",
                    opacity: !value.from && !value.to ? 0.4 : 1,
                    fontFamily: "var(--inter)",
                  }}
                >
                  Temizle
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: "99px",
                    background: "rgba(124,58,237,0.10)",
                    border: "1px solid rgba(124,58,237,0.30)",
                    color: "var(--gx-accent-light)",
                    cursor: "pointer",
                    fontFamily: "var(--inter)",
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
