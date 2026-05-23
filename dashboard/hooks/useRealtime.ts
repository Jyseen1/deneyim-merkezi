"use client";

import { useEffect, useRef } from "react";
import { useBackendToken } from "./useBackendToken";

type AppEvent =
  | { type: "new_reservation"; reservationId?: string; visitorName?: string; status?: string }
  | { type: "reservation_updated"; reservationId?: string; status?: string; visitorName?: string };

export type RealtimeHandlers = {
  onNewReservation?: (data: Extract<AppEvent, { type: "new_reservation" }>) => void;
  onReservationUpdated?: (
    data: Extract<AppEvent, { type: "reservation_updated" }>,
  ) => void;
};

function backendBase(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

// EventSource ile SSE'ye baglanir. Token query param ile gecer
// (EventSource header destegi yok).
export function useRealtime(handlers: RealtimeHandlers = {}) {
  const token = useBackendToken();
  const hRef = useRef(handlers);
  hRef.current = handlers;

  useEffect(() => {
    if (!token) {
      console.log("[sse] token yok, baglanmiyor");
      return;
    }
    const url = `${backendBase()}/api/v1/events/stream?token=${encodeURIComponent(token)}`;
    console.log("[sse] connecting", url.replace(/token=[^&]+/, "token=***"));
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
    } catch (err) {
      console.error("[sse] EventSource ctor fail", err);
      return;
    }

    es.onopen = () => console.log("[sse] open");
    es.addEventListener("ready", () => console.log("[sse] ready handshake"));

    const handleNew = (e: MessageEvent) => {
      console.log("[sse] new_reservation", e.data);
      try {
        const data = JSON.parse(e.data);
        hRef.current.onNewReservation?.(data);
      } catch {
        /* sessiz */
      }
    };
    const handleUpd = (e: MessageEvent) => {
      console.log("[sse] reservation_updated", e.data);
      try {
        const data = JSON.parse(e.data);
        hRef.current.onReservationUpdated?.(data);
      } catch {
        /* sessiz */
      }
    };

    es.addEventListener("new_reservation", handleNew);
    es.addEventListener("reservation_updated", handleUpd);

    // EventSource hatasi: tarayici otomatik reconnect dener.
    es.onerror = (e) => {
      console.warn(
        "[sse] error (browser will auto-reconnect)",
        es?.readyState,
        e,
      );
    };

    return () => {
      console.log("[sse] cleanup");
      try {
        es?.removeEventListener("new_reservation", handleNew);
        es?.removeEventListener("reservation_updated", handleUpd);
        es?.close();
      } catch {
        /* noop */
      }
    };
  }, [token]);
}
