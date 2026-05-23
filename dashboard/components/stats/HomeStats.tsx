"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import { PendingApprovalRow } from "@/components/PendingApprovalRow";
import { EMPTY_STATS, type StatsResult } from "./server-fetch";
import { useRealtime } from "@/hooks/useRealtime";
import { useBackendToken } from "@/hooks/useBackendToken";
import { EmptyState, CheckCircleIcon } from "@/components/EmptyState";
import { TodayVisitsStrip } from "@/components/TodayVisitsStrip";

const POLL_MS_WHEN_OK = 30_000;
const POLL_MS_WHEN_DOWN = 4_000;

// ─────────────────────────────────────────────────────────
// 3 metrik kartı — ince büyük rakam (font-weight 300) + serif birim
// ─────────────────────────────────────────────────────────

type MetricProps = {
  label: string;
  value: number;
  unit?: string;
  accent?: "default" | "purple";
  fadeClass: string;
  loading?: boolean;
};

function MetricCard({
  label,
  value,
  unit,
  accent = "default",
  fadeClass,
  loading,
}: MetricProps) {
  // Vurgulu kart (örn Bekleyen) daha güçlü mor cam.
  const isAccent = accent === "purple";
  const cardStyle: React.CSSProperties = {
    background: isAccent
      ? "linear-gradient(135deg, rgba(124,58,237,0.16), rgba(255,255,255,0.02))"
      : "rgba(255,255,255,0.03)",
    border: isAccent
      ? "1px solid rgba(124,58,237,0.28)"
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "18px",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    padding: "22px 16px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    minHeight: "118px",
    justifyContent: "center",
  };

  return (
    <div className={`fade-up ${fadeClass}`} style={cardStyle}>
      <div
        style={{
          fontSize: "10px",
          color: "var(--gx-text-hint)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {loading ? (
        <div
          className="shimmer"
          style={{ height: "32px", width: "60%", borderRadius: "6px" }}
        />
      ) : (
        <div
          className="font-display"
          style={{
            fontSize: "40px",
            fontWeight: 300, // INCE
            letterSpacing: "-1.5px",
            color: "var(--gx-text)",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "baseline",
            gap: "4px",
          }}
        >
          <span>{value}</span>
          {unit && (
            <span
              className="font-serif font-italic"
              style={{
                fontSize: "20px",
                fontWeight: 400,
                color: isAccent
                  ? "var(--gx-accent-light)"
                  : "var(--gx-text-muted)",
                letterSpacing: 0,
              }}
            >
              {unit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// HomeStats — 3 metrik (max 560px ortali) + bekleyen onaylar kartı
// ─────────────────────────────────────────────────────────

export function HomeStats({
  initial,
  staffId,
}: {
  initial: StatsResult;
  staffId: string;
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

  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  const showError = errorMsg !== null;
  const showShimmer = loading && !hasData.current;

  // Türkçe ozetler için isim
  const pendingCountWord =
    stats.pending === 1 ? "bir talep" : `${stats.pending} talep`;

  return (
    <>
      {showError && (
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
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--gx-danger)" }}>
            <div style={{ fontWeight: 600 }}>Backend bağlantısı kurulamadı</div>
            <div
              style={{
                fontSize: "11px",
                opacity: 0.85,
                marginTop: "2px",
                wordBreak: "break-all",
                color: "var(--gx-text-muted)",
              }}
            >
              {errorMsg}
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
              borderRadius: "10px",
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

      {/* 3 metrik — ortali */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        <MetricCard
          label="Doluluk"
          value={stats.utilizationPct}
          unit="%"
          fadeClass="fade-up-3"
          loading={showShimmer}
        />
        <MetricCard
          label="Bekleyen"
          value={stats.pending}
          accent="purple"
          fadeClass="fade-up-4"
          loading={showShimmer}
        />
        <MetricCard
          label="Bu hafta"
          value={stats.thisWeek}
          fadeClass="fade-up-5"
          loading={showShimmer}
        />
      </div>

      {/* Bekleyen onaylar — ortali cam kart */}
      <div
        className="fade-up fade-up-5"
        style={{
          marginTop: "20px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          overflow: "hidden",
          textAlign: "left",
        }}
      >
        <div
          style={{
            padding: "16px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2
            className="font-display"
            style={{
              fontSize: "16px",
              fontWeight: 500,
              color: "var(--gx-text)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Bekleyen{" "}
            <span
              className="font-serif font-italic"
              style={{
                fontWeight: 400,
                color: "var(--gx-accent-light)",
                letterSpacing: 0,
              }}
            >
              {pendingCountWord}
            </span>
          </h2>
          {stats.pending > 0 && (
            <span className="status-pill status-pending">
              aksiyon bekliyor
            </span>
          )}
        </div>
        {stats.pendingPreview.length === 0 ? (
          <EmptyState
            icon={<CheckCircleIcon />}
            tone="positive"
            title="Tüm onaylar tamam"
            description="Yeni rezervasyon geldiğinde burada anında görünür."
          />
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

      {/* Bugunun ziyaret seridi — sadece bugun planli ziyaret varsa cikar */}
      <TodayVisitsStrip />
    </>
  );
}
