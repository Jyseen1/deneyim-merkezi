"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { Reservation } from "@/lib/types";
import { formatTrShortDate } from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "?";
}

export function PendingApprovalRow({
  reservation,
  staffId,
  onMutated,
}: {
  reservation: Reservation;
  staffId: string;
  onMutated?: () => void;
}) {
  const router = useRouter();
  const token = useBackendToken();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function act(action: "approve" | "reject") {
    setErr(null);
    setBusy(action);
    try {
      await apiFetch(
        `/reservations/${reservation.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify(
            action === "approve"
              ? { action: "approve", staffId }
              : { action: "reject" },
          ),
        },
        token,
      );
      if (onMutated) onMutated();
      else startTransition(() => router.refresh());
    } catch (e) {
      const msg =
        e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
      setErr(msg);
    } finally {
      setBusy(null);
    }
  }

  const dateStr = formatTrShortDate(reservation.visitDate);
  const name = reservation.visitor?.name ?? "Ziyaretçi";

  return (
    <div
      style={{
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        transition: "background 0.15s ease",
        borderBottom: "1px solid rgba(237,233,254,0.6)",
      }}
      onMouseOver={(e) =>
        (e.currentTarget.style.background = "rgba(245,243,255,0.8)")
      }
      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: 0,
          flex: 1,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "#ede9fe",
            color: "#4338ca",
            fontWeight: 600,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 0 0 2px #fff, 0 0 0 4px rgba(99,102,241,0.2)",
          }}
        >
          {initialsOf(name)}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "#1e1b4b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#818cf8",
              marginTop: "2px",
            }}
          >
            {dateStr} · {reservation.startTime} · {reservation.groupSize} kişi
          </div>
          {err && (
            <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>
              {err}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => act("reject")}
          disabled={busy !== null}
          className="btn-ghost"
          style={{ padding: "6px 14px", fontSize: "12px" }}
        >
          {busy === "reject" ? "..." : "Reddet"}
        </button>
        <button
          onClick={() => act("approve")}
          disabled={busy !== null}
          className="btn-primary"
          style={{ padding: "6px 16px", fontSize: "12px" }}
        >
          {busy === "approve" ? "..." : "Onayla"}
        </button>
      </div>
    </div>
  );
}
