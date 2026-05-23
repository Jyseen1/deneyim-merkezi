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
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { DatePicker } from "@/components/ui/DatePicker";
import { GXSelect } from "@/components/ui/GXSelect";
import { formatTrShortDate } from "@/lib/date";
import { useRealtime } from "@/hooks/useRealtime";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useToast } from "@/hooks/useToast";

type StatusFilter = "ALL" | ReservationStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Tümü" },
  { value: "PENDING_APPROVAL", label: "Bekleyen" },
  { value: "APPROVED", label: "Onaylı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal" },
  { value: "NO_SHOW", label: "Gelmedi" },
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

const PAGE_SIZE = 20;
const HIDE_PAST_KEY = "dm.hidePastReservations";

function readHidePast(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(HIDE_PAST_KEY);
    if (raw === null) return true; // varsayilan: gizli
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function writeHidePast(v: boolean) {
  try {
    window.localStorage.setItem(HIDE_PAST_KEY, v ? "1" : "0");
  } catch {
    /* sessiz */
  }
}

function backendBase(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
}

export default function ReservationsPage() {
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const token = useBackendToken();
  const { show } = useToast();
  const [exporting, setExporting] = useState(false);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  // localStorage hydrate: SSR'da false dondurmemek icin ilk render true
  // (varsayilan) ile baslar, useEffect ile gercek deger okunur.
  const [hidePast, setHidePastState] = useState<boolean>(true);
  useEffect(() => {
    setHidePastState(readHidePast());
  }, []);
  function setHidePast(v: boolean) {
    setHidePastState(v);
    writeHidePast(v);
  }

  const [data, setData] = useState<ReservationList | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function exportCSV() {
    if (!token) return;
    setExporting(true);
    try {
      const sp = new URLSearchParams();
      if (status !== "ALL") sp.set("status", status);
      if (dateFrom) sp.set("date_from", dateFrom);
      if (dateTo) sp.set("date_to", dateTo);
      const url = `${backendBase()}/api/v1/reservations/export?${sp.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="?([^";]+)"?/.exec(cd);
      a.download =
        m?.[1] ?? `reservations_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
      show("CSV indirildi", "success");
    } catch (e) {
      show(`CSV indirilemedi: ${(e as Error).message}`, "error");
    } finally {
      setExporting(false);
    }
  }

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (status !== "ALL") sp.set("status", status);
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    if (hidePast) sp.set("hide_past", "1");
    sp.set("page", String(page));
    sp.set("limit", String(PAGE_SIZE));
    return sp.toString();
  }, [status, dateFrom, dateTo, hidePast, page]);

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
        e instanceof ApiError
          ? `${e.status}: ${e.message}`
          : (e as Error).message,
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
  }, [status, dateFrom, dateTo, hidePast]);

  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const hasActiveFilter =
    status !== "ALL" || dateFrom !== "" || dateTo !== "" || !hidePast;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div className="fade-up">
        <h1
          className="font-display"
          style={{
            fontSize: "32px",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--gx-text)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Rezervasyonlar
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gx-text-muted)",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          Tüm{" "}
          <span
            className="font-serif font-italic"
            style={{ color: "var(--gx-accent-light)" }}
          >
            kayıtlar
          </span>{" "}
          tek yerde — filtrele, dışa aktar, detay aç.
        </p>
      </div>

      {/* Filters — kompakt grup */}
      <div
        className="card fade-up fade-up-1"
        style={{
          marginTop: "20px",
          padding: "14px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "20px",
          overflow: "visible",
        }}
      >
        {/* Sol grup: filtreler */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "10px",
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          <FilterField label="Durum" width={150}>
            <GXSelect<StatusFilter>
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              ariaLabel="Durum filtresi"
            />
          </FilterField>
          <FilterField label="Başlangıç" width={160}>
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="—"
              ariaLabel="Başlangıç tarihi"
            />
          </FilterField>
          <FilterField label="Bitiş" width={160}>
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="—"
              min={dateFrom || undefined}
              ariaLabel="Bitiş tarihi"
            />
          </FilterField>
        </div>

        {/* Sağ grup: aksiyonlar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setHidePast(!hidePast)}
            aria-pressed={hidePast}
            title={
              hidePast
                ? "Biten/iptal/geçmiş tarihli rezervasyonlar gizli"
                : "Tüm rezervasyonlar görünür"
            }
            style={{
              padding: "9px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 600,
              border: hidePast
                ? "1px solid rgba(124,58,237,0.5)"
                : "1px solid var(--line)",
              background: hidePast
                ? "rgba(124,58,237,0.18)"
                : "rgba(255,255,255,0.04)",
              color: hidePast ? "var(--accent3)" : "var(--muted)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap",
              fontFamily: "var(--inter)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: hidePast ? "var(--accent2)" : "var(--muted2)",
              }}
            />
            {hidePast ? "Geçmişi gizle" : "Geçmişi göster"}
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={exporting}
            title="Mevcut filtrelere göre CSV indir"
            style={{
              padding: "9px 14px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "10px",
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.25)",
              color: "var(--accent3)",
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.6 : 1,
              transition: "all 0.18s ease",
              fontFamily: "var(--inter)",
            }}
            onMouseOver={(e) => {
              if (exporting) return;
              e.currentTarget.style.background = "rgba(124,58,237,0.16)";
              e.currentTarget.style.borderColor = "rgba(124,58,237,0.45)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(124,58,237,0.08)";
              e.currentTarget.style.borderColor = "rgba(124,58,237,0.25)";
            }}
          >
            {exporting ? "..." : "CSV İndir"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="btn-primary"
            style={{ padding: "9px 16px", fontSize: "12px" }}
          >
            {loading ? "Yükleniyor..." : "Yenile"}
          </button>
        </div>
      </div>

      {err && (
        <div
          className="fade-up"
          style={{
            marginTop: "12px",
            padding: "10px 14px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            color: "var(--red)",
            borderRadius: "12px",
            fontSize: "13px",
          }}
        >
          {err}
        </div>
      )}

      {/* Table */}
      <div
        className="card fade-up fade-up-2"
        style={{
          marginTop: "12px",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table className="gx-table" style={{ minWidth: "600px" }}>
            <thead>
              <tr>
                <th>Ad</th>
                <th className="hidden md:table-cell">Telefon</th>
                <th>Tarih · Saat</th>
                <th className="hidden sm:table-cell">Kişi</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <EmptyState
                      icon={<InboxIcon />}
                      title={
                        hasActiveFilter
                          ? "Filtreyle eşleşen rezervasyon yok"
                          : "Henüz rezervasyon yok"
                      }
                      description={
                        hasActiveFilter
                          ? "Filtreleri temizleyerek veya 'Geçmişi göster' seçeneğini açarak diğer kayıtları görebilirsiniz."
                          : "Müşterileriniz Telegram/WhatsApp veya web formundan rezervasyon yapınca burada görünür."
                      }
                    />
                  </td>
                </tr>
              )}
              {data?.items.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setActiveId(r.id)}
                  className={
                    r.status === "PENDING_APPROVAL" ? "pending-row" : undefined
                  }
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontWeight: 600 }}>
                    {r.visitor?.name ?? "—"}
                  </td>
                  <td
                    className="hidden md:table-cell"
                    style={{ color: "var(--muted)" }}
                  >
                    {r.visitor?.phone ?? "—"}
                  </td>
                  <td>
                    {formatTrShortDate(r.visitDate)} · {r.startTime}
                  </td>
                  <td className="hidden sm:table-cell">{r.groupSize}</td>
                  <td>
                    <span className={pillClass(r.status)}>
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
          marginTop: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "13px",
        }}
      >
        <div style={{ color: "var(--muted)", fontSize: "13px" }}>
          {data ? (
            <>
              Toplam{" "}
              <span style={{ color: "var(--txt)", fontWeight: 600 }}>
                {data.total}
              </span>{" "}
              <span
                className="font-serif font-italic"
                style={{ color: "var(--accent3)" }}
              >
                kayıt
              </span>
            </>
          ) : (
            ""
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={pagerBtnStyle(page <= 1 || loading)}
          >
            ‹ Önceki
          </button>
          <span
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              fontFamily: "var(--grotesk)",
              padding: "0 4px",
            }}
          >
            <b style={{ color: "var(--accent3)", fontWeight: 600 }}>{page}</b>{" "}
            <span style={{ color: "var(--muted2)" }}>/ {totalPages}</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={pagerBtnStyle(page >= totalPages || loading)}
          >
            Sonraki ›
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

function FilterField({
  label,
  width,
  children,
}: {
  label: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ width: `${width}px`, minWidth: `${width}px` }}>
      <label
        style={{
          display: "block",
          fontSize: "10px",
          fontWeight: 700,
          color: "var(--muted2)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--line)",
    color: "var(--txt)",
    fontSize: "12px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.15s ease",
    fontFamily: "var(--inter)",
  };
}
