"use client";

import type { Toast } from "@/hooks/useToast";

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
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="fade-up"
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            minWidth: "220px",
            maxWidth: "360px",
            padding: "10px 16px",
            borderRadius: "12px",
            fontSize: "13px",
            fontWeight: 500,
            color: t.type === "success" ? "#065f46" : "#991b1b",
            background: t.type === "success" ? "#d1fae5" : "#fee2e2",
            border: `1px solid ${t.type === "success" ? "#a7f3d0" : "#fca5a5"}`,
            boxShadow: "0 8px 24px rgba(30,27,75,0.18)",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
