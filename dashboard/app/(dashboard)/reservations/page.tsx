"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  STATUS_LABEL,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/types";
import { ReservationDrawer } from "@/components/ReservationDrawer";
import { formatTrShortDate } from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";

type StatusFilter = "ALL" | ReservationStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Tümü" },
  { value: "PENDING_APPROVAL", label: "Bekleyen" },
  { value: "APPROVED", label: "Onaylı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal" },
];

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "status-pending",
  APPROVED: "status-approved",
  REJECTED: "status-rejected",
  CANCELLED: "status-cancelled",
  COMPLETED: "status-completed",
};

const PAGE_SIZE = 20;

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(237,233,254,0.9)",
  color: "#1e1b4b",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

export default function ReservationsPage() {
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const token = useBackendToken();

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReservationList | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (status !== "ALL") sp.set("status", status);
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    sp.set("page", String(page));
    sp.set("limit", String(PAGE_SIZE));
    return sp.toString();
  }, [status, dateFrom, dateTo, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<ReservationList>(
        `/reservations?${query}`,
        {},
        token,
      );
      setData(res);
    } catch (e) {
      setErr(
        e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message,
      );
    } finally {
      setLoading(false);
    }
  }, [query, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, dateFrom, dateTo]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div className="fade-up">
        <h1
          className="gradient-text"
          style={{
            fontSize: "28px",
            fontWeight: 700,
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Rezervasyonlar
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "#818cf8",
            margin: "4px 0 0",
          }}
        >
          Tüm rezervasyonları filtreleyin ve detaylarını açın.
        </p>
      </div>

      {/* Filters */}
      <div
        className="glass fade-up fade-up-1"
        style={{
          marginTop: "24px",
          padding: "16px 18px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "14px",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "10px",
              fontWeight: 600,
              color: "#818cf8",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Durum
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            style={inputStyle}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "10px",
              fontWeight: 600,
              color: "#818cf8",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Başlangıç
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "10px",
              fontWeight: 600,
              color: "#818cf8",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Bitiş
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-primary"
          style={{ marginLeft: "auto" }}
        >
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
      </div>

      {err && (
        <div
          className="fade-up"
          style={{
            marginTop: "14px",
            padding: "10px 14px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: "12px",
            fontSize: "13px",
          }}
        >
          {err}
        </div>
      )}

      {/* Table */}
      <div
        className="glass fade-up fade-up-2"
        style={{ marginTop: "16px", overflow: "hidden" }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              fontSize: "13px",
              borderCollapse: "collapse",
              minWidth: "600px",
            }}
          >
            <thead>
              <tr style={{ background: "rgba(245,243,255,0.8)" }}>
                <th style={th()}>Ad</th>
                <th style={{ ...th(), display: "table-cell" }} className="hidden md:table-cell">
                  Telefon
                </th>
                <th style={th()}>Tarih / Saat</th>
                <th style={th()} className="hidden sm:table-cell">
                  Kişi
                </th>
                <th style={th()}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "#a5b4fc",
                    }}
                  >
                    Sonuç yok.
                  </td>
                </tr>
              )}
              {data?.items.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setActiveId(r.id)}
                  style={{
                    borderTop: "1px solid rgba(237,233,254,0.6)",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "rgba(245,243,255,0.6)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td style={td("#1e1b4b", 500)}>
                    {r.visitor?.name ?? "-"}
                  </td>
                  <td
                    style={td("#818cf8")}
                    className="hidden md:table-cell"
                  >
                    {r.visitor?.phone ?? "-"}
                  </td>
                  <td style={td("#1e1b4b")}>
                    {formatTrShortDate(r.visitDate)} · {r.startTime}
                  </td>
                  <td
                    style={td("#1e1b4b")}
                    className="hidden sm:table-cell"
                  >
                    {r.groupSize}
                  </td>
                  <td style={td()}>
                    <span className={`status-pill ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div
        className="fade-up fade-up-3"
        style={{
          marginTop: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "13px",
        }}
      >
        <div style={{ color: "#818cf8" }}>
          {data ? `Toplam ${data.total} kayıt` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={pagerBtnStyle(page <= 1 || loading)}
          >
            Önceki
          </button>
          <span style={{ fontSize: "11px", color: "#818cf8" }}>
            Sayfa {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={pagerBtnStyle(page >= totalPages || loading)}
          >
            Sonraki
          </button>
        </div>
      </div>

      <ReservationDrawer
        reservationId={activeId}
        staffId={staffId}
        onClose={() => setActiveId(null)}
        onMutated={load}
      />
    </div>
  );
}

function th(): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#818cf8",
    textTransform: "uppercase",
  };
}

function td(color = "#1e1b4b", weight: number = 400): React.CSSProperties {
  return {
    padding: "12px 16px",
    color,
    fontWeight: weight,
  };
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: "99px",
    background: "rgba(255,255,255,0.7)",
    border: "1px solid #ede9fe",
    color: "#1e1b4b",
    fontSize: "12px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.15s ease",
  };
}
