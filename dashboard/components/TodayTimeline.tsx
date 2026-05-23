"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useRealtime } from "@/hooks/useRealtime";

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
        background: "var(--gx-gradient)",
        color: "#ffffff",
        border: "1px solid var(--gx-accent)",
      };
    case "pending":
      return {
        background: "rgba(124,58,237,0.18)",
        color: "var(--gx-accent-light)",
        border: "1px solid rgba(124,58,237,0.40)",
      };
    case "closed":
      return {
        background: "rgba(239,68,68,0.14)",
        color: "var(--gx-danger)",
        border: "1px solid rgba(239,68,68,0.35)",
      };
    case "available":
    default:
      return {
        background: "var(--gx-surface)",
        color: "var(--gx-text-muted)",
        border: "1px solid var(--gx-border)",
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

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await apiFetch<TodaySlotsResp>(
        "/dashboard/today-slots",
        {},
        token,
      );
      setSlots(r.slots);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {});
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [load]);

  // SSE: yeni rezervasyon veya guncelleme bugunkuyse timeline'i tazele.
  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

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
            color: "var(--gx-text)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Bugünkü Slotlar
        </h2>
        <span style={{ fontSize: "11px", color: "var(--gx-text-hint)" }}>09:00 – 19:00</span>
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
            color: "var(--gx-text-muted)",
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
                color: "var(--gx-text-hint)",
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
              color: "var(--gx-text-muted)",
            }}
          >
            <LegendDot color="#7C3AED" label="Dolu" />
            <LegendDot color="#8B5CF6" outline label="Bekliyor" />
            <LegendDot color="#71717A" outline label="Müsait" />
            <LegendDot color="#EF4444" outline label="Kapalı" />
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
