"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";
import {
  TR_DAYS,
  TR_DAYS_SHORT_MON,
  calendarCells,
  isSameLocalDay,
  mondayIndex,
  toLocalIso,
} from "@/lib/date";
import type {
  Reservation,
  ReservationList,
  ReservationStatus,
} from "@/lib/types";

// Genel Bakış sayfasına gömülü kompakt 3-modlu takvim.
// Day/Week/Month görünümleri; veriler /reservations'tan çekilir + cache.

type Mode = "day" | "week" | "month";

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtMin(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfWeekMon(d: Date): Date {
  return addDays(startOfDay(d), -mondayIndex(d));
}

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

export function OverviewCalendar({
  onReservationClick,
  onNavigateToFull,
}: {
  onReservationClick: (id: string) => void;
  onNavigateToFull: () => void;
}) {
  const token = useBackendToken();
  const [mode, setMode] = useState<Mode>("day");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [items, setItems] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<SlotBlock[]>([]);
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);

  // Yüklenecek aralık modu takip eder
  const range = useMemo(() => {
    if (mode === "day") {
      const s = startOfDay(anchor);
      return { start: s, end: addDays(s, 1) };
    }
    if (mode === "week") {
      const s = startOfWeekMon(anchor);
      return { start: s, end: addDays(s, 7) };
    }
    // month — referansta 1.gün başlangıç, sonraki ay 1.gün son
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return { start: s, end: e };
  }, [mode, anchor]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const startISO = toLocalIso(range.start);
    const endISO = toLocalIso(addDays(range.end, -1));

    Promise.all([
      apiFetch<ReservationList>(
        `/reservations?date_from=${startISO}&date_to=${endISO}&limit=500`,
        {},
        token,
      ).catch(() => ({ items: [] as Reservation[], total: 0, page: 1, limit: 500 })),
      apiFetch<{ items: SlotBlock[] }>(
        `/slots/blocks?date_from=${startISO}&date_to=${endISO}`,
        {},
        token,
      ).catch(() => ({ items: [] as SlotBlock[] })),
      apiFetch<{ items: RecurringRule[] }>("/slots/recurring", {}, token).catch(
        () => ({ items: [] as RecurringRule[] }),
      ),
    ]).then(([r, b, rc]) => {
      if (cancelled) return;
      setItems(r.items);
      setBlocks(b.items);
      setRecurring(rc.items);
    });

    return () => {
      cancelled = true;
    };
  }, [token, range.start, range.end]);

  function shift(delta: -1 | 1) {
    if (mode === "day") setAnchor((a) => addDays(a, delta));
    else if (mode === "week") setAnchor((a) => addDays(a, delta * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  }

  const title = useMemo(() => {
    if (mode === "day") {
      return (
        <>
          {anchor.getDate()} {MONTHS[anchor.getMonth()]} ·{" "}
          <em>{TR_DAYS[anchor.getDay()]}</em>
        </>
      );
    }
    if (mode === "week") {
      const s = startOfWeekMon(anchor);
      const e = addDays(s, 6);
      const same = s.getMonth() === e.getMonth();
      if (same) {
        return (
          <>
            Bu <em>hafta</em> · {s.getDate()}–{e.getDate()}{" "}
            {MONTHS[s.getMonth()]}
          </>
        );
      }
      return (
        <>
          Bu <em>hafta</em> · {s.getDate()} {MONTHS[s.getMonth()]} – {e.getDate()}{" "}
          {MONTHS[e.getMonth()]}
        </>
      );
    }
    return (
      <>
        {MONTHS[anchor.getMonth()]} <em>{anchor.getFullYear()}</em>
      </>
    );
  }, [mode, anchor]);

  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-accent" />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--grotesk)",
            fontWeight: 600,
            fontSize: "14px",
            color: "var(--txt)",
          }}
        >
          {title}
        </div>
        <div
          style={{ display: "flex", gap: "6px", alignItems: "center" }}
        >
          <div className="seg" role="tablist" aria-label="Takvim modu">
            {(["day", "week", "month"] as Mode[]).map((m) => (
              <b
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => setMode(m)}
              >
                {m === "day" ? "Gün" : m === "week" ? "Hafta" : "Ay"}
              </b>
            ))}
          </div>
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Önceki"
            style={navStyle()}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Sonraki"
            style={navStyle()}
          >
            ›
          </button>
          <button
            type="button"
            onClick={onNavigateToFull}
            className="golink"
            style={{ marginLeft: "4px", border: "none", background: "transparent" }}
            aria-label="Takvim sayfasına git"
          >
            Takvim <span className="arr">→</span>
          </button>
        </div>
      </div>

      {mode === "day" && (
        <DayAgenda
          date={anchor}
          items={items}
          blocks={blocks}
          recurring={recurring}
          onReservationClick={onReservationClick}
        />
      )}
      {mode === "week" && (
        <WeekGrid
          weekStart={startOfWeekMon(anchor)}
          items={items}
          blocks={blocks}
          recurring={recurring}
          onReservationClick={onReservationClick}
        />
      )}
      {mode === "month" && (
        <MonthGrid
          anchor={anchor}
          items={items}
          blocks={blocks}
          recurring={recurring}
        />
      )}
    </div>
  );
}

