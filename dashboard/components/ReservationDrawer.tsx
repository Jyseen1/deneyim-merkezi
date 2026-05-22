"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationStatus,
} from "@/lib/types";
import { formatTrDateTime, formatTrShortDate } from "@/lib/date";

type Action = "approve" | "reject" | "cancel" | "no_show";

type VisitorHistory = {
  visitor: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    createdAt: string;
  };
  reservations: Reservation[];
  stats: {
    total: number;
    approved: number;
    cancelled: number;
    rejected: number;
    noShow: number;
    completed: number;
    firstVisit: string | null;
    lastVisit: string | null;
  };
};

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "status-pending",
  APPROVED: "status-approved",
  REJECTED: "status-rejected",
  CANCELLED: "status-cancelled",
  COMPLETED: "status-completed",
  NO_SHOW: "status-noshow",
};

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid rgba(237,233,254,0.7)",
      }}
    >
      <div style={{ fontSize: "11px", color: "#818cf8" }}>{label}</div>
      <div
        style={{
          fontSize: "13px",
          color: "#1e1b4b",
          textAlign: "right",
          maxWidth: "60%",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: "20px" }}>
      <h3
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#818cf8",
          margin: 0,
        }}
      >
        {title}
      </h3>
      <div
        style={{
          marginTop: "8px",
          background: "#faf5ff",
          border: "1px solid #ede9fe",
          borderRadius: "12px",
          padding: "8px 14px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ReservationDrawer({
  reservationId,
  staffId,
  onClose,
  onMutated,
}: {
  reservationId: string | null;
  staffId: string;
  onClose: () => void;
  onMutated: () => void;
}) {
  const token = useBackendToken();
  const [data, setData] = useState<Reservation | null>(null);
  const [history, setHistory] = useState<VisitorHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setData(null);
    setHistory(null);
    apiFetch<Reservation>(`/reservations/${reservationId}`, {}, token)
      .then((r) => {
        if (!cancelled) setData(r);
        if (r.visitor?.phone) {
          apiFetch<VisitorHistory>(
            `/visitors/${encodeURIComponent(r.visitor.phone)}`,
            {},
            token,
          )
            .then((h) => {
              if (!cancelled) setHistory(h);
            })
            .catch(() => {
              if (!cancelled) setHistory(null);
            });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(
            e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reservationId, token]);

  async function act(action: Action) {
    if (!data) return;
    setBusy(action);
    setErr(null);
    try {
      await apiFetch(
        `/reservations/${data.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify(
            action === "approve" ? { action: "approve", staffId } : { action },
          ),
        },
        token,
      );
      const fresh = await apiFetch<Reservation>(
        `/reservations/${data.id}`,
        {},
        token,
      );
      setData(fresh);
      onMutated();
    } catch (e) {
      setErr(
        e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message,
      );
    } finally {
      setBusy(null);
    }
  }

  const open = reservationId !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(30,27,75,0.4)",
          zIndex: 40,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />

      {/* Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "420px",
          maxWidth: "100%",
          background: "#ffffff",
          borderLeft: "1px solid #ede9fe",
          zIndex: 50,
          boxShadow: "-24px 0 48px rgba(30,27,75,0.12)",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "1px solid #ede9fe",
          }}
        >
          <div>
            <h2
              className="gradient-text"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "-0.3px",
                margin: 0,
              }}
            >
              Rezervasyon Detayı
            </h2>
            {data && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#a5b4fc",
                  marginTop: "4px",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                }}
              >
                {data.id.slice(0, 8)}…
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "transparent",
              border: "none",
              color: "#a5b4fc",
              fontSize: "22px",
              lineHeight: 1,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#faf5ff";
              e.currentTarget.style.color = "#4338ca";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a5b4fc";
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 22px 20px",
          }}
        >
          {loading && (
            <div style={{ fontSize: "13px", color: "#a5b4fc" }}>
              Yükleniyor...
            </div>
          )}
          {err && (
            <div
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#991b1b",
                padding: "10px 12px",
                borderRadius: "10px",
                fontSize: "13px",
              }}
            >
              {err}
            </div>
          )}
          {data && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span className={`status-pill ${STATUS_CLASS[data.status]}`}>
                  {STATUS_LABEL[data.status]}
                </span>
                <span style={{ fontSize: "11px", color: "#a5b4fc" }}>
                  {data.groupSize} kişi · {data.durationMinutes} dk
                </span>
                {history && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "99px",
                      background:
                        history.stats.total <= 1 ? "#ede9fe" : "#d1fae5",
                      color:
                        history.stats.total <= 1 ? "#4338ca" : "#065f46",
                      border: `1px solid ${history.stats.total <= 1 ? "#c4b5fd" : "#a7f3d0"}`,
                    }}
                  >
                    {history.stats.total <= 1
                      ? "İlk ziyaret"
                      : `${history.stats.total}. ziyaret`}
                  </span>
                )}
              </div>

              <Block title="Ziyaretçi">
                <Row label="Ad" value={data.visitor?.name ?? "-"} />
                <Row label="Telefon" value={data.visitor?.phone ?? "-"} />
                <Row
                  label="E-posta"
                  value={data.visitor?.email ?? "-"}
                />
              </Block>

              <Block title="Ziyaret">
                <Row
                  label="Tarih"
                  value={formatTrShortDate(data.visitDate)}
                />
                <Row label="Saat" value={data.startTime} />
                <Row label="Süre" value={`${data.durationMinutes} dk`} />
                <Row label="Kişi sayısı" value={data.groupSize} />
                {data.note && <Row label="Not" value={data.note} />}
              </Block>

              <Block title="Durum Geçmişi">
                <Row
                  label="Oluşturuldu"
                  value={formatTrDateTime(data.createdAt)}
                />
                <Row
                  label="Güncellendi"
                  value={formatTrDateTime(data.updatedAt)}
                />
                <Row
                  label="Onaylandı"
                  value={
                    data.approvedAt
                      ? `${formatTrDateTime(data.approvedAt)} · ${data.approvedBy ?? ""}`
                      : "-"
                  }
                />
                <Row
                  label="İptal/Red"
                  value={
                    data.cancelledAt
                      ? `${formatTrDateTime(data.cancelledAt)}${data.cancelReason ? ` · ${data.cancelReason}` : ""}`
                      : "-"
                  }
                />
              </Block>

              {history && history.reservations.length > 1 && (
                <Block title="Geçmiş Ziyaretler">
                  {history.reservations
                    .filter((r) => r.id !== data.id)
                    .slice(0, 5)
                    .map((r) => (
                      <Row
                        key={r.id}
                        label={formatTrShortDate(r.visitDate) + " · " + r.startTime}
                        value={
                          <span
                            className={`status-pill ${STATUS_CLASS[r.status]}`}
                            style={{ fontSize: "10px" }}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                        }
                      />
                    ))}
                  {history.reservations.length > 6 && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#a5b4fc",
                        textAlign: "center",
                        padding: "8px 0 0",
                      }}
                    >
                      +{history.reservations.length - 6} daha
                    </div>
                  )}
                </Block>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {data && (
          <div
            style={{
              padding: "14px 22px",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
              borderTop: "1px solid #ede9fe",
              background: "#faf5ff",
            }}
          >
            {data.status === "PENDING_APPROVAL" && (
              <>
                <button
                  onClick={() => act("reject")}
                  disabled={busy !== null}
                  className="btn-ghost"
                >
                  {busy === "reject" ? "..." : "Reddet"}
                </button>
                <button
                  onClick={() => act("approve")}
                  disabled={busy !== null}
                  className="btn-primary"
                >
                  {busy === "approve" ? "..." : "Onayla"}
                </button>
              </>
            )}
            {data.status === "APPROVED" && (
              <>
                {(() => {
                  const visitMs =
                    new Date(data.visitDate).getTime() +
                    timeToMinutes(data.startTime) * 60_000;
                  const isPast = visitMs < Date.now();
                  return isPast ? (
                    <button
                      onClick={() => act("no_show")}
                      disabled={busy !== null}
                      className="btn-ghost"
                      style={{
                        borderColor: "#fed7aa",
                        color: "#9a3412",
                      }}
                    >
                      {busy === "no_show" ? "..." : "Gelmedi"}
                    </button>
                  ) : null;
                })()}
                <button
                  onClick={() => act("cancel")}
                  disabled={busy !== null}
                  className="btn-ghost"
                >
                  {busy === "cancel" ? "..." : "İptal et"}
                </button>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
