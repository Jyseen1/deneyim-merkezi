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
import {
  TR_DAYS_SHORT_MON,
  addMonths,
  calendarCells,
  formatTrLongDate,
  formatTrMonthYear,
  isSameLocalDay,
  monthRange,
  toLocalIso,
} from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useRealtime } from "@/hooks/useRealtime";

type SlotBlock = {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  blockReason: string | null;
};
type RecurringRule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string | null;
};

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "status-pending",
  APPROVED: "status-approved",
  REJECTED: "status-rejected",
  CANCELLED: "status-cancelled",
  COMPLETED: "status-completed",
  NO_SHOW: "status-noshow",
};

const DOT_COLOR: Record<ReservationStatus, { bg: string; fg: string }> = {
  PENDING_APPROVAL: { bg: "#fbbf24", fg: "#1c1917" },
  APPROVED: { bg: "#4338ca", fg: "#ffffff" },
  REJECTED: { bg: "#fee2e2", fg: "#991b1b" },
  CANCELLED: { bg: "#e5e7eb", fg: "#374151" },
  COMPLETED: { bg: "#dbeafe", fg: "#1e40af" },
  NO_SHOW: { bg: "#ffedd5", fg: "#9a3412" },
};

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const token = useBackendToken();

  const now = new Date();
  const [view, setView] = useState({
    year: now.getFullYear(),
    monthIdx: now.getMonth(),
  });
  const [selected, setSelected] = useState<Date>(now);
  const [items, setItems] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<SlotBlock[]>([]);
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  const range = useMemo(
    () => monthRange(view.year, view.monthIdx),
    [view.year, view.monthIdx],
  );
  const cells = useMemo(
    () => calendarCells(view.year, view.monthIdx),
    [view.year, view.monthIdx],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const lastDayDate = new Date(range.end.getTime() - 86400000);
      const lastDayISO = toLocalIso(lastDayDate);
      // 3 endpoint paralel: rezervasyonlar, kapatilmis slotlar, tekrarlayan
      // kurallar. Recurring her ayda ayni — yine de istek atiyoruz cunku
      // yeni kural eklenmis olabilir.
      const [resvRes, blocksRes, recurRes] = await Promise.all([
        apiFetch<ReservationList>(
          `/reservations?date_from=${range.startISO}&date_to=${lastDayISO}&limit=100`,
          {},
          token,
        ),
        apiFetch<{ items: SlotBlock[] }>(
          `/slots/blocks?date_from=${range.startISO}&date_to=${lastDayISO}`,
          {},
          token,
        ).catch(() => ({ items: [] as SlotBlock[] })),
        apiFetch<{ items: RecurringRule[] }>(
          "/slots/recurring-rules",
          {},
          token,
        ).catch(() => ({ items: [] as RecurringRule[] })),
      ]);
      setItems(resvRes.items);
      setBlocks(blocksRes.items);
      setRecurring(recurRes.items);
    } catch (err) {
      // Sessiz: bos goster
      setErrored(true);
      setItems([]);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [range.startISO, range.end, token]);

  useEffect(() => {
    load();
  }, [load]);

  // SSE: yeni rezervasyon/guncelleme veya slot blok degisiklikleri (henuz
  // event yok, ama rezervasyon tarafindan retrigger yeterli).
  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  // Date -> reservation[] gruplaması
  const byDay = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of items) {
      const key = toLocalIso(new Date(r.visitDate));
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return m;
  }, [items]);

  // Kapali gunler haritasi: ISO -> { reason, source }.
  // - blocks: belirli tarihte blok satiri varsa o tarih kapali sayilir
  // - recurring: o haftanin gunu (0..6 Pazar..Cumartesi) icin aktif kural
  //   varsa o gun kapali sayilir
  const blockedByDay = useMemo(() => {
    const m = new Map<string, { reason: string; source: "block" | "recurring" }>();
    for (const b of blocks) {
      const key = toLocalIso(new Date(b.slotDate));
      if (!m.has(key)) {
        m.set(key, {
          reason: b.blockReason ?? "Kapalı",
          source: "block",
        });
      }
    }
    if (recurring.length > 0) {
      for (const d of cells) {
        const key = toLocalIso(d);
        if (m.has(key)) continue;
        const rule = recurring.find((r) => r.dayOfWeek === d.getDay());
        if (rule) {
          m.set(key, {
            reason: rule.reason ?? "Haftalık kapalı",
            source: "recurring",
          });
        }
      }
    }
    return m;
  }, [blocks, recurring, cells]);

  // Bu ay sayilari
  const monthCounts = useMemo(() => {
    let total = 0,
      approved = 0,
      pending = 0,
      rejected = 0;
    for (const r of items) {
      const d = new Date(r.visitDate);
      if (d >= range.start && d < range.end) {
        total++;
        if (r.status === "APPROVED") approved++;
        else if (r.status === "PENDING_APPROVAL") pending++;
        else if (r.status === "REJECTED") rejected++;
      }
    }
    return { total, approved, pending, rejected };
  }, [items, range.start, range.end]);

  const selectedKey = toLocalIso(selected);
  const selectedItems = (byDay.get(selectedKey) ?? []).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  function goPrev() {
    setView((v) => addMonths(v.year, v.monthIdx, -1));
  }
  function goNext() {
    setView((v) => addMonths(v.year, v.monthIdx, 1));
  }

  async function changeStatus(
    id: string,
    action: "approve" | "reject",
  ) {
    try {
      await apiFetch(
        `/reservations/${id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify(
            action === "approve"
              ? { action: "approve", staffId }
              : { action: "reject" },
          ),
        },
        token,
      );
      load();
    } catch (e) {
      // sessiz
    }
  }

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
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Takvim
          </h1>
          <p style={{ fontSize: "13px", color: "#818cf8", margin: "4px 0 0" }}>
            Aya yayılı rezervasyonları görüntüleyin.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(209,196,255,0.6)",
            borderRadius: "99px",
            padding: "4px",
          }}
        >
          <button
            onClick={goPrev}
            aria-label="Önceki ay"
            style={navBtn()}
          >
            <ChevronLeft />
          </button>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#1e1b4b",
              minWidth: "120px",
              textAlign: "center",
            }}
          >
            {formatTrMonthYear(view.year, view.monthIdx)}
          </span>
          <button
            onClick={goNext}
            aria-label="Sonraki ay"
            style={navBtn()}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* Mini stat satiri */}
      <div
        className="fade-up fade-up-1"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        <MonthPill label="Bu ay toplam" value={monthCounts.total} tone="default" />
        <MonthPill label="Onaylı" value={monthCounts.approved} tone="approved" />
        <MonthPill label="Bekleyen" value={monthCounts.pending} tone="pending" />
        <MonthPill label="Reddedilen" value={monthCounts.rejected} tone="rejected" />
      </div>

      {/* Grid + side panel */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_360px]"
        style={{ gap: "20px" }}
      >
        {/* Takvim */}
        <div className="glass fade-up fade-up-2" style={{ padding: "16px" }}>
          {/* Gun basliklari */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            {TR_DAYS_SHORT_MON.map((d) => (
              <div
                key={d}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#818cf8",
                  textAlign: "center",
                  letterSpacing: "0.04em",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Gun hucreleri */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: "6px",
            }}
          >
            {cells.map((d) => {
              const inMonth = d.getMonth() === view.monthIdx;
              const isToday = isSameLocalDay(d, now);
              const isSelected = isSameLocalDay(d, selected);
              const iso = toLocalIso(d);
              const dayItems = byDay.get(iso) ?? [];
              const closed = blockedByDay.get(iso);

              const bgColor = closed
                ? "rgba(148,163,184,0.18)" // gri ton
                : isSelected
                ? "rgba(67,56,202,0.10)"
                : isToday
                ? "rgba(67,56,202,0.06)"
                : "rgba(255,255,255,0.55)";
              const borderColor = closed
                ? "1px dashed #94a3b8"
                : isToday
                ? "2px solid #4338ca"
                : isSelected
                ? "1px solid #c4b5fd"
                : "1px solid rgba(209,196,255,0.5)";

              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelected(d)}
                  title={closed ? `Kapalı · ${closed.reason}` : undefined}
                  style={{
                    minHeight: "72px",
                    padding: "8px",
                    borderRadius: "10px",
                    background: bgColor,
                    border: borderColor,
                    opacity: inMonth ? 1 : 0.35,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    transition: "background 0.15s ease",
                    fontFamily: "inherit",
                    color: closed ? "#475569" : "#1e1b4b",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isToday && !closed)
                      e.currentTarget.style.background = "rgba(67,56,202,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isToday && !closed)
                      e.currentTarget.style.background = "rgba(255,255,255,0.55)";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: isToday ? 700 : 500,
                        color: closed
                          ? "#475569"
                          : isToday
                          ? "#4338ca"
                          : "#1e1b4b",
                      }}
                    >
                      {d.getDate()}
                    </div>
                    {closed && (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          padding: "1px 5px",
                          borderRadius: "99px",
                          background: "rgba(148,163,184,0.25)",
                          color: "#475569",
                          letterSpacing: "0.02em",
                          textTransform: "uppercase",
                        }}
                      >
                        {closed.source === "recurring" ? "↻ Kapalı" : "Kapalı"}
                      </span>
                    )}
                  </div>

                  {/* Rezervasyon noktalari */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: "2px" }}
                  >
                    {dayItems.slice(0, 3).map((r) => {
                      const col = DOT_COLOR[r.status];
                      return (
                        <div
                          key={r.id}
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: col.bg,
                            color: col.fg,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontWeight: 500,
                          }}
                          title={`${r.startTime} · ${r.visitor?.name ?? ""}`}
                        >
                          {r.startTime} · {r.visitor?.name ?? "?"}
                        </div>
                      );
                    })}
                    {dayItems.length > 3 && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#818cf8",
                          fontWeight: 600,
                          paddingLeft: "2px",
                        }}
                      >
                        +{dayItems.length - 3} daha
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {loading && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "11px",
                color: "#a5b4fc",
                textAlign: "right",
              }}
            >
              Yükleniyor…
            </div>
          )}
        </div>

        {/* Side panel */}
        <aside
          className="glass fade-up fade-up-3"
          style={{
            padding: "16px 18px",
            position: "sticky",
            top: "20px",
            height: "fit-content",
            maxHeight: "calc(100vh - 60px)",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#818cf8",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Seçili gün
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "#1e1b4b",
              marginTop: "2px",
              letterSpacing: "-0.01em",
            }}
          >
            {formatTrLongDate(selected)}
          </div>

          {blockedByDay.get(selectedKey) && (
            <div
              style={{
                marginTop: "10px",
                padding: "8px 12px",
                background: "rgba(148,163,184,0.15)",
                border: "1px dashed #94a3b8",
                borderRadius: "10px",
                fontSize: "12px",
                color: "#475569",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "14px" }}>🔒</span>
              <span>
                <strong>Kapalı:</strong>{" "}
                {blockedByDay.get(selectedKey)?.reason}
                {blockedByDay.get(selectedKey)?.source === "recurring" && (
                  <span style={{ marginLeft: "4px", opacity: 0.75 }}>
                    (haftalık)
                  </span>
                )}
              </span>
            </div>
          )}

          <div style={{ marginTop: "14px" }}>
            {selectedItems.length === 0 ? (
              <EmptyDay />
            ) : (
              selectedItems.map((r) => (
                <DayItemRow
                  key={r.id}
                  reservation={r}
                  onApprove={() => changeStatus(r.id, "approve")}
                  onReject={() => changeStatus(r.id, "reject")}
                />
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function navBtn(): React.CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: "#4338ca",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s ease",
  };
}

function MonthPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "approved" | "pending" | "rejected";
}) {
  const map = {
    default: { bg: "rgba(67,56,202,0.08)", color: "#4338ca", border: "#ede9fe" },
    approved: { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" },
    pending: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    rejected: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
  } as const;
  const c = map[tone];
  return (
    <div
      style={{
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        borderRadius: "99px",
        padding: "6px 14px",
        fontSize: "12px",
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function DayItemRow({
  reservation,
  onApprove,
  onReject,
}: {
  reservation: Reservation;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div
      style={{
        background: "#faf5ff",
        border: "1px solid #ede9fe",
        borderRadius: "12px",
        padding: "12px",
        marginBottom: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "#ede9fe",
            color: "#4338ca",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: "11px",
            flexShrink: 0,
          }}
        >
          {initialsOf(reservation.visitor?.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "#1e1b4b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {reservation.visitor?.name ?? "Ziyaretçi"}
          </div>
          <div style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}>
            {reservation.startTime} · {reservation.groupSize} kişi ·{" "}
            {reservation.durationMinutes} dk
          </div>
        </div>
        <span className={`status-pill ${STATUS_CLASS[reservation.status]}`}>
          {STATUS_LABEL[reservation.status]}
        </span>
      </div>

      {reservation.status === "PENDING_APPROVAL" && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onReject}
            className="btn-ghost"
            style={{ padding: "5px 12px", fontSize: "11px" }}
          >
            Reddet
          </button>
          <button
            onClick={onApprove}
            className="btn-primary"
            style={{ padding: "5px 14px", fontSize: "11px" }}
          >
            Onayla
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyDay() {
  return (
    <div style={{ padding: "32px 8px", textAlign: "center" }}>
      <div
        style={{
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          background: "#ede9fe",
          color: "#4338ca",
          margin: "0 auto 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <div style={{ fontSize: "13px", color: "#818cf8", fontWeight: 500 }}>
        Bu gün için rezervasyon yok
      </div>
      <div style={{ fontSize: "11px", color: "#a5b4fc", marginTop: "4px" }}>
        Bir gün seçerek detayını inceleyin.
      </div>
    </div>
  );
}
