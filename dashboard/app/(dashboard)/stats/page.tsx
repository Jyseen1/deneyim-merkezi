"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calendar,
  CheckCircle,
  UserX,
  XCircle,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/types";
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { formatTrShortDate } from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "status-pending",
  APPROVED: "status-approved",
  REJECTED: "status-rejected",
  CANCELLED: "status-cancelled",
  COMPLETED: "status-completed",
  NO_SHOW: "status-noshow",
};

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

export default function StatsPage() {
  const token = useBackendToken();
  const [period, setPeriod] = useState<Period>("month");
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [recent, setRecent] = useState<Reservation[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

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
  const barData =
    stats?.weeklyDistribution.map((b) => ({
      label: b.label,
      count: b.count,
    })) ?? [];
  const hours = stats?.hourDistribution ?? [];
  const maxHour = Math.max(...hours.map((h) => h.count), 1);

  const statusSegments = stats
    ? [
        { label: "Onaylı", value: stats.statusDistribution.approved, color: "#4ADE80" },
        { label: "Bekleyen", value: stats.statusDistribution.pending, color: "#8B5CF6" },
        { label: "Reddedilen", value: stats.statusDistribution.rejected, color: "#EF4444" },
        { label: "İptal", value: stats.statusDistribution.cancelled, color: "#A1A1AA" },
        { label: "Gelmedi", value: stats.statusDistribution.noShow, color: "#FBBF24" },
      ]
    : [];
  const statusTotal = statusSegments.reduce((acc, x) => acc + x.value, 0);

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
      {/* Header */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1
            className="font-display"
            style={{
              fontSize: "32px",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--gx-text)",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            İstatistik
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--gx-text-muted)",
              margin: "8px 0 0",
              lineHeight: 1.5,
            }}
          >
            Rezervasyon{" "}
            <span
              className="font-serif font-italic"
              style={{ color: "var(--gx-accent-light)" }}
            >
              eğilimleri
            </span>{" "}
            ve performans göstergeleri.
          </p>
        </div>

        {/* 2G — Zaman filtre butonlari */}
        <div style={{ display: "inline-flex", gap: "6px" }}>
          {(["week", "month", "3m"] as Period[]).map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "7px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-inter), system-ui",
                  cursor: "pointer",
                  transition: "all 150ms ease",
                  border: active
                    ? "1px solid rgba(124,58,237,0.5)"
                    : "1px solid rgba(255,255,255,0.06)",
                  background: active
                    ? "rgba(124,58,237,0.20)"
                    : "transparent",
                  color: active ? "#A78BFA" : "#52525B",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {PERIOD_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2B — KPI kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-5" style={{ gap: "12px" }}>
        <KpiCard
          label="Toplam Rezervasyon"
          value={kpi?.total ?? 0}
          icon={<Calendar size={16} color="rgba(124,58,237,0.6)" />}
          fade="fade-up-1"
          tone="default"
          loading={loadingStats}
        />
        <KpiCard
          label="Onay Oranı"
          value={kpi?.approvalRate ?? 0}
          suffix="%"
          icon={<CheckCircle size={16} color="rgba(124,58,237,0.6)" />}
          fade="fade-up-2"
          tone={(kpi?.approvalRate ?? 0) > 0 ? "success" : "default"}
          loading={loadingStats}
        />
        <KpiCard
          label="Ort. Yanıt Süresi"
          value={kpi?.avgResponseMinutes ?? 0}
          suffix="dk"
          icon={<Zap size={16} color="rgba(124,58,237,0.6)" />}
          fade="fade-up-3"
          tone="default"
          loading={loadingStats}
        />
        <KpiCard
          label="İptal Oranı"
          value={kpi?.cancelRate ?? 0}
          suffix="%"
          icon={<XCircle size={16} color="rgba(124,58,237,0.6)" />}
          fade="fade-up-4"
          tone={(kpi?.cancelRate ?? 0) > 0 ? "danger" : "muted"}
          loading={loadingStats}
        />
        <KpiCard
          label="Gelmeme Oranı"
          value={kpi?.noShowRate ?? 0}
          suffix="%"
          icon={<UserX size={16} color="rgba(124,58,237,0.6)" />}
          fade="fade-up-5"
          tone={(kpi?.noShowRate ?? 0) > 0 ? "warning" : "muted"}
          loading={loadingStats}
        />
      </div>

      {/* Orta — Haftalik trend (sol) + Saat dagilimi (sag) */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]"
        style={{ gap: "20px", marginTop: "20px" }}
      >
        {/* 2C — Haftalik trend */}
        <PanelCard fade="fade-up-5">
          <PanelHeader
            title={
              period === "week"
                ? "Haftalık Dağılım"
                : period === "month"
                  ? "Aylık Dağılım"
                  : "3 Aylık Dağılım"
            }
            right={PERIOD_LABEL[period]}
          />
          {loadingStats ? (
            <div
              className="shimmer"
              style={{ height: "240px", borderRadius: "10px" }}
            />
          ) : barData.length === 0 ? (
            <div
              style={{
                height: "240px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gx-text-hint)",
                fontSize: "13px",
              }}
            >
              Veri yok.
            </div>
          ) : (
            <div style={{ width: "100%", height: "240px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <RBarChart
                  data={barData}
                  margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{
                      fill: "#52525B",
                      fontSize: 11,
                      fontFamily: "var(--font-inter), system-ui",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fill: "#52525B",
                      fontSize: 11,
                      fontFamily: "var(--font-inter), system-ui",
                    }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(124,58,237,0.06)" }}
                    contentStyle={{
                      background: "rgba(10,10,15,0.95)",
                      border: "1px solid rgba(124,58,237,0.3)",
                      borderRadius: "10px",
                      backdropFilter: "blur(20px)",
                      fontFamily: "var(--font-display), system-ui",
                    }}
                    labelStyle={{ color: "#A78BFA", fontSize: 12 }}
                    itemStyle={{
                      color: "#E4E4E7",
                      fontSize: 14,
                      fontWeight: 300,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="url(#barGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </RBarChart>
              </ResponsiveContainer>
            </div>
          )}
        </PanelCard>

        {/* 2D — Saat dagilimi (custom div, recharts degil) */}
        <PanelCard fade="fade-up-5">
          <PanelHeader title="Saat Dağılımı" />
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
                height: "160px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gx-text-hint)",
                fontSize: "13px",
              }}
            >
              Veri yok.
            </div>
          ) : (
            <div>
              {hours.map((h) => {
                const widthPct = (h.count / maxHour) * 100;
                const hasCount = h.count > 0;
                return (
                  <div
                    key={h.time}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "10px",
                    }}
                  >
                    <span
                      style={{
                        width: "40px",
                        fontSize: "12px",
                        color: "#52525B",
                        fontFamily: "var(--font-display), system-ui",
                        flexShrink: 0,
                      }}
                    >
                      {h.time}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "6px",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${widthPct}%`,
                          background:
                            "linear-gradient(90deg, #7C3AED, #A78BFA)",
                          borderRadius: "3px",
                          transition: "width 600ms ease",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: "20px",
                        fontSize: "13px",
                        fontWeight: 300,
                        color: hasCount ? "#A78BFA" : "#3F3F46",
                        fontFamily: "var(--font-display), system-ui",
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {h.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>
      </div>

      {/* Alt — Donut (sol) + Son rezervasyonlar (sag) */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[2fr_3fr]"
        style={{ gap: "20px", marginTop: "20px" }}
      >
        {/* 2E — Durum dagilimi donut */}
        <PanelCard fade="fade-up-5">
          <PanelHeader title="Durum Dağılımı" />
          {loadingStats ? (
            <div
              className="shimmer"
              style={{ height: "200px", borderRadius: "10px" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 160,
                  height: 160,
                  flexShrink: 0,
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusSegments.filter((s) => s.value > 0)}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statusSegments
                        .filter((s) => s.value > 0)
                        .map((s) => (
                          <Cell key={s.label} fill={s.color} />
                        ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
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
                      fontSize: "28px",
                      fontWeight: 300,
                      color: "#FFFFFF",
                      lineHeight: 1,
                    }}
                  >
                    {statusTotal}
                  </div>
                  <div
                    className="font-serif font-italic"
                    style={{
                      fontSize: "11px",
                      color: "#8B5CF6",
                      marginTop: "4px",
                    }}
                  >
                    toplam
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {statusSegments.map((s) => {
                  const pct = statusTotal
                    ? Math.round((s.value / statusTotal) * 100)
                    : 0;
                  return (
                    <div
                      key={s.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: s.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "13px",
                          color: "#D4D4D8",
                          fontFamily: "var(--font-inter), system-ui",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.label}
                      </span>
                      <span
                        style={{
                          width: "36px",
                          textAlign: "right",
                          fontSize: "12px",
                          color: "#52525B",
                          fontFamily: "var(--font-display), system-ui",
                        }}
                      >
                        {pct}%
                      </span>
                      <span
                        style={{
                          width: "20px",
                          textAlign: "right",
                          fontSize: "13px",
                          fontWeight: 300,
                          color: "#FFFFFF",
                          fontFamily: "var(--font-display), system-ui",
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
        </PanelCard>

        {/* 2F — Son rezervasyonlar */}
        <PanelCard fade="fade-up-5" noPadding>
          <div
            style={{
              padding: "20px 22px 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "16px",
            }}
          >
            <h2
              className="font-display"
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#E4E4E7",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Son{" "}
              <span
                className="font-serif font-italic"
                style={{
                  color: "#8B5CF6",
                  fontWeight: 400,
                  letterSpacing: "0",
                }}
              >
                rezervasyonlar
              </span>
            </h2>
            <span
              style={{
                fontSize: "11px",
                color: "#3F3F46",
                fontFamily: "var(--font-inter), system-ui",
              }}
            >
              en son 10 kayıt
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="gx-table" style={{ minWidth: "520px" }}>
              <thead>
                <tr>
                  <th>Ziyaretçi</th>
                  <th>Tarih</th>
                  <th>Saat</th>
                  <th>Kişi</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {loadingRecent &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      {Array.from({ length: 5 }).map((_, c) => (
                        <td key={c}>
                          <div
                            className="shimmer"
                            style={{
                              height: "12px",
                              width: `${60 + ((i + c) % 3) * 20}%`,
                              borderRadius: "4px",
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loadingRecent && recent.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <EmptyState
                        compact
                        icon={<InboxIcon size={28} />}
                        title="Henüz rezervasyon yok"
                        description="İlk rezervasyon geldiğinde burada özet olarak listelenir."
                      />
                    </td>
                  </tr>
                )}
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {r.visitor?.name ?? "-"}
                    </td>
                    <td>{formatTrShortDate(r.visitDate)}</td>
                    <td>{r.startTime}</td>
                    <td>{r.groupSize}</td>
                    <td>
                      <span
                        className={`status-pill ${STATUS_CLASS[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Panel kart + baslik wrapper
// ─────────────────────────────────────────────────────────

function PanelCard({
  children,
  fade,
  noPadding,
}: {
  children: React.ReactNode;
  fade: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={`fade-up ${fade}`}
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        padding: noPadding ? 0 : "20px 22px",
        overflow: "hidden",
      }}
    >
      {children}
    </section>
  );
}

function PanelHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "14px",
      }}
    >
      <h2
        className="font-display"
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#E4E4E7",
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      {right && (
        <span
          style={{
            fontSize: "11px",
            color: "#52525B",
            fontFamily: "var(--font-inter), system-ui",
          }}
        >
          {right}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// KPI Kart
// ─────────────────────────────────────────────────────────

type Tone = "default" | "success" | "danger" | "warning" | "muted";

function KpiCard({
  label,
  value,
  suffix,
  icon,
  fade,
  tone,
  loading,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  fade: string;
  tone: Tone;
  loading?: boolean;
}) {
  const numberColor =
    tone === "success"
      ? "#10B981"
      : tone === "danger"
        ? "#EF4444"
        : tone === "warning"
          ? "#F59E0B"
          : tone === "muted"
            ? "#52525B"
            : "#FFFFFF";

  return (
    <div
      className={`fade-up ${fade}`}
      style={{
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "20px 24px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        minHeight: "112px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Ust accent cizgisi */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "20%",
          right: "20%",
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)",
        }}
      />

      <div
        style={{
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {icon}
      </div>

      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.10em",
          color: "#52525B",
          fontFamily: "var(--font-inter), system-ui",
          textTransform: "uppercase",
          marginBottom: "6px",
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      {loading ? (
        <div
          className="shimmer"
          style={{ height: "30px", width: "60%", borderRadius: "6px" }}
        />
      ) : (
        <div
          className="font-display"
          style={{
            fontSize: "36px",
            fontWeight: 300,
            color: numberColor,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "baseline",
          }}
        >
          {value}
          {suffix && (
            <span
              style={{
                fontSize: "14px",
                color: "#52525B",
                marginLeft: "3px",
                fontFamily: "var(--font-inter), system-ui",
                fontWeight: 500,
              }}
            >
              {suffix}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
