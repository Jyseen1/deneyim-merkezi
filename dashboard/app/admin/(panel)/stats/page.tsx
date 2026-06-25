"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle, UserX, XCircle, Zap } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/types";
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { ReservationDrawer } from "@/components/ReservationDrawer";
import { TR_DAYS, toLocalIso } from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";

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

type Period = "week" | "month" | "3m";

const PERIOD_LABEL: Record<Period, string> = {
  week: "Bu Hafta",
  month: "Bu Ay",
  "3m": "Son 3 Ay",
};

type PeriodStats = {
  range: Period;
  kpi: {
    total: number;
    approvalRate: number;
    avgResponseMinutes: number;
    cancelRate: number;
    noShowRate: number;
  };
  weeklyDistribution: { label: string; count: number }[];
  hourDistribution: { time: string; count: number }[];
  statusDistribution: {
    approved: number;
    pending: number;
    rejected: number;
    cancelled: number;
    completed: number;
    noShow: number;
  };
};

// Donut renkleri — referans S2: mor paleti + amber + kırmızı
const STATUS_COLORS = {
  approved: "#7C3AED",   // koyu mor
  pending: "#8B5CF6",    // mor
  rejected: "#EF4444",   // kırmızı
  cancelled: "#A78BFA",  // açık mor
  noShow: "#F59E0B",     // amber
} as const;

