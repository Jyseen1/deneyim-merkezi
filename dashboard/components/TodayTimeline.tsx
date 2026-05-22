"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";

type SlotStatus = "available" | "booked" | "pending" | "closed";

type TimelineSlot = {
  startTime: string;
  endTime: string;
  status: SlotStatus;
  label?: string;
};

type TodaySlotsResp = {
  date: string;
  slots: TimelineSlot[];
};

function slotVisual(status: SlotStatus): React.CSSProperties {
  switch (status) {
    case "booked":
      return {
        background: "#4338ca",
        color: "#e0e7ff",
        border: "1px solid #4338ca",
      };
    case "pending":
      return {
        background: "#fbbf24",
        color: "#78350f",
        border: "1px solid #f59e0b",
      };
    case "closed":
      return {
        background: "rgba(239,68,68,0.12)",
        color: "#991b1b",
        border: "1px solid rgba(239,68,68,0.3)",
      };
    case "available":
    default:
      return {
        background: "rgba(255,255,255,0.5)",
        color: "#4338ca",
        border: "1px solid #c4b5fd",
      };
  }
}

function statusLabel(status: SlotStatus): string {
  switch (status) {
    case "booked":
      return "dolu";
    case "pending":
      return "bekliyor";
    case "closed":
      return "kapalı";
    case "available":
    default:
      return "müsait";
  }
}

export function TodayTimeline() {
  const token = useBackendToken();
  const [slots, setSlots] = useState<TimelineSlot[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<TodaySlotsResp>("/dashboard/today-slots", {}, token)
      .then((r) => {
        if (!cancelled) setSlots(r.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const allAvailable =
    slots !== null &&
    slots.length > 0 &&
    slots.every((s) => s.status === "available");

  return (
    <section
      className="glass fade-up fade-up-5"
      style={{ marginTop: "20px", padding: "16px 20px 18px" }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}
      >
        <h2
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#1e1b4b",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Bugünkü Slotlar
        </h2>
        <span style={{ fontSize: "11px", color: "#a5b4fc" }}>09:00 – 19:00</span>
      </header>

      {loading || slots === null ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "10px",
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="shimmer"
              style={{ height: "54px", borderRadius: "10px" }}
            />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div
          style={{
            padding: "20px 0",
            textAlign: "center",
            fontSize: "13px",
            color: "#a5b4fc",
          }}
        >
          Bugün için rezervasyon bulunmuyor.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))`,
              gap: "10px",
            }}
          >
            {slots.map((s) => (
              <div
                key={s.startTime}
                style={{
                  ...slotVisual(s.status),
                  padding: "10px 8px",
                  borderRadius: "10px",
                  textAlign: "center",
                  transition: "transform 0.15s ease",
                  cursor: "default",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "translateY(-2px)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "translateY(0)")
                }
                title={s.label ?? statusLabel(s.status)}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.1,
                  }}
                >
                  {s.startTime}
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "10px",
                    opacity: 0.85,
                    textTransform: "lowercase",
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.label ?? statusLabel(s.status)}
                </div>
              </div>
            ))}
          </div>

          {allAvailable && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "11px",
                color: "#a5b4fc",
                textAlign: "center",
              }}
            >
              Bugün için aktif rezervasyon yok.
            </div>
          )}

          <div
            style={{
              marginTop: "12px",
              display: "flex",
              gap: "14px",
              fontSize: "11px",
              color: "#818cf8",
            }}
          >
            <LegendDot color="#4338ca" label="Dolu" />
            <LegendDot color="#fbbf24" label="Bekliyor" />
            <LegendDot color="#c4b5fd" outline label="Müsait" />
            <LegendDot color="#ef4444" outline label="Kapalı" />
          </div>
        </>
      )}
    </section>
  );
}

function LegendDot({
  color,
  label,
  outline,
}: {
  color: string;
  label: string;
  outline?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "3px",
          background: outline ? "transparent" : color,
          border: `1.5px solid ${color}`,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
