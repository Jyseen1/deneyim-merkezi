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
    // Token (backendToken) gelmeden hiç başlama — useSession ilk render'da
    // undefined döner, ardından session hidrate olunca tekrar tetiklenir.
    // Önceki sürüm boş dependency ile mount'ta çalışıyordu; loadRecent token
    // olmadan 401 alıp boş array bırakıyor, sonraki tick 30sn ileride kalıyordu.
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
    // İlk fetch'i hemen yap (artık token guaranteed) + polling'i başlat
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // loadStats/loadRecent intentionally listede yok — `tokenRef.current`
    // kullanırlar, token değişince useEffect zaten yeniden çalışıyor.
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

  // Sistem chip'leri — backend cevap verdiyse "Sistem çevrimiçi", errorMsg
  // varsa kırmızı/offline. Telegram bağlı bilgisi backend system.telegramConnected
  // alanından gelir; alan yoksa chip gösterilmez (uydurma sinyal vermeyiz).
  const systemOnline = errorMsg === null;
  const telegramConnected = stats.system?.telegramConnected;

  return (
    <>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        {/* 1. Karşılama — ASİMETRİK: sol blok hizalı + sağ üst status chip'leri */}
        <div
          className="welcome fade-up overview-hero"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "20px",
            padding: "14px 0 24px",
            textAlign: "left",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div
              className="date"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--accent2)",
                }}
              />
              <span style={{ letterSpacing: "0.18em" }}>
                {dateLong} · {dayName}
              </span>
            </div>
            <h1 style={{ fontSize: "46px", fontWeight: 300, margin: 0 }}>
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
              planlı ve{" "}
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

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "flex-end",
              flexShrink: 0,
            }}
          >
            <StatusChip
              dotColor={systemOnline ? "var(--green)" : "var(--red)"}
              pulse={systemOnline}
              label={
                systemOnline ? "Sistem çevrimiçi" : "Sistem çevrimdışı"
              }
            />
            {telegramConnected !== undefined && (
              <StatusChip
                dotColor={
                  telegramConnected ? "var(--accent2)" : "var(--muted3)"
                }
                label={
                  telegramConnected ? "Telegram bağlı" : "Telegram bağlı değil"
                }
              />
            )}
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

        {/* 2. STAT satırı — 4 kart, üst mor gradient çizgi (.card-accent),
            Bekleyen rakamı serif italik (vurgu). */}
        <div
          className="fade-up fade-up-1 overview-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
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

        {/* 3. BEKLEYEN TALEP — kompakt yatay bar (ince, tek satır).
            Avatar | başlık+isim+meta | inline Reddet/Onayla butonları. */}
        {pendingFirst && (
          <div
            className="fade-up fade-up-2 pending-bar"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              setActiveId(pendingFirst.id);
            }}
            role="button"
            style={{
              marginBottom: "18px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "12px 16px",
              borderRadius: "14px",
              background:
                "linear-gradient(135deg, rgba(167,139,250,0.10), rgba(124,58,237,0.04))",
              border: "1px solid rgba(167,139,250,0.22)",
              cursor: "pointer",
              transition: "border-color 150ms ease, background 150ms ease",
              flexWrap: "wrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(167,139,250,0.40)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(167,139,250,0.22)";
            }}
          >
            <div
              aria-hidden
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--accent), var(--accent2))",
                color: "#fff",
                fontWeight: 600,
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials(pendingFirst.visitor?.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--grotesk)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--txt)",
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: "5px",
                }}
              >
                Bekleyen
                <em
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    color: "var(--accent3)",
                    fontWeight: 400,
                  }}
                >
                  {pendingCountWord}
                </em>
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--muted)",
                  marginTop: "2px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <b style={{ color: "var(--txt)", fontWeight: 600 }}>
                  {pendingFirst.visitor?.name ?? "—"}
                </b>{" "}
                · {formatTrShortDate(pendingFirst.visitDate)} ·{" "}
                {pendingFirst.startTime} · {pendingFirst.groupSize} kişi
              </div>
            </div>
            <div
              style={{
                display: "inline-flex",
                gap: "8px",
                flexShrink: 0,
              }}
            >
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
          </div>
        )}

        {/* 4. İKİ KOLON — Sol: hafta ajandası, Sağ: aksiyon + son rezervasyonlar.
            alignItems:stretch → sol kart sağ kolonun yüksekliğine uzar; ajanda
            içindeki .agw-foot margin-top:auto ile alta yapışır → simetri.
            Hafta ajandasının "+N daha" mantığı taşmayı önler; bu sayede sol
            kart sağ panelden aşırı uzayamaz. */}
        <div
          className="overview-grid fade-up fade-up-3"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: "18px",
            alignItems: "stretch",
          }}
        >
          <OverviewCalendar
            onReservationClick={(id) => setActiveId(id)}
            onNavigateToFull={() => router.push("/calendar")}
            onAddReservation={() => router.push("/rezervasyon")}
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
                  Son
                  <em style={{ marginLeft: "6px" }}>rezervasyonlar</em>
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

      {/* Mobil: 900px altı iki kolonlu grid → tek kolon, statlar 2 kolon */}
      <style jsx>{`
        @media (max-width: 900px) {
          :global(.overview-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.overview-stats) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          :global(.overview-hero) {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          :global(.overview-hero) > div:last-child {
            align-items: flex-start !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
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

// Hero sağ üst durum chip'i. pulse=true ise dot etrafında yeşil halka animasyonu
// (.live-dot globals.css'te tanımlı, yeşil hardcoded — bu yüzden burada özel
// keyframe gerektiren chip için inline pulse rengi türetmiyoruz; sadece yeşil
// "Sistem çevrimiçi" için .live-dot kullanırız, diğerleri sabit dot).
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
        padding: "5px 12px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--line)",
        fontSize: "11px",
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
            width: "7px",
            height: "7px",
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
