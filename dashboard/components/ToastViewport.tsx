"use client";

import type { Toast, ToastType } from "@/hooks/useToast";

type Palette = {
  bg: string;
  border: string;
  color: string;
  iconBg: string;
  icon: string;
};

// GigaX paleti — koyu cam zemin, parlak ikon
const PALETTES: Record<ToastType, Palette> = {
  success: {
    bg: "rgba(74,222,128,0.12)",
    border: "rgba(74,222,128,0.35)",
    color: "#4ADE80",
    iconBg: "#4ADE80",
    icon: "✓",
  },
  error: {
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.35)",
    color: "#EF4444",
    iconBg: "#EF4444",
    icon: "!",
  },
  info: {
    bg: "rgba(124,58,237,0.15)",
    border: "rgba(124,58,237,0.35)",
    color: "#8B5CF6",
    iconBg: "#7C3AED",
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
              padding: "11px 14px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 500,
              color: p.color,
              // Koyu surface + renkli cam overlay
              background: `${p.bg}, var(--gx-surface-2)`,
              border: `1px solid ${p.border}`,
              boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
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
