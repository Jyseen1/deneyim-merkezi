"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useRealtime } from "@/hooks/useRealtime";
import {
  STATUS_LABEL,
  type DashboardStats,
  type Reservation,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/types";
import { EMPTY_STATS, type StatsResult } from "@/components/stats/server-fetch";
import { OverviewCalendar } from "@/components/overview/OverviewCalendar";
import { ReservationDrawer } from "@/components/ReservationDrawer";
import { formatTrShortDate, TR_DAYS, toLocalIso } from "@/lib/date";

const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const POLL_MS_WHEN_OK = 30_000;
const POLL_MS_WHEN_DOWN = 4_000;

function pillClass(s: ReservationStatus): string {
  switch (s) {
    case "APPROVED":
      return "pill ok";
    case "PENDING_APPROVAL":
      return "pill wait";
    case "REJECTED":
      return "pill rej";
    case "CANCELLED":
      return "pill cancel";
    case "NO_SHOW":
      return "pill noshow";
    default:
      return "pill";
  }
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const t = name.trim();
  if (!t) return "?";
  return t.slice(0, 1).toUpperCase();
}

export function OverviewClient({
  initial,
  staffId,
  dateLong,
  dayName,
  firstName,
}: {
  initial: StatsResult;
  staffId: string;
  dateLong: string;
  dayName: string;
  firstName: string;
}) {
  const router = useRouter();
  const token = useBackendToken();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const [stats, setStats] = useState<DashboardStats>(
    initial.ok ? initial.stats : EMPTY_STATS,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(
    initial.ok ? null : initial.error,
  );
  const hasData = useRef(initial.ok);
  const errorRef = useRef(!initial.ok);
  errorRef.current = errorMsg !== null;

  const [recent, setRecent] = useState<Reservation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<{
    id: string;
    kind: "approve" | "reject";
  } | null>(null);

  async function loadStats() {
    try {
      const fresh = await apiFetch<DashboardStats>(
        "/dashboard/stats",
        {},
        tokenRef.current,
      );
      setStats(fresh);
      setErrorMsg(null);
      hasData.current = true;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 0
            ? "Backend bağlantısı kurulamadı"
            : `Backend hatası: ${err.status} ${err.message}`
          : (err as Error).message;
      setErrorMsg(msg);
    }
  }

  async function loadRecent() {
    try {
      const r = await apiFetch<ReservationList>(
        "/reservations?limit=10&page=1",
        {},
        tokenRef.current,
      );
      setRecent(r.items);
    } catch {
      // Sessiz — liste boş kalır.
    }
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await Promise.all([loadStats(), loadRecent()]);
      if (cancelled) return;
      const delay = errorRef.current ? POLL_MS_WHEN_DOWN : POLL_MS_WHEN_OK;
      timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useRealtime({
    onNewReservation: () => {
      loadStats();
      loadRecent();
    },
    onReservationUpdated: () => {
      loadStats();
      loadRecent();
    },
  });

  async function approve(id: string) {
    setBusyAction({ id, kind: "approve" });
    try {
      await apiFetch(
        `/reservations/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "approve", staffId }),
        },
        tokenRef.current,
      );
      await Promise.all([loadStats(), loadRecent()]);
    } finally {
      setBusyAction(null);
    }
  }
  async function reject(id: string) {
    setBusyAction({ id, kind: "reject" });
    try {
      await apiFetch(
        `/reservations/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "reject" }),
        },
        tokenRef.current,
      );
      await Promise.all([loadStats(), loadRecent()]);
    } finally {
      setBusyAction(null);
    }
  }

  const pendingFirst = stats.pendingPreview[0] ?? null;
  const pendingCountWord =
    stats.pending === 1 ? "bir talep" : `${stats.pending} talep`;

  const recentGroups = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    const order: string[] = [];
    for (const r of recent) {
      const iso = toLocalIso(new Date(r.visitDate));
      if (!m.has(iso)) {
        m.set(iso, []);
        order.push(iso);
      }
      m.get(iso)!.push(r);
    }
    return order.map((iso) => ({
      iso,
      date: new Date(iso),
      items: (m.get(iso) ?? []).sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
    }));
  }, [recent]);

  const systemOnline = errorMsg === null;
  const telegramConnected = stats.system?.telegramConnected;

  return (
    <>
      <div className="ov2-page">
        {/* Compact header — date chip + greeting + tagline, status chips right */}
        <header className="ov2-header">
          <div className="ov2-h-l">
            <div className="ov2-date">
              <span className="dot" aria-hidden />
              <span>
                {dateLong} · {dayName}
              </span>
            </div>
            <h1 className="ov2-greet">
              Hoş geldin
              {firstName && (
                <>
                  , <em>{firstName}</em>
                </>
              )}
            </h1>
            <div className="ov2-tagline">
              Bugün <b>{stats.today}</b> <em>ziyaret</em> planlı ·{" "}
              <b>{stats.pending}</b> <em>onay</em> bekliyor
            </div>
          </div>
          <div className="ov2-h-r">
            <StatusChip
              dotColor={systemOnline ? "var(--green)" : "var(--red)"}
              pulse={systemOnline}
              label={systemOnline ? "Sistem çevrimiçi" : "Sistem çevrimdışı"}
            />
            {telegramConnected !== undefined && (
              <StatusChip
                dotColor={telegramConnected ? "var(--accent2)" : "var(--muted3)"}
                label={
                  telegramConnected ? "Telegram bağlı" : "Telegram bağlı değil"
                }
              />
            )}
          </div>
        </header>

        {/* Pending bar — always reserves layout space (visibility hidden if empty) */}
        <div
          className={`ov2-pending${pendingFirst ? "" : " empty"}`}
          onClick={(e) => {
            if (!pendingFirst) return;
            if ((e.target as HTMLElement).closest("button")) return;
            setActiveId(pendingFirst.id);
          }}
          role={pendingFirst ? "button" : undefined}
        >
          {pendingFirst ? (
            <>
              <div className="avatar" aria-hidden>
                {initials(pendingFirst.visitor?.name)}
              </div>
              <div className="info">
                <div className="t">
                  Bekleyen <em>{pendingCountWord}</em>
                </div>
                <div className="m">
                  <b>{pendingFirst.visitor?.name ?? "—"}</b> ·{" "}
                  {formatTrShortDate(pendingFirst.visitDate)} ·{" "}
                  {pendingFirst.startTime} · {pendingFirst.groupSize} kişi
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busyAction !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    reject(pendingFirst.id);
                  }}
                >
                  {busyAction?.id === pendingFirst.id &&
                  busyAction?.kind === "reject"
                    ? "..."
                    : "Reddet"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyAction !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    approve(pendingFirst.id);
                  }}
                >
                  {busyAction?.id === pendingFirst.id &&
                  busyAction?.kind === "approve"
                    ? "..."
                    : "Onayla"}
                </button>
              </div>
            </>
          ) : (
            // Placeholder content keeps the same min-height; visibility hidden.
            <div aria-hidden style={{ height: "34px" }} />
          )}
        </div>

        {errorMsg && (
          <div className="ov2-error">
            <b>Backend bağlantısı kurulamadı</b>
            <div className="det">{errorMsg}</div>
          </div>
        )}

        {/* Body — left calendar, right stack */}
        <div className="ov2-body">
          <div className="ov2-left">
            <OverviewCalendar
              onReservationClick={(id) => setActiveId(id)}
              onNavigateToFull={() => router.push("/admin/calendar")}
              onAddReservation={() => router.push("/")}
            />
          </div>

          <div className="ov2-right">
            <div className="ov2-statgrid">
              <div className="stat">
                <div className="card-accent" />
                <div className="l">Doluluk</div>
                <div className="v">
                  {stats.utilizationPct}
                  <small>%</small>
                </div>
              </div>
              <div className="stat hl">
                <div className="card-accent" />
                <div className="l">Bekleyen</div>
                <div
                  className="v font-serif font-italic"
                  style={{ color: "var(--accent3)" }}
                >
                  {stats.pending}
                </div>
              </div>
              <div className="stat">
                <div className="card-accent" />
                <div className="l">Bu Hafta</div>
                <div className="v">{stats.thisWeek}</div>
              </div>
              <div className="stat">
                <div className="card-accent" />
                <div className="l">Bu Ay</div>
                <div className="v">{stats.thisMonth ?? 0}</div>
              </div>
            </div>

            <div className="ov2-actions">
              <button
                type="button"
                className="ov2-btn"
                onClick={() => router.push("/")}
              >
                + Rezervasyon
              </button>
              <button
                type="button"
                className="ov2-btn"
                onClick={() => router.push("/admin/calendar")}
              >
                ⊘ Gün kapat
              </button>
            </div>

            <div className="ov2-recent card">
              <div className="card-accent" />
              <div className="hdr">
                <div className="card-h" style={{ margin: 0 }}>
                  Son <em style={{ marginLeft: "6px" }}>rezervasyonlar</em>
                </div>
                <button
                  type="button"
                  className="golink"
                  onClick={() => router.push("/admin/reservations")}
                  aria-label="Tüm rezervasyonlar"
                >
                  Tümü <span className="arr">→</span>
                </button>
              </div>
              <div className="list">
                {recent.length === 0 ? (
                  <div className="empty-state">Henüz rezervasyon yok.</div>
                ) : (
                  recentGroups.map((g, gi) => (
                    <div
                      key={g.iso}
                      className="daygroup"
                      style={{
                        marginBottom:
                          gi === recentGroups.length - 1 ? 0 : "12px",
                      }}
                    >
                      <div className="dh" style={{ marginBottom: "6px" }}>
                        <span className="big" style={{ fontSize: "12px" }}>
                          {g.date.getDate()}{" "}
                          <em>{MONTHS[g.date.getMonth()]}</em>
                        </span>
                        <span className="cnt">· {TR_DAYS[g.date.getDay()]}</span>
                      </div>
                      {g.items.map((r) => {
                        const isPending = r.status === "PENDING_APPROVAL";
                        return (
                          <div
                            key={r.id}
                            className={`rmini${isPending ? " pend" : ""}`}
                            onClick={() => setActiveId(r.id)}
                            role="button"
                            style={{
                              padding: "8px 10px",
                              gap: "8px",
                              marginBottom: "3px",
                            }}
                          >
                            <div
                              className="tm"
                              style={{ width: "40px", fontSize: "12px" }}
                            >
                              {r.startTime}
                            </div>
                            <div className="nm" style={{ fontSize: "12px" }}>
                              {r.visitor?.name ?? "—"}
                            </div>
                            <span
                              className={pillClass(r.status)}
                              style={{ flexShrink: 0 }}
                            >
                              {STATUS_LABEL[r.status]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ReservationDrawer
        reservationId={activeId}
        staffId={staffId}
        onClose={() => setActiveId(null)}
        onMutated={() => {
          loadStats();
          loadRecent();
        }}
      />
    </>
  );
}

// Status chip — kept identical to previous behavior.
function StatusChip({
  dotColor,
  label,
  pulse,
}: {
  dotColor: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 10px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--line)",
        fontSize: "10px",
        fontFamily: "var(--inter)",
        color: "var(--muted)",
        whiteSpace: "nowrap",
      }}
    >
      {pulse ? (
        <span
          aria-hidden
          className="live-dot"
          style={{ margin: 0, background: dotColor, boxShadow: "none" }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </div>
  );
}
