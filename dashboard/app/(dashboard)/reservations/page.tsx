"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationList,
  type ReservationStatus,
} from "@/lib/types";
import { ReservationDrawer } from "@/components/ReservationDrawer";
import { EmptyState, InboxIcon } from "@/components/EmptyState";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { GXSelect } from "@/components/ui/GXSelect";
import { TR_DAYS, toLocalIso } from "@/lib/date";
import {
  PRODUCT_OPTIONS,
  type ProductSlug,
  productLabel,
} from "@/lib/products";
import { useRealtime } from "@/hooks/useRealtime";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useToast } from "@/hooks/useToast";

type StatusFilter = "ALL" | ReservationStatus;
type ProductFilter = "ALL" | ProductSlug;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Tümü" },
  { value: "PENDING_APPROVAL", label: "Bekleyen" },
  { value: "APPROVED", label: "Onaylı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal" },
  { value: "NO_SHOW", label: "Gelmedi" },
];

const PRODUCT_FILTER_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: "ALL", label: "Tümü" },
  ...PRODUCT_OPTIONS.map((o) => ({ value: o.slug, label: o.label })),
];

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

const PAGE_SIZE = 50;
const HIDE_PAST_KEY = "dm.hidePastReservations";

function readHidePast(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(HIDE_PAST_KEY);
    if (raw === null) return true;
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

// Telefon (+90 5XX XXX XX XX); değişken format gelirse aynen göster.
function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "").replace(/^90/, "").slice(0, 10);
  if (d.length !== 10) return raw;
  return `+90 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

export default function ReservationsPage() {
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const token = useBackendToken();
  const { show } = useToast();
  const [exporting, setExporting] = useState(false);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [product, setProduct] = useState<ProductFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

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
  // "Yenile" butonu için ayrı state — yalnızca manuel tıklama sırasında true.
  // Filtre değişimi gibi otomatik fetch'lerde buton "Yenile" yazısında kalır.
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function exportCSV() {
    if (!token) return;
    setExporting(true);
    try {
      const sp = new URLSearchParams();
      if (status !== "ALL") sp.set("status", status);
      if (product !== "ALL") sp.set("product", product);
      if (dateFrom) sp.set("date_from", dateFrom);
      if (dateTo) sp.set("date_to", dateTo);
      const url = `${backendBase()}/api/v1/reservations/export?${sp.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    if (product !== "ALL") sp.set("product", product);
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    if (hidePast) sp.set("hide_past", "1");
    sp.set("page", String(page));
    sp.set("limit", String(PAGE_SIZE));
    return sp.toString();
  }, [status, product, dateFrom, dateTo, hidePast, page]);

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
  }, [status, product, dateFrom, dateTo, hidePast]);

  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const hasActiveFilter =
    status !== "ALL" ||
    product !== "ALL" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    !hidePast;

  // TARİH GRUPLAMA — sayfanın görünen kayıtlarını güne göre grupla.
  // Backend sıralaması korunur; sadece görsel olarak başlıklarla bölünür.
  const groups = useMemo(() => {
    if (!data) return [] as { iso: string; date: Date; items: Reservation[] }[];
    const m = new Map<string, Reservation[]>();
    const order: string[] = [];
    for (const r of data.items) {
      const iso = toLocalIso(new Date(r.visitDate));
      if (!m.has(iso)) {
        m.set(iso, []);
        order.push(iso);
      }
      m.get(iso)!.push(r);
    }
    return order.map((iso) => {
      const items = (m.get(iso) ?? []).sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      return { iso, date: new Date(iso), items };
    });
  }, [data]);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div className="fade-up">
        <h1
          className="font-display"
          style={{
            fontSize: "30px",
            fontWeight: 600,
            letterSpacing: "-0.5px",
            color: "var(--txt)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Rezervasyonlar
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--muted)",
            margin: "6px 0 0",
            lineHeight: 1.5,
          }}
        >
          Tüm{" "}
          <span
            className="font-serif font-italic"
            style={{ color: "var(--accent3)" }}
          >
            kayıtlar
          </span>{" "}
          güne göre gruplu — filtrele, dışa aktar, detay aç.
        </p>
      </div>

      {/* Filtre barı */}
      <div
        className="card fade-up fade-up-1"
        style={{
          marginTop: "20px",
          padding: "14px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "16px",
          overflow: "visible",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "flex-end",
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
          <FilterField label="Ürün" width={150}>
            <GXSelect<ProductFilter>
              options={PRODUCT_FILTER_OPTIONS}
              value={product}
              onChange={setProduct}
              ariaLabel="Ürün filtresi"
            />
          </FilterField>
          <FilterField label="Tarih aralığı" width={260}>
            {/* Tek takvim açılışında range seçimi — backend kontratı korunur:
                state'te ayrı dateFrom/dateTo string'leri tutulur, query'ye
                aynen geçer. DateRangePicker sadece UI birleştirir. */}
            <DateRangePicker
              value={{ from: dateFrom, to: dateTo }}
              onChange={(v) => {
                setDateFrom(v.from);
                setDateTo(v.to);
              }}
              ariaLabel="Tarih aralığı"
            />
          </FilterField>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setStatus("ALL");
                setProduct("ALL");
                setDateFrom("");
                setDateTo("");
                setHidePast(true);
              }}
              title="Tüm filtreleri varsayılana döndür"
              style={{
                alignSelf: "flex-end",
                padding: "9px 12px",
                fontSize: "12px",
                fontWeight: 500,
                fontFamily: "var(--inter)",
                color: "var(--muted)",
                background: "transparent",
                border: "1px solid var(--line)",
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 150ms ease",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)";
                e.currentTarget.style.color = "var(--accent3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.color = "var(--muted)";
              }}
            >
              <span aria-hidden style={{ fontSize: "14px", lineHeight: 1 }}>
                ×
              </span>
              Filtreleri sıfırla
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <HidePastToggle value={hidePast} onChange={setHidePast} />
          <button
            type="button"
            onClick={exportCSV}
            disabled={exporting}
            title="Mevcut filtrelere göre CSV indir"
            className="btn btn-ghost-mor"
          >
            {exporting ? "..." : "CSV İndir"}
          </button>
          <button
            type="button"
            onClick={async () => {
              setIsManualRefreshing(true);
              try {
                await load();
              } finally {
                setIsManualRefreshing(false);
              }
            }}
            disabled={isManualRefreshing}
            className="btn btn-primary"
          >
            {isManualRefreshing ? "Yükleniyor..." : "Yenile"}
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

      {/* TARİH GRUPLU LİSTE */}
      <div className="fade-up fade-up-2" style={{ marginTop: "16px" }}>
        {data && data.items.length === 0 && !loading ? (
          <div className="card" style={{ padding: 0 }}>
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
          </div>
        ) : (
          groups.map((g) => (
            <DayGroup
              key={g.iso}
              date={g.date}
              items={g.items}
              onClick={(id) => setActiveId(id)}
            />
          ))
        )}
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

