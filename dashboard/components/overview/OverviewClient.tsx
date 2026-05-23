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
        "/reservations?limit=5&page=1",
        {},
        tokenRef.current,
      );
      setRecent(r.items);
    } catch {
      // Sessiz — sağ panel boş kalır.
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await Promise.all([loadStats(), loadRecent()]);
      if (cancelled) return;
      const delay = errorRef.current ? POLL_MS_WHEN_DOWN : POLL_MS_WHEN_OK;
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, errorRef.current ? POLL_MS_WHEN_DOWN : POLL_MS_WHEN_OK);
    // İlk anlık çekim
    loadRecent();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const pendingCountWord = stats.pending === 1 ? "bir talep" : `${stats.pending} talep`;

  // Son rezervasyonları tarihe göre grupla — Rezervasyonlar sayfasındaki ile
  // aynı mantık, fakat dar sağ panel için kompakt render (telefon/kişi yok).
  // Backend sıralaması korunur; map ile karşılaşma sırasına göre grup oluşur.
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

  return (
    <>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        {/* 1. Karşılama — kart İÇİNDE değil, doğal */}
        <div
          className="welcome fade-up"
          style={{ textAlign: "center", padding: "14px 0 28px" }}
        >
          <div className="date">
            {dateLong} · {dayName}
          </div>
          <h1 style={{ fontSize: "42px" }}>
            Hoş geldin{firstName && <>, <em>{firstName}</em></>}
          </h1>
          <div
            style={{
              fontSize: "15px",
              color: "var(--muted)",
              marginTop: "10px",
            }}
          >
            Bugün{" "}
            <b style={{ color: "var(--accent2)", fontWeight: 600 }}>
              {stats.today}
            </b>{" "}
            <em
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                color: "var(--accent3)",
              }}
            >
              ziyaret
            </em>{" "}
            planlı,{" "}
            <b style={{ color: "var(--accent2)", fontWeight: 600 }}>
              {stats.pending}
            </b>{" "}
            <em
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                color: "var(--accent3)",
              }}
            >
              onay
            </em>{" "}
            seni bekliyor.
          </div>
        </div>

        {errorMsg && (
          <div
            className="fade-up"
            style={{
              marginBottom: "20px",
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.30)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "13px", color: "var(--red)" }}>
              <div style={{ fontWeight: 600 }}>Backend bağlantısı kurulamadı</div>
              <div
                style={{
                  fontSize: "11px",
                  opacity: 0.85,
                  marginTop: "2px",
                  color: "var(--muted)",
                  wordBreak: "break-all",
                }}
              >
                {errorMsg}
              </div>
            </div>
          </div>
        )}

        {/* 2. STAT satırı */}
        <div
          className="fade-up fade-up-1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          <div className="stat">
            <div className="l">Doluluk</div>
            <div className="v">
              {stats.utilizationPct}
              <small>%</small>
            </div>
          </div>
          <div className="stat hl">
            <div className="l">Bekleyen</div>
            <div className="v">{stats.pending}</div>
          </div>
          <div className="stat">
            <div className="l">Bu Hafta</div>
            <div className="v">{stats.thisWeek}</div>
          </div>
        </div>

        {/* 3. BEKLEYEN TALEP kartı (tek satır) */}
        {pendingFirst && (
          <div
            className="card fade-up fade-up-2"
            style={{ marginBottom: "18px" }}
          >
            <div className="card-accent" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <div className="card-h" style={{ margin: 0 }}>
                Bekleyen <em>{pendingCountWord}</em>
              </div>
              <button
                type="button"
                className="golink"
                onClick={() => router.push("/reservations")}
                aria-label="Rezervasyonlar sayfasına git"
              >
                Rezervasyonlar <span className="arr">→</span>
              </button>
            </div>
            <div
              className="req clk"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest(".btn")) return;
                setActiveId(pendingFirst.id);
              }}
            >
              <div className="av">{initials(pendingFirst.visitor?.name)}</div>
              <div>
                <div className="nm">{pendingFirst.visitor?.name ?? "—"}</div>
                <div className="mt">
                  {formatTrShortDate(pendingFirst.visitDate)} ·{" "}
                  {pendingFirst.startTime} · {pendingFirst.groupSize} kişi
                </div>
              </div>
              <div className="req-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busyAction !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    reject(pendingFirst.id);
                  }}
                >
                  {busyAction?.id === pendingFirst.id && busyAction?.kind === "reject"
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
                  {busyAction?.id === pendingFirst.id && busyAction?.kind === "approve"
                    ? "..."
                    : "Onayla"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. İKİ KOLON — Sol: mini takvim, Sağ: aksiyon + son rezervasyonlar */}
        <div
          className="overview-grid fade-up fade-up-3"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: "18px",
          }}
        >
          <OverviewCalendar
            onReservationClick={(id) => setActiveId(id)}
            onNavigateToFull={() => router.push("/calendar")}
          />

          <div
            style={{
              display: "grid",
              gap: "16px",
              alignContent: "start",
            }}
          >
            {/* Hızlı aksiyonlar */}
            <div className="card">
              <div className="card-accent" />
              <div className="qa">
                <button
                  type="button"
                  className="qa-btn"
                  onClick={() => router.push("/rezervasyon")}
                  style={{ background: "transparent", color: "var(--txt)" }}
                >
                  <div className="t">+ Rezervasyon</div>
                </button>
                <button
                  type="button"
                  className="qa-btn"
                  onClick={() => router.push("/calendar")}
                  style={{ background: "transparent", color: "var(--txt)" }}
                >
                  <div className="t">⊘ Gün kapat</div>
                </button>
              </div>
            </div>

            {/* Son rezervasyonlar */}
            <div className="card">
              <div className="card-accent" />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                  gap: "10px",
                }}
              >
                <div className="card-h" style={{ margin: 0 }}>
                  Son <em>rezervasyonlar</em>
                </div>
                <button
                  type="button"
                  className="golink"
                  onClick={() => router.push("/reservations")}
                  aria-label="Tüm rezervasyonlar"
                >
                  Tümü <span className="arr">→</span>
                </button>
              </div>
              {recent.length === 0 ? (
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--muted2)",
                    padding: "12px 0",
                    textAlign: "center",
                  }}
                >
                  Henüz rezervasyon yok.
                </div>
              ) : (
                recentGroups.map((g, gi) => (
                  <div
                    key={g.iso}
                    className="daygroup"
                    style={{
                      marginBottom: gi === recentGroups.length - 1 ? 0 : "14px",
                    }}
                  >
                    <div className="dh" style={{ marginBottom: "6px" }}>
                      <span className="big" style={{ fontSize: "13px" }}>
                        {g.date.getDate()} <em>{MONTHS[g.date.getMonth()]}</em>
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
                            padding: "9px 12px",
                            gap: "10px",
                            marginBottom: "4px",
                          }}
                        >
                          <div
                            className="tm"
                            style={{ width: "44px", fontSize: "13px" }}
                          >
                            {r.startTime}
                          </div>
                          <div className="nm" style={{ fontSize: "13px" }}>
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

      {/* Mobil: tek kolona iniş */}
      <style jsx>{`
        @media (max-width: 900px) {
          :global(.overview-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

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
