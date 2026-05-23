"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/types";
import { BarChart } from "@/components/charts/BarChart";
import { Donut } from "@/components/charts/Donut";
import { EmptyState, ChartIcon, InboxIcon } from "@/components/EmptyState";
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
  const barData = stats?.weeklyDistribution.map((b) => b.count) ?? [];
  const barLabels = stats?.weeklyDistribution.map((b) => b.label) ?? [];
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
          marginBottom: "20px",
        }}
      >
        <div>
          <h1
            className="gradient-text"
            style={{
              fontSize: "26px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              margin: 0,
            }}
          >
            İstatistik
          </h1>
          <p style={{ fontSize: "13px", color: "var(--gx-text-muted)", margin: "4px 0 0" }}>
            Rezervasyon eğilimleri ve performans göstergeleri.
          </p>
        </div>

        <div
          style={{
            display: "inline-flex",
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(209,196,255,0.6)",
            borderRadius: "99px",
            padding: "4px",
            gap: "2px",
          }}
        >
          {(["week", "month", "3m"] as Period[]).map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  background: active ? "var(--gx-gradient)" : "transparent",
                  color: active ? "#ffffff" : "var(--gx-text-muted)",
                  boxShadow: active ? "0 2px 10px rgba(124,58,237,0.35)" : "none",
                  border: "none",
                  borderRadius: "99px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {PERIOD_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI satiri */}
      <div className="grid grid-cols-2 md:grid-cols-5" style={{ gap: "12px" }}>
        <KpiCard
          label="Toplam rezervasyon"
          value={kpi?.total ?? 0}
          fade="fade-up-1"
          loading={loadingStats}
        />
        <KpiCard
          label="Onay oranı"
          value={kpi?.approvalRate ?? 0}
          suffix="%"
          fade="fade-up-2"
          tone="success"
          loading={loadingStats}
        />
        <KpiCard
          label="Ort. yanıt süresi"
          value={kpi?.avgResponseMinutes ?? 0}
          suffix="dk"
          fade="fade-up-3"
          loading={loadingStats}
        />
        <KpiCard
          label="İptal oranı"
          value={kpi?.cancelRate ?? 0}
          suffix="%"
          fade="fade-up-4"
          tone="danger"
          loading={loadingStats}
        />
        <KpiCard
          label="Gelmeyen oranı"
          value={kpi?.noShowRate ?? 0}
          suffix="%"
          fade="fade-up-5"
          tone="warning"
          loading={loadingStats}
        />
      </div>

      {/* Orta — 2 kolon */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]"
        style={{ gap: "20px", marginTop: "20px" }}
      >
        <section className="glass fade-up fade-up-5" style={{ padding: "18px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
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
              {period === "week"
                ? "Haftalık Rezervasyon Dağılımı"
                : period === "month"
                ? "Aylık Hafta Dağılımı"
                : "Aylara Göre Dağılım"}
            </h2>
            <span style={{ fontSize: "11px", color: "var(--gx-text-hint)" }}>
              {PERIOD_LABEL[period]}
            </span>
          </div>
          {loadingStats ? (
            <div
              className="shimmer"
              style={{ height: "240px", borderRadius: "10px" }}
            />
          ) : barData.length > 0 ? (
            <BarChart data={barData} labels={barLabels} height={240} />
          ) : (
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
          )}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <section className="glass fade-up fade-up-5" style={{ padding: "18px 20px" }}>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--gx-text)",
                margin: 0,
                marginBottom: "16px",
                letterSpacing: "-0.01em",
              }}
            >
              Saat Dağılımı
            </h2>
            {loadingStats ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="shimmer" style={{ height: "14px", borderRadius: "6px" }} />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {hours.map((h) => (
                  <div
                    key={h.time}
                    style={{ display: "flex", alignItems: "center", gap: "12px" }}
                  >
                    <div
                      style={{
                        width: "44px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--gx-text)",
                        flexShrink: 0,
                      }}
                    >
                      {h.time}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        height: "8px",
                        background: "var(--gx-surface)",
                        borderRadius: "99px",
                        overflow: "hidden",
                        border: "1px solid var(--gx-border)",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(h.count / maxHour) * 100}%`,
                          background: "var(--gx-gradient)",
                          borderRadius: "99px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: "36px",
                        textAlign: "right",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--gx-accent-light)",
                        flexShrink: 0,
                      }}
                    >
                      {h.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass fade-up fade-up-5" style={{ padding: "18px 20px" }}>
            <h2
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--gx-text)",
                margin: 0,
                marginBottom: "12px",
                letterSpacing: "-0.01em",
              }}
            >
              Durum Dağılımı
            </h2>
            {loadingStats ? (
              <div
                className="shimmer"
                style={{ height: "160px", borderRadius: "10px" }}
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
                <Donut segments={statusSegments} size={140} thickness={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {statusSegments.map((s) => {
                    const total = statusSegments.reduce((acc, x) => acc + x.value, 0) || 1;
                    const pct = Math.round((s.value / total) * 100);
                    return (
                      <div
                        key={s.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "5px 0",
                        }}
                      >
                        <span
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "3px",
                            background: s.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            fontSize: "12px",
                            color: "var(--gx-text)",
                            fontWeight: 500,
                          }}
                        >
                          {s.label}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--gx-text-muted)", minWidth: "24px", textAlign: "right" }}>
                          {pct}%
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--gx-text)",
                            fontWeight: 600,
                            minWidth: "28px",
                            textAlign: "right",
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
          </section>
        </div>
      </div>

      {/* Son Rezervasyonlar */}
      <section
        className="glass fade-up fade-up-5"
        style={{ marginTop: "20px", overflow: "hidden" }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--gx-border)",
            borderLeft: "3px solid var(--gx-accent-light)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--gx-text)", margin: 0 }}>
            Son Rezervasyonlar
          </h2>
          <span style={{ fontSize: "11px", color: "var(--gx-text-hint)" }}>en son 10 kayıt</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="gx-table" style={{ minWidth: "600px" }}>
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
                  <td style={{ fontWeight: 600 }}>{r.visitor?.name ?? "-"}</td>
                  <td>{formatTrShortDate(r.visitDate)}</td>
                  <td>{r.startTime}</td>
                  <td>{r.groupSize}</td>
                  <td>
                    <span className={`status-pill ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  fade,
  tone,
  loading,
}: {
  label: string;
  value: number;
  suffix?: string;
  fade: string;
  tone?: "success" | "danger" | "warning";
  loading?: boolean;
}) {
  const numberColor =
    tone === "success"
      ? "var(--gx-success)"
      : tone === "danger"
      ? "var(--gx-danger)"
      : tone === "warning"
      ? "var(--gx-warning)"
      : "var(--gx-text)";
  return (
    <div
      className={`glass glass-hover fade-up ${fade}`}
      style={{
        padding: "20px",
        minHeight: "108px",
        maxHeight: "120px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "var(--gx-text-muted)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      {loading ? (
        <div
          className="shimmer"
          style={{ height: "32px", width: "55px", borderRadius: "8px" }}
        />
      ) : (
        <div
          style={{
            fontSize: "32px",
            fontWeight: 700,
            letterSpacing: "-1.5px",
            color: numberColor,
            lineHeight: 1,
          }}
        >
          {value}
          {suffix && (
            <span
              style={{
                fontSize: "16px",
                fontWeight: 500,
                marginLeft: "3px",
                color: "var(--gx-text-muted)",
                letterSpacing: 0,
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

// th/td helpers artik kullanilmiyor — gx-table sinifi tum tablo stillerini
// CSS'ten sagliyor. Geriye doniik uyumluluk icin tutuldu, ama dis cagri yok.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function th(): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--gx-text-muted)",
    textTransform: "uppercase",
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function td(color = "var(--gx-text)", weight: number = 400): React.CSSProperties {
  return {
    padding: "12px 16px",
    color,
    fontWeight: weight,
  };
}
