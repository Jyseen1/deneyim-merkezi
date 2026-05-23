"use client";

import type { ReactNode } from "react";

// Tutarli bos durum bileseni. Her sayfada ayni gorsel + tonla kullanilir.
// tone:
//   default = mor (norm bos durum, henuz veri yok)
//   positive = yesil (her sey yolunda, aksiyon gerektirmiyor)
//   muted = gri (gecmis/arsiv bos)
export type EmptyStateTone = "default" | "positive" | "muted";

type ToneStyles = {
  iconBg: string;
  iconColor: string;
  titleColor: string;
  descColor: string;
};

const TONES: Record<EmptyStateTone, ToneStyles> = {
  default: {
    iconBg: "#ede9fe",
    iconColor: "#4338ca",
    titleColor: "#1e1b4b",
    descColor: "#818cf8",
  },
  positive: {
    iconBg: "#d1fae5",
    iconColor: "#065f46",
    titleColor: "#065f46",
    descColor: "#10b981",
  },
  muted: {
    iconBg: "#f1f5f9",
    iconColor: "#64748b",
    titleColor: "#334155",
    descColor: "#94a3b8",
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
  compact = false,
}: {
  icon?: ReactNode | string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  tone?: EmptyStateTone;
  compact?: boolean;
}) {
  const t = TONES[tone];
  const iconSize = compact ? 56 : 80;
  const padding = compact ? "28px 16px" : "48px 20px";

  return (
    <div
      style={{
        padding,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        aria-hidden
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          borderRadius: "50%",
          background: t.iconBg,
          color: t.iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: compact ? "12px" : "16px",
          fontSize: compact ? "24px" : "32px",
          lineHeight: 1,
        }}
      >
        {icon ?? <DefaultIcon size={compact ? 28 : 40} />}
      </div>
      <div
        style={{
          fontSize: compact ? "13px" : "14px",
          color: t.titleColor,
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontSize: compact ? "11px" : "12px",
            color: t.descColor,
            marginTop: "6px",
            maxWidth: "360px",
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop: "14px",
            padding: "8px 18px",
            borderRadius: "99px",
            border: "1px solid #c4b5fd",
            background: "#ede9fe",
            color: "#4338ca",
            fontWeight: 600,
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function DefaultIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// Hazir ikonlar (kullanım kolaylığı için)
export function CheckCircleIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function InboxIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function ChartIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}