function navStyle(): React.CSSProperties {
  return {
    width: "26px",
    height: "26px",
    borderRadius: "7px",
    background: "rgba(255,255,255,0.05)",
    border: "none",
    color: "var(--muted)",
    fontSize: "12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

// ─────────────────────────────────────────────────────────
// DAY — saat saat ajanda
// ─────────────────────────────────────────────────────────

function DayAgenda({
  date,
  items,
  blocks,
  recurring,
  onReservationClick,
}: {
  date: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onReservationClick: (id: string) => void;
}) {
  const dayItems = items
    .filter((r) => isSameLocalDay(new Date(r.visitDate), date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const iso = toLocalIso(date);
  const dayClosed = blocks.some(
    (b) => toLocalIso(new Date(b.slotDate)) === iso,
  ) || recurring.some((r) => r.dayOfWeek === date.getDay());

  // Saat slotları: 09, 11, 13, 15, 17, 19 — referans HTML'deki gibi
  const hours = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {hours.map((h) => {
        const inHour = dayItems.filter((r) => {
          const rm = parseHHMM(r.startTime);
          const hm = parseHHMM(h);
          return rm >= hm && rm < hm + 120; // 2 saatlik blok
        });
        if (inHour.length === 0) {
          return (
            <div key={h} style={rowStyle()}>
              <span style={timeStyle()}>{h}</span>
              <div style={emptySlot(dayClosed)}>
                {dayClosed ? "Kapalı" : "Müsait"}
              </div>
            </div>
          );
        }
        return (
          <div key={h} style={rowStyle()}>
            <span style={timeStyle()}>{h}</span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
              {inHour.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onReservationClick(r.id)}
                  style={busySlot(r.status)}
                >
                  <span style={{ fontWeight: 600 }}>
                    {r.visitor?.name ?? "?"}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "11px",
                      color: "var(--muted)",
                      fontWeight: 400,
                    }}
                  >
                    {r.groupSize} kişi · {statusLabelShort(r.status)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusLabelShort(s: ReservationStatus): string {
  if (s === "APPROVED") return "Onaylı";
  if (s === "PENDING_APPROVAL") return "Bekliyor";
  if (s === "REJECTED") return "Reddedildi";
  if (s === "CANCELLED") return "İptal";
  if (s === "COMPLETED") return "Tamamlandı";
  return "Gelmedi";
}

function rowStyle(): React.CSSProperties {
  return { display: "flex", gap: "10px", alignItems: "stretch" };
}
function timeStyle(): React.CSSProperties {
  return {
    width: "42px",
    fontFamily: "var(--grotesk)",
    fontSize: "11px",
    color: "var(--muted2)",
    paddingTop: "8px",
    flexShrink: 0,
    textAlign: "right",
  };
}
function emptySlot(closed: boolean): React.CSSProperties {
  return {
    flex: 1,
    borderRadius: "8px",
    border: `1px dashed ${closed ? "rgba(239,68,68,0.30)" : "var(--line)"}`,
    minHeight: "34px",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    fontSize: "11px",
    color: closed ? "var(--red)" : "var(--muted3)",
    background: closed ? "rgba(239,68,68,0.06)" : "transparent",
  };
}
function busySlot(status: ReservationStatus): React.CSSProperties {
  const pending = status === "PENDING_APPROVAL";
  return {
    flex: 1,
    borderRadius: "8px",
    border: pending
      ? "1px solid rgba(167,139,250,0.3)"
      : "1px solid rgba(124,58,237,0.3)",
    background: pending
      ? "rgba(167,139,250,0.06)"
      : "rgba(124,58,237,0.08)",
    color: "var(--txt)",
    fontSize: "13px",
    fontWeight: 500,
    minHeight: "34px",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: "8px",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    transition: "background 0.12s ease, border-color 0.12s ease",
  };
}

// ─────────────────────────────────────────────────────────
// WEEK — 48px saat + 7 gün × ~6 saat
// ─────────────────────────────────────────────────────────

function WeekGrid({
  weekStart,
  items,
  blocks,
  recurring,
  onReservationClick,
}: {
  weekStart: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onReservationClick: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const hours = [9, 11, 13, 15, 17, 19];

  function inCell(d: Date, h: number) {
    return items.filter((r) => {
      if (!isSameLocalDay(new Date(r.visitDate), d)) return false;
      const rm = parseHHMM(r.startTime);
      return rm >= h * 60 && rm < (h + 2) * 60;
    });
  }
  function isCellClosed(d: Date, h: number) {
    const iso = toLocalIso(d);
    const hm = h * 60;
    const hmEnd = (h + 2) * 60;
    const blocked = blocks.some(
      (b) =>
        toLocalIso(new Date(b.slotDate)) === iso &&
        parseHHMM(b.startTime) < hmEnd &&
        parseHHMM(b.endTime) > hm,
    );
    if (blocked) return true;
    return recurring.some(
      (r) =>
        r.dayOfWeek === d.getDay() &&
        parseHHMM(r.startTime) < hmEnd &&
        parseHHMM(r.endTime) > hm,
    );
  }

  return (
    <div>
      {/* Üst başlık satırı */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "36px repeat(7, 1fr)",
          gap: "4px",
          marginBottom: "8px",
        }}
      >
        <div />
        {days.map((d, i) => {
          const isToday = isSameLocalDay(d, today);
          return (
            <div
              key={i}
              style={{
                textAlign: "center",
                padding: "6px 2px",
                borderRadius: "8px",
                background: isToday ? "rgba(124,58,237,0.08)" : "var(--bg2)",
                border: `1px solid ${
                  isToday ? "var(--accent)" : "var(--line2)"
                }`,
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  textTransform: "uppercase",
                  color: "var(--muted3)",
                  letterSpacing: "0.05em",
                }}
              >
                {TR_DAYS_SHORT_MON[mondayIndex(d)]}
              </div>
              <div
                style={{
                  fontFamily: "var(--grotesk)",
                  fontSize: "14px",
                  fontWeight: isToday ? 600 : 300,
                  marginTop: "2px",
                  color: isToday ? "#fff" : "var(--txt)",
                }}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Saat satırları */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {hours.map((h) => (
          <div
            key={h}
            style={{
              display: "grid",
              gridTemplateColumns: "36px repeat(7, 1fr)",
              gap: "4px",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                fontFamily: "var(--grotesk)",
                fontSize: "10px",
                color: "var(--muted2)",
                paddingTop: "10px",
                textAlign: "right",
              }}
            >
              {pad2(h)}
            </div>
            {days.map((d, i) => {
              const isToday = isSameLocalDay(d, today);
              const cellResv = inCell(d, h);
              const closed = isCellClosed(d, h);
              return (
                <div
                  key={i}
                  style={{
                    minHeight: "34px",
                    borderRadius: "7px",
                    border: closed
                      ? "1px solid rgba(239,68,68,0.18)"
                      : "1px solid var(--line2)",
                    background: closed
                      ? "rgba(239,68,68,0.06)"
                      : isToday
                        ? "rgba(124,58,237,0.04)"
                        : "var(--bg2)",
                    position: "relative",
                    cursor: cellResv.length ? "pointer" : "default",
                    transition: "background 0.12s ease",
                  }}
                  onClick={() => {
                    if (cellResv.length === 1) {
                      onReservationClick(cellResv[0].id);
                    }
                  }}
                >
                  {cellResv.slice(0, 1).map((r) => (
                    <div
                      key={r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReservationClick(r.id);
                      }}
                      style={evStyle(r.status, cellResv.length)}
                    >
                      {cellResv.length}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function evStyle(status: ReservationStatus, count: number): React.CSSProperties {
  const pending = status === "PENDING_APPROVAL";
  return {
    position: "absolute",
    inset: "2px",
    borderRadius: "5px",
    background: pending
      ? "rgba(167,139,250,0.15)"
      : "rgba(74,222,128,0.18)",
    border: pending
      ? "1px solid rgba(167,139,250,0.35)"
      : "1px solid rgba(74,222,128,0.35)",
    color: pending ? "var(--accent3)" : "var(--green)",
    fontSize: "9px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    padding: "0 3px",
    overflow: "hidden",
    cursor: "pointer",
    pointerEvents: count > 0 ? "auto" : "none",
  };
}

// ─────────────────────────────────────────────────────────
// MONTH — tam ay grid
// ─────────────────────────────────────────────────────────

function MonthGrid({
  anchor,
  items,
  blocks,
  recurring,
}: {
  anchor: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
}) {
  const today = new Date();
  const cells = useMemo(
    () => calendarCells(anchor.getFullYear(), anchor.getMonth()),
    [anchor],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of items) {
      const k = toLocalIso(new Date(r.visitDate));
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [items]);

  const blockedDays = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) {
      const k = toLocalIso(new Date(b.slotDate));
      if (!m.has(k)) m.set(k, b.blockReason ?? "Kapalı");
    }
    for (const d of cells) {
      const k = toLocalIso(d);
      if (m.has(k)) continue;
      const rule = recurring.find((r) => r.dayOfWeek === d.getDay());
      if (rule) m.set(k, rule.reason ?? "Kapalı");
    }
    return m;
  }, [blocks, recurring, cells]);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
          marginBottom: "4px",
        }}
      >
        {TR_DAYS_SHORT_MON.map((d) => (
          <div
            key={d}
            style={{
              fontSize: "9px",
              color: "var(--muted3)",
              textAlign: "center",
              textTransform: "uppercase",
              paddingBottom: "3px",
              letterSpacing: "0.05em",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
        }}
      >
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = isSameLocalDay(d, today);
          const iso = toLocalIso(d);
          const dayItems = byDay.get(iso) ?? [];
          const closed = blockedDays.get(iso);
          const approved = dayItems.filter((r) => r.status === "APPROVED").length;
          const pending = dayItems.filter(
            (r) => r.status === "PENDING_APPROVAL",
          ).length;

          return (
            <div
              key={d.toISOString()}
              style={{
                borderRadius: "8px",
                background: closed
                  ? "rgba(239,68,68,0.06)"
                  : isToday
                    ? "rgba(124,58,237,0.08)"
                    : "var(--bg2)",
                border: closed
                  ? "1px solid rgba(239,68,68,0.20)"
                  : isToday
                    ? "1px solid var(--accent)"
                    : "1px solid var(--line2)",
                padding: "5px 4px",
                minHeight: "52px",
                opacity: inMonth ? 1 : 0.3,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: isToday ? "#fff" : "var(--muted)",
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {d.getDate()}
              </div>
              {closed && (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "8px",
                    padding: "1px 3px",
                    borderRadius: "4px",
                    background: "rgba(239,68,68,0.18)",
                    color: "var(--red)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Kapalı
                </div>
              )}
              {!closed && approved > 0 && (
                <div style={mEv("ok")}>
                  {approved} onaylı
                </div>
              )}
              {!closed && pending > 0 && (
                <div style={mEv("w")}>{pending} bekl.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function mEv(kind: "ok" | "w"): React.CSSProperties {
  return {
    marginTop: "4px",
    fontSize: "8px",
    padding: "1px 3px",
    borderRadius: "4px",
    background:
      kind === "ok" ? "rgba(74,222,128,0.18)" : "rgba(139,92,246,0.18)",
    color: kind === "ok" ? "var(--green)" : "var(--accent3)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}