export default function StatsPage() {
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const token = useBackendToken();
  const [period, setPeriod] = useState<Period>("month");
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [recent, setRecent] = useState<Reservation[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);

  function refreshRecent() {
    if (!token) return;
    apiFetch<ReservationList>("/reservations?limit=10&page=1", {}, token)
      .then((r) => setRecent(r.items))
      .catch(() => {});
  }

  // Donem istatistigi
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingStats(true);
    apiFetch<PeriodStats>(`/dashboard/stats/period?range=${period}`, {}, token)
      .then((r) => {
        if (!cancelled) setStats(r);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, period]);

  // Son 10 rezervasyon
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingRecent(true);
    apiFetch<ReservationList>("/reservations?limit=10&page=1", {}, token)
      .then((r) => {
        if (!cancelled) setRecent(r.items);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const kpi = stats?.kpi;
  const hours = stats?.hourDistribution ?? [];
  const maxHour = Math.max(...hours.map((h) => h.count), 1);

  const statusSegments = stats
    ? [
        { key: "approved", label: "Onaylı", value: stats.statusDistribution.approved, color: STATUS_COLORS.approved },
        { key: "pending", label: "Bekleyen", value: stats.statusDistribution.pending, color: STATUS_COLORS.pending },
        { key: "rejected", label: "Reddedilen", value: stats.statusDistribution.rejected, color: STATUS_COLORS.rejected },
        { key: "cancelled", label: "İptal", value: stats.statusDistribution.cancelled, color: STATUS_COLORS.cancelled },
        { key: "noShow", label: "Gelmedi", value: stats.statusDistribution.noShow, color: STATUS_COLORS.noShow },
      ]
    : [];
  const statusTotal = statusSegments.reduce((acc, x) => acc + x.value, 0);

  // Recent rezervasyonları tarihe göre grupla (Genel Bakış ile aynı mantık)
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
    <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
      {/* TOPBAR */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "22px",
        }}
      >
        <div>
          <h1
            className="font-display"
            style={{
              fontSize: "28px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--txt)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            İstatistik
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            Rezervasyon{" "}
            <span
              className="font-serif font-italic"
              style={{ color: "var(--accent3)" }}
            >
              eğilimleri
            </span>{" "}
            ve performans göstergeleri.
          </p>
        </div>

        {/* Zaman filtresi — referans .seg */}
        <div className="seg" role="tablist" aria-label="Zaman filtresi">
          {(["week", "month", "3m"] as Period[]).map((p) => (
            <b
              key={p}
              role="tab"
              aria-selected={period === p}
              className={period === p ? "on" : ""}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? "var(--accent)" : "transparent",
                color: period === p ? "#fff" : "var(--muted)",
              }}
            >
              {PERIOD_LABEL[p]}
            </b>
          ))}
        </div>
      </div>

      {/* HERO + MINI KPI satırı */}
      <div
        className="stats-hero fade-up fade-up-1"
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: "18px",
          marginBottom: "18px",
        }}
      >
        {/* Hero — büyük toplam rezervasyon */}
        <div
          className="card"
          style={{
            padding: "28px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: "180px",
          }}
        >
          <div className="card-accent" />
          {loadingStats ? (
            <div
              className="shimmer"
              style={{ height: "64px", width: "60%", borderRadius: "8px" }}
            />
          ) : (
            <>
              <div
                className="font-display"
                style={{
                  fontSize: "64px",
                  fontWeight: 300,
                  lineHeight: 1,
                  letterSpacing: "-2px",
                  color: "var(--txt)",
                }}
              >
                {kpi?.total ?? 0}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--muted2)",
                  marginTop: "8px",
                  fontWeight: 600,
                }}
              >
                toplam
                <em
                  className="font-serif font-italic"
                  style={{
                    marginLeft: "6px",
                    color: "var(--accent3)",
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 400,
                  }}
                >
                  rezervasyon
                </em>
              </div>
              <div
                style={{
                  marginTop: "18px",
                  fontSize: "13px",
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span style={{ color: "var(--accent3)" }}>·</span>
                {PERIOD_LABEL[period].toLowerCase()} aralığında
              </div>
            </>
          )}
        </div>

        {/* Mini KPI — 2×2 grid */}
        <div
          className="stats-mini"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
          }}
        >
          <MiniKpi
            dotColor="var(--green)"
            icon={<CheckCircle size={12} color="var(--green)" />}
            label="Onay Oranı"
            value={kpi?.approvalRate ?? 0}
            suffix="%"
            valueColor="var(--green)"
            loading={loadingStats}
          />
          <MiniKpi
            dotColor="var(--accent3)"
            icon={<Zap size={12} color="var(--accent3)" />}
            label="Ort. Yanıt"
            value={kpi?.avgResponseMinutes ?? 0}
            suffix="dk"
            loading={loadingStats}
          />
          <MiniKpi
            dotColor="var(--accent2)"
            icon={<XCircle size={12} color="var(--accent2)" />}
            label="İptal Oranı"
            value={kpi?.cancelRate ?? 0}
            suffix="%"
            loading={loadingStats}
          />
          <MiniKpi
            dotColor="var(--amber)"
            icon={<UserX size={12} color="var(--amber)" />}
            label="Gelmeme"
            value={kpi?.noShowRate ?? 0}
            suffix="%"
            valueColor={
              (kpi?.noShowRate ?? 0) > 0 ? "var(--amber)" : undefined
            }
            loading={loadingStats}
          />
        </div>
      </div>

      {/* DURUM DONUT + SAAT DAĞILIMI — iki kolon */}
      <div
        className="stats-row fade-up fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
          marginBottom: "18px",
        }}
      >
        {/* Durum Dağılımı */}
        <div className="card" style={{ padding: "22px" }}>
          <div className="card-accent" />
          <div className="card-h">
            Durum
            <em style={{ marginLeft: "6px" }}>dağılımı</em>
          </div>
          {loadingStats ? (
            <div
              className="shimmer"
              style={{ height: "180px", borderRadius: "10px" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "28px",
                flexWrap: "wrap",
              }}
            >
              <DonutSvg
                segments={statusSegments.filter((s) => s.value > 0)}
                total={statusTotal}
              />
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "11px",
                  minWidth: 0,
                }}
              >
                {statusSegments.map((s) => {
                  const pct = statusTotal
                    ? Math.round((s.value / statusTotal) * 100)
                    : 0;
                  return (
                    <div
                      key={s.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "13px",
                      }}
                    >
                      <span
                        style={{
                          width: "9px",
                          height: "9px",
                          borderRadius: "3px",
                          background: s.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          color: "var(--txt)",
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.label}
                      </span>
                      <span
                        style={{
                          color: "var(--muted)",
                          fontSize: "12px",
                          width: "40px",
                          textAlign: "right",
                        }}
                      >
                        {pct}%
                      </span>
                      <span
                        className="font-display"
                        style={{
                          fontWeight: 500,
                          width: "24px",
                          textAlign: "right",
                          color: "var(--txt)",
                        }}
                      >
                        {s.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Saat Dağılımı */}
        <div className="card" style={{ padding: "22px" }}>
          <div className="card-accent" />
          <div className="card-h">
            Saat
            <em style={{ marginLeft: "6px" }}>dağılımı</em>
          </div>
          {loadingStats ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="shimmer"
                  style={{ height: "14px", borderRadius: "6px" }}
                />
              ))}
            </div>
          ) : hours.length === 0 ? (
            <div
              style={{
                padding: "20px 0",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: "13px",
              }}
            >
              Veri yok.
            </div>
          ) : (
            <div>
              {hours.map((h) => {
                const widthPct = (h.count / maxHour) * 100;
                return (
                  <div
                    key={h.time}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "11px",
                    }}
                  >
                    <span
                      className="font-display"
                      style={{
                        fontSize: "12px",
                        color: "var(--muted2)",
                        width: "44px",
                      }}
                    >
                      {h.time}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "8px",
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${widthPct}%`,
                          background:
                            "linear-gradient(90deg, var(--accent), var(--accent3))",
                          borderRadius: "4px",
                          transition: "width 600ms ease",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        width: "20px",
                        textAlign: "right",
                      }}
                    >
                      {h.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SON REZERVASYONLAR — tarih gruplu */}
      <div className="card fade-up fade-up-3" style={{ padding: "22px" }}>
        <div className="card-accent" />
        <div className="card-h">
          <span>
            Son
            <em style={{ marginLeft: "6px" }}>rezervasyonlar</em>
          </span>
          <span className="meta">en son kayıtlar</span>
        </div>
        {loadingRecent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shimmer"
                style={{ height: "48px", borderRadius: "10px" }}
              />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            compact
            icon={<InboxIcon size={28} />}
            title="Henüz rezervasyon yok"
            description="İlk rezervasyon geldiğinde burada özet olarak listelenir."
          />
        ) : (
          recentGroups.map((g, gi) => (
            <div
              key={g.iso}
              className="daygroup"
              style={{
                marginBottom: gi === recentGroups.length - 1 ? 0 : "14px",
              }}
            >
              <div className="dh">
                {g.date.getDate()}{" "}
                <em>{MONTHS[g.date.getMonth()]}</em>{" "}
                <span className="c">
                  · {TR_DAYS[g.date.getDay()]}
                  {g.items.length > 1 ? ` · ${g.items.length} kayıt` : ""}
                </span>
              </div>
              {g.items.map((r) => {
                const isPending = r.status === "PENDING_APPROVAL";
                return (
                  <div
                    key={r.id}
                    className={`rmini${isPending ? " pend" : ""}`}
                    onClick={() => setActiveId(r.id)}
                    role="button"
                  >
                    <div className="tm">{r.startTime}</div>
                    <div className="nm">{r.visitor?.name ?? "—"}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--muted3)",
                        width: "60px",
                        flexShrink: 0,
                      }}
                    >
                      {r.groupSize} kişi
                    </div>
                    <span className={pillClass(r.status)}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <ReservationDrawer
        reservationId={activeId}
        staffId={staffId}
        onClose={() => setActiveId(null)}
        onMutated={refreshRecent}
      />

      {/* Mobile responsive: tek kolon */}
      <style jsx>{`
        @media (max-width: 900px) {
          :global(.stats-hero) {
            grid-template-columns: 1fr !important;
          }
          :global(.stats-row) {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 560px) {
          :global(.stats-mini) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Mini KPI kart (Hero sağındaki 2×2 grid hücreleri)
// ─────────────────────────────────────────────────────────

function MiniKpi({
  dotColor,
  icon,
  label,
  value,
  suffix,
  valueColor,
  loading,
}: {
  dotColor: string;
  icon?: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  valueColor?: string;
  loading?: boolean;
}) {
  return (
    <div className="card" style={{ padding: "18px 20px", position: "relative" }}>
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "var(--muted2)",
          marginBottom: "8px",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          fontWeight: 600,
        }}
      >
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
        {label}
        {icon && (
          <span
            style={{
              marginLeft: "auto",
              opacity: 0.6,
              display: "inline-flex",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div
          className="shimmer"
          style={{ height: "26px", width: "55%", borderRadius: "6px" }}
        />
      ) : (
        <div
          className="font-display"
          style={{
            fontSize: "26px",
            fontWeight: 300,
            color: valueColor ?? "var(--txt)",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "baseline",
            gap: "2px",
          }}
        >
          {value}
          {suffix && (
            <small
              style={{
                fontSize: "13px",
                color: "var(--muted2)",
                fontWeight: 500,
              }}
            >
              {suffix}
            </small>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Donut SVG — referans S2: rotate -90, stroke-dasharray ile segmentler
// ─────────────────────────────────────────────────────────

function DonutSvg({
  segments,
  total,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  total: number;
}) {
  const size = 140;
  const stroke = 16;
  const r = (size - stroke) / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // Segmentleri sırayla render et — dashoffset birikir
  let acc = 0;
  const arcs = segments.map((s) => {
    const len = total > 0 ? (s.value / total) * circumference : 0;
    const dashArray = `${len} ${circumference - len}`;
    const dashOffset = -acc;
    acc += len;
    return { ...s, dashArray, dashOffset };
  });

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={stroke}
        />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray={a.dashArray}
            strokeDashoffset={a.dashOffset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          className="font-display"
          style={{
            fontSize: "34px",
            fontWeight: 300,
            lineHeight: 1,
            color: "var(--txt)",
          }}
        >
          {total}
        </div>
        <div
          className="font-serif font-italic"
          style={{
            fontSize: "11px",
            color: "var(--accent3)",
            marginTop: "2px",
          }}
        >
          toplam
        </div>
      </div>
    </div>
  );
}
