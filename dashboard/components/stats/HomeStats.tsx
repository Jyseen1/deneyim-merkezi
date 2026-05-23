"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import { PendingApprovalRow } from "@/components/PendingApprovalRow";
import { EMPTY_STATS, type StatsResult } from "./server-fetch";
import { useRealtime } from "@/hooks/useRealtime";
import { useBackendToken } from "@/hooks/useBackendToken";
import { EmptyState, CheckCircleIcon } from "@/components/EmptyState";

const POLL_MS_WHEN_OK = 30_000;
const POLL_MS_WHEN_DOWN = 4_000;

function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ClockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function TrendingIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  );
}
function PieIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15.5A9 9 0 1 1 8.5 3" />
      <path d="M21 12A9 9 0 0 0 12 3v9z" />
    </svg>
  );
}

type StatCardProps = {
  label: string;
  value: number | string;
  suffix?: string;
  trend?: string;
  icon: React.ReactNode;
  fadeClass: string;
  loading?: boolean;
  accent?: { numberColor: string; iconBg: string; iconColor: string };
};

function StatCard({
  label,
  value,
  suffix,
  trend,
  icon,
  fadeClass,
  loading,
  accent,
}: StatCardProps) {
  const numberColor = accent?.numberColor ?? "var(--gx-text)";
  const iconBg = accent?.iconBg ?? "rgba(124,58,237,0.18)";
  const iconColor = accent?.iconColor ?? "var(--gx-accent-light)";

  return (
    <div
      className={`glass glass-hover fade-up ${fadeClass}`}
      style={{
        padding: "20px",
        minHeight: "108px",
        maxHeight: "120px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top row: label left + icon right */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        {loading ? (
          <div
            className="shimmer"
            style={{ height: "11px", width: "70px", borderRadius: "4px" }}
          />
        ) : (
          <div
            style={{
              fontSize: "11px",
              color: "var(--gx-text-muted)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {label}
          </div>
        )}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: iconBg,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      {/* Bottom: big number + trend */}
      <div>
        {loading ? (
          <div
            className="shimmer"
            style={{ height: "32px", width: "55px", borderRadius: "8px" }}
          />
        ) : (
          <div
            className="font-display"
            style={{
              fontSize: "34px",
              fontWeight: 600,
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
        {trend && !loading && (
          <div
            style={{
              marginTop: "4px",
              fontSize: "10px",
              color: "var(--gx-text-hint)",
              fontWeight: 500,
            }}
          >
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyPendingState() {
  return (
    <EmptyState
      icon={<CheckCircleIcon />}
      tone="positive"
      title="Tüm onaylar tamam"
      description="Yeni rezervasyon geldiğinde burada görünür. Hemen aksiyon almak gerekirse haber vereceğiz."
    />
  );
}

export function HomeStats({
  initial,
  staffId,
  children,
}: {
  initial: StatsResult;
  staffId: string;
  children?: React.ReactNode;
}) {
  const token = useBackendToken();
  const tokenRef = useRef<string | undefined>(token);
  tokenRef.current = token;

  const [stats, setStats] = useState<DashboardStats>(
    initial.ok ? initial.stats : EMPTY_STATS,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(
    initial.ok ? null : initial.error,
  );
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasData = useRef(initial.ok);
  const errorRef = useRef(!initial.ok);
  errorRef.current = errorMsg !== null;

  async function load(opts: { manual?: boolean } = {}) {
    if (opts.manual) setRefreshing(true);
    if (!hasData.current) setLoading(true);
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
    } finally {
      if (opts.manual) setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      const delay = errorRef.current ? POLL_MS_WHEN_DOWN : POLL_MS_WHEN_OK;
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(
      tick,
      errorRef.current ? POLL_MS_WHEN_DOWN : POLL_MS_WHEN_OK,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // SSE: yeni veya guncellenen rezervasyon gelince statlari hemen tazele
  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  const showError = errorMsg !== null;
  const showShimmer = loading && !hasData.current;

  return (
    <>
      {showError && (
        <div
          className="fade-up"
          style={{
            marginTop: "20px",
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
          <div style={{ fontSize: "13px", color: "var(--gx-danger)" }}>
            <div style={{ fontWeight: 600 }}>Backend bağlantısı kurulamadı</div>
            <div style={{ fontSize: "11px", opacity: 0.85, marginTop: "2px", wordBreak: "break-all", color: "var(--gx-text-muted)" }}>
              {errorMsg}
            </div>
            <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "4px", color: "var(--gx-text-muted)" }}>
              Veriler 4 saniyede bir tekrar denenir. Backend ayağa kalkınca otomatik güncellenir.
            </div>
          </div>
          <button
            onClick={() => load({ manual: true })}
            disabled={refreshing}
            style={{
              flexShrink: 0,
              fontSize: "11px",
              fontWeight: 600,
              padding: "7px 14px",
              borderRadius: "99px",
              background: "var(--gx-surface)",
              border: "1px solid rgba(239,68,68,0.30)",
              color: "var(--gx-danger)",
              cursor: refreshing ? "not-allowed" : "pointer",
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing ? "..." : "Yeniden dene"}
          </button>
        </div>
      )}

      {/* 4 kompakt stat kart, md+ tek satirda */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[14px]">
        <StatCard
          label="Bugün"
          value={stats.today}
          icon={<CalendarIcon />}
          fadeClass="fade-up-1"
          loading={showShimmer}
          trend={stats.today === 0 ? "ziyaret yok" : `${stats.today} planlandı`}
        />
        <StatCard
          label="Bekleyen"
          value={stats.pending}
          icon={<ClockIcon />}
          fadeClass="fade-up-2"
          loading={showShimmer}
          accent={{
            numberColor: "var(--gx-accent-light)",
            iconBg: "rgba(124,58,237,0.20)",
            iconColor: "var(--gx-accent-light)",
          }}
          trend={stats.pending > 0 ? "aksiyon gerekli" : "tüm onaylar tamam"}
        />
        <StatCard
          label="Bu hafta"
          value={stats.thisWeek}
          icon={<TrendingIcon />}
          fadeClass="fade-up-3"
          loading={showShimmer}
          trend={`${stats.thisWeek} onaylı rezervasyon`}
        />
        <StatCard
          label="Doluluk Oranı"
          value={stats.utilizationPct}
          suffix="%"
          icon={<PieIcon />}
          fadeClass="fade-up-4"
          loading={showShimmer}
          trend="haftalık kapasite"
        />
      </div>

      {/* Page.tsx'ten gelen ek bolum (TodayTimeline vs.) */}
      {children}

      {/* Bekleyen onaylar */}
      <div
        className="glass fade-up fade-up-5"
        style={{ marginTop: "20px", overflow: "hidden" }}
      >
        <div
          style={{
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--gx-border)",
            borderLeft: "3px solid var(--gx-accent-light)",
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          }}
        >
          <h2
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--gx-text)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Bekleyen Onaylar
          </h2>
          <span className="status-pill status-pending">
            {stats.pending} adet
          </span>
        </div>
        {stats.pendingPreview.length === 0 ? (
          <EmptyPendingState />
        ) : (
          stats.pendingPreview.map((r) => (
            <PendingApprovalRow
              key={r.id}
              reservation={r}
              staffId={staffId}
              onMutated={() => load()}
            />
          ))
        )}
      </div>
    </>
  );
}
