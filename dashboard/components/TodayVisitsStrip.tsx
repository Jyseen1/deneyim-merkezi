"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useRealtime } from "@/hooks/useRealtime";
import { toLocalIso } from "@/lib/date";
import type { ReservationList, Reservation } from "@/lib/types";

// Bugune ait onayli + bekleyen rezervasyonlari saate gore siralayip
// ince bir "ziyaret seridi" olarak gosterir. Hicbir kayit yoksa gizlenir.

function visitWord(n: number): string {
  return `${n} ziyaret`;
}

function activeStatus(r: Reservation): boolean {
  return r.status === "APPROVED" || r.status === "PENDING_APPROVAL";
}

export function TodayVisitsStrip() {
  const token = useBackendToken();
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const today = toLocalIso(new Date());
    try {
      const r = await apiFetch<ReservationList>(
        `/reservations?date_from=${today}&date_to=${today}&limit=100`,
        {},
        token,
      );
      const filtered = r.items
        .filter(activeStatus)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      setItems(filtered);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  // Yukleniyor veya bos ise hicbir sey render etme — Genel Bakis'in "Bekleyen"
  // kartinin altinda yalnizca bugun planli ziyaret varsa cikar.
  if (loading || !items || items.length === 0) return null;

  return (
    <div
      className="gx-card fade-up fade-up-5"
      style={{
        marginTop: "16px",
        padding: "20px",
        textAlign: "left",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          color: "var(--gx-text-hint)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          margin: "0 0 14px",
        }}
      >
        Bugün ·{" "}
        <em
          className="font-serif font-italic"
          style={{
            color: "var(--gx-accent-light)",
            textTransform: "none",
            letterSpacing: "0",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "13px",
          }}
        >
          {visitWord(items.length)}
        </em>
      </p>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((r, idx) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 0",
              borderBottom:
                idx === items.length - 1
                  ? "none"
                  : "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--gx-text-muted)",
                width: "48px",
                flexShrink: 0,
                fontFamily: "var(--font-display), system-ui",
              }}
            >
              {r.startTime}
            </span>
            <div
              aria-hidden
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background:
                  r.status === "APPROVED" ? "#8B5CF6" : "rgba(139,92,246,0.4)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "13px",
                color: "#E4E4E7",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={r.visitor?.name ?? "?"}
            >
              {r.visitor?.name ?? "?"}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "11px",
                color: "#52525B",
                fontWeight: 500,
              }}
            >
              {r.groupSize} kişi
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
