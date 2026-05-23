"use client";

import type { Toast, ToastType } from "@/hooks/useToast";

type Palette = {
  bg: string;
  border: string;
  color: string;
  iconBg: string;
  icon: string;
};

const PALETTES: Record<ToastType, Palette> = {
  success: {
    bg: "#d1fae5",
    border: "#a7f3d0",
    color: "#065f46",
    iconBg: "#10b981",
    icon: "✓",
  },
  error: {
    bg: "#fee2e2",
    border: "#fca5a5",
    color: "#991b1b",
    iconBg: "#ef4444",
    icon: "!",
  },
  info: {
    bg: "#ede9fe",
    border: "#c4b5fd",
    color: "#4338ca",
    iconBg: "#7c3aed",
    icon: "i",
  },
};

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      {toasts.map((t) => {
        const p = PALETTES[t.type] ?? PALETTES.info;
        return (
          <div
            key={t.id}
            role="status"
            className="fade-up"
            style={{
              pointerEvents: "auto",
              minWidth: "240px",
              maxWidth: "380px",
              padding: "10px 12px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 500,
              color: p.color,
              background: p.bg,
              border: `1px solid ${p.border}`,
              boxShadow: "0 12px 28px rgba(30,27,75,0.16)",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: p.iconBg,
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "inherit",
              }}
            >
              {p.icon}
            </span>
            <span
              style={{
                flex: 1,
                lineHeight: 1.4,
                wordBreak: "break-word",
              }}
            >
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Kapat"
              style={{
                flexShrink: 0,
                width: "20px",
                height: "20px",
                borderRadius: "6px",
                border: "none",
                background: "transparent",
                color: p.color,
                opacity: 0.55,
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "opacity 0.15s ease",
              }}
              onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseOut={(e) => (e.currentTarget.style.opacity = "0.55")}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