// ─────────────────────────────────────────────────────────
// Gün grubu
// ─────────────────────────────────────────────────────────

function DayGroup({
  date,
  items,
  onClick,
}: {
  date: Date;
  items: Reservation[];
  onClick: (id: string) => void;
}) {
  const dayName = TR_DAYS[date.getDay()];
  const monthName = MONTHS[date.getMonth()];
  const countWord =
    items.length === 1 ? "1 rezervasyon" : `${items.length} rezervasyon`;

  return (
    <div className="daygroup">
      <div className="dh">
        <span className="big">
          {date.getDate()} <em>{monthName}</em>
        </span>
        <span className="cnt">· {dayName} · {countWord}</span>
      </div>
      {items.map((r) => {
        const isPending = r.status === "PENDING_APPROVAL";
        return (
          <div
            key={r.id}
            className={`rmini${isPending ? " pend" : ""}`}
            onClick={() => onClick(r.id)}
            role="button"
          >
            <div className="tm">{r.startTime}</div>
            <div className="nm">{r.visitor?.name ?? "—"}</div>
            <div className="ph">{formatPhone(r.visitor?.phone)}</div>
            <div className="ppl">{r.groupSize} kişi</div>
            {r.product && (
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--grotesk)",
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: "999px",
                  background: "rgba(124,58,237,0.10)",
                  color: "var(--accent3)",
                  border: "1px solid rgba(124,58,237,0.25)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {productLabel(r.product)}
              </span>
            )}
            <span className={pillClass(r.status)}>{STATUS_LABEL[r.status]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function HidePastToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  // Switch + label kombinasyonu. Açık/kapalı net, mor primary "Yenile"
  // butonundan görsel olarak ayrıştırılır.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={
        value
          ? "Biten/iptal/geçmiş tarihli rezervasyonlar gizli"
          : "Tüm rezervasyonlar görünür"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${
          value ? "rgba(124,58,237,0.35)" : "var(--line)"
        }`,
        color: value ? "var(--accent3)" : "var(--muted)",
        fontSize: "12px",
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "var(--inter)",
        transition: "border-color 150ms ease, color 150ms ease, background 150ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!value) {
          e.currentTarget.style.borderColor = "rgba(124,58,237,0.30)";
          e.currentTarget.style.color = "var(--txt)";
        }
      }}
      onMouseLeave={(e) => {
        if (!value) {
          e.currentTarget.style.borderColor = "var(--line)";
          e.currentTarget.style.color = "var(--muted)";
        }
      }}
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          display: "inline-block",
          width: "30px",
          height: "16px",
          borderRadius: "999px",
          background: value ? "var(--accent)" : "rgba(255,255,255,0.10)",
          transition: "background 180ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: value ? "16px" : "2px",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            transition: "left 180ms ease",
          }}
        />
      </span>
      Geçmişi gizle
    </button>
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
