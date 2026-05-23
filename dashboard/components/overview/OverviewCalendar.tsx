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
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationList,
} from "@/lib/types";

// Genel Bakış'a gömülü kompakt Yoğunluk takvim — takvim sayfasının küçük versiyonu.
// Görsel dil takvim sayfası ile aynı (.heat, .hrow, .m-cell), embed olduğu için
// üst topbar/aksiyon barı yok; sadece segment + ‹ › navigasyon ve "Takvim →" link.

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

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
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
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [items, setItems] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<SlotBlock[]>([]);
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);

  const range = useMemo(() => {
    if (mode === "day") {
      const s = startOfDay(anchor);
      return { start: s, end: addDays(s, 1) };
    }
    if (mode === "week") {
      const s = startOfWeekMon(anchor);
      return { start: s, end: addDays(s, 7) };
    }
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
      ).catch(() => ({
        items: [] as Reservation[],
        total: 0,
        page: 1,
        limit: 500,
      })),
      apiFetch<{ items: SlotBlock[] }>(
        `/slots/blocks?date_from=${startISO}&date_to=${endISO}`,
        {},
        token,
      ).catch(() => ({ items: [] as SlotBlock[] })),
      apiFetch<{ items: RecurringRule[] }>(
        "/slots/recurring",
        {},
        token,
      ).catch(() => ({ items: [] as RecurringRule[] })),
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
    else
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  }

  const title = useMemo(() => {
    if (mode === "day") {
      return `${anchor.getDate()} ${MONTHS[anchor.getMonth()]} · ${TR_DAYS[anchor.getDay()]}`;
    }
    if (mode === "week") {
      const s = startOfWeekMon(anchor);
      const e = addDays(s, 6);
      const same = s.getMonth() === e.getMonth();
      if (same) {
        return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`;
      }
      return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
    }
    return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [mode, anchor]);

  function goToDayMode(d: Date) {
    setAnchor(d);
    setMode("day");
  }

  return (
    <div className="card" style={{ padding: 0, minWidth: 0 }}>
      <div className="card-accent" />

      {/* Embed control bar — kompakt (sayfa toplbar'ı yok) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          flexWrap: "wrap",
          padding: "14px 16px 0",
        }}
      >
        <div className="navg" style={{ padding: "4px 6px" }}>
          <button
            type="button"
            className="arr"
            aria-label="Önceki"
            onClick={() => shift(-1)}
          >
            ‹
          </button>
          <span className="rng" style={{ fontSize: "13px" }}>
            {title}
          </span>
          <button
            type="button"
            className="arr"
            aria-label="Sonraki"
            onClick={() => shift(1)}
          >
            ›
          </button>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <div className="seg" role="tablist" aria-label="Takvim modu">
            {(["day", "week", "month"] as Mode[]).map((m) => (
              <b
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => setMode(m)}
                style={{
                  background: mode === m ? "var(--accent)" : "transparent",
                  color: mode === m ? "#fff" : "var(--muted)",
                }}
              >
                {m === "day" ? "Gün" : m === "week" ? "Hafta" : "Ay"}
              </b>
            ))}
          </div>
          <button
            type="button"
            className="golink"
            onClick={onNavigateToFull}
            aria-label="Takvim sayfasına git"
          >
            Takvim <span className="arr">→</span>
          </button>
        </div>
      </div>

      {mode === "day" && (
        <EmbedDay
          date={anchor}
          items={items}
          blocks={blocks}
          recurring={recurring}
          onSlotClick={onReservationClick}
        />
      )}
      {mode === "week" && (
        <EmbedWeek
          weekStart={startOfWeekMon(anchor)}
          items={items}
          blocks={blocks}
          recurring={recurring}
          onDayClick={goToDayMode}
        />
      )}
      {mode === "month" && (
        <EmbedMonth
          anchor={anchor}
          items={items}
          blocks={blocks}
          recurring={recurring}
          onDayClick={goToDayMode}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Embed Day — saat saat (kompakt, 09–19 her 2 saatte bir)
// ─────────────────────────────────────────────────────────

function EmbedDay({
  date,
  items,
  blocks,
  recurring,
  onSlotClick,
}: {
  date: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onSlotClick: (id: string) => void;
}) {
  const iso = toLocalIso(date);
  const dayClosed =
    blocks.some((b) => toLocalIso(new Date(b.slotDate)) === iso) ||
    recurring.some(
      (r) =>
        r.dayOfWeek === date.getDay() &&
        parseHHMM(r.startTime) <= 9 * 60 &&
        parseHHMM(r.endTime) >= 19 * 60,
    );
  const dayItems = items
    .filter(
      (r) =>
        isSameLocalDay(new Date(r.visitDate), date) &&
        (r.status === "APPROVED" || r.status === "PENDING_APPROVAL"),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hours = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];

  return (
    <div style={{ padding: "12px 16px 16px" }}>
      {hours.map((h) => {
        const hm = parseHHMM(h);
        const inHour = dayItems.filter((r) => {
          const rm = parseHHMM(r.startTime);
          return rm >= hm && rm < hm + 120;
        });
        if (inHour.length === 0) {
          return (
            <div key={h} className="hrow" style={{ padding: "6px 0" }}>
              <div className="ht">{h}</div>
              <div
                className="track"
                style={{ height: "28px", cursor: "default" }}
              >
                <div
                  className="empty"
                  style={{ lineHeight: "28px" }}
                >
                  {dayClosed ? "Kapalı" : "Müsait"}
                </div>
              </div>
            </div>
          );
        }
        const first = inHour[0];
        return (
          <div key={h} className="hrow" style={{ padding: "6px 0" }}>
            <div className="ht">{h}</div>
            <div
              className="track"
              style={{ height: "28px" }}
              onClick={() => onSlotClick(first.id)}
              role="button"
            >
              <div
                className={`fill ${
                  first.status === "PENDING_APPROVAL" ? "pend" : "busy"
                }`}
                style={{ fontSize: "11px" }}
              >
                <span className="who">{first.visitor?.name ?? "?"}</span>
                <span className="mt">
                  {first.groupSize} kişi · {STATUS_LABEL[first.status]}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Embed Week — 7 gün özet kart (referans HEAT)
// ─────────────────────────────────────────────────────────

function EmbedWeek({
  weekStart,
  items,
  blocks,
  recurring,
  onDayClick,
}: {
  weekStart: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onDayClick: (d: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function dayResv(d: Date) {
    return items
      .filter(
        (r) =>
          isSameLocalDay(new Date(r.visitDate), d) &&
          (r.status === "APPROVED" || r.status === "PENDING_APPROVAL"),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  function dayFullClosed(d: Date) {
    const iso = toLocalIso(d);
    if (blocks.some((b) => toLocalIso(new Date(b.slotDate)) === iso))
      return true;
    return recurring.some(
      (r) =>
        r.dayOfWeek === d.getDay() &&
        parseHHMM(r.startTime) <= 9 * 60 &&
        parseHHMM(r.endTime) >= 19 * 60,
    );
  }

  const maxGuests = Math.max(
    1,
    ...days.flatMap((d) => dayResv(d).map((r) => r.groupSize)),
  );

  return (
    <div
      className="heat"
      style={{
        gap: "8px",
        padding: "12px",
      }}
    >
      {days.map((d, i) => {
        const isToday = isSameLocalDay(d, today);
        const closed = dayFullClosed(d);
        const resv = dayResv(d);
        const dow = TR_DAYS_SHORT_MON[mondayIndex(d)];
        return (
          <button
            key={i}
            type="button"
            onClick={() => onDayClick(d)}
            className={`ht-day${isToday ? " today" : ""}${closed ? " closed" : ""}`}
            style={{
              border: "none",
              fontFamily: "inherit",
              width: "100%",
              padding: "10px 6px",
            }}
          >
            <div className="dow">{dow}</div>
            <div
              className="dn"
              style={{ fontSize: "18px", margin: "6px 0" }}
            >
              {d.getDate()}
            </div>
            <div
              className="ht-bars"
              style={{ height: "24px", gap: "2px" }}
            >
              {resv.slice(0, 5).map((r) => {
                const h = Math.max(
                  4,
                  Math.round((r.groupSize / maxGuests) * 24),
                );
                return (
                  <span
                    key={r.id}
                    className="ht-bar"
                    style={{ width: "5px", height: `${h}px` }}
                  />
                );
              })}
            </div>
            {closed ? (
              <div className="ht-cnt closed" style={{ fontSize: "10px" }}>
                Kapalı
              </div>
            ) : resv.length === 0 ? (
              <div className="ht-cnt zero" style={{ fontSize: "10px" }}>
                boş
              </div>
            ) : (
              <div className="ht-cnt" style={{ fontSize: "10px" }}>
                {resv.length} ziyaret
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Embed Month — kompakt mini bar
// ─────────────────────────────────────────────────────────

function EmbedMonth({
  anchor,
  items,
  blocks,
  recurring,
  onDayClick,
}: {
  anchor: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onDayClick: (d: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const cells = useMemo(
    () => calendarCells(anchor.getFullYear(), anchor.getMonth()),
    [anchor],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of items) {
      if (r.status !== "APPROVED" && r.status !== "PENDING_APPROVAL") continue;
      const k = toLocalIso(new Date(r.visitDate));
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [items]);

  const blockedDays = useMemo(() => {
    const m = new Set<string>();
    for (const b of blocks) m.add(toLocalIso(new Date(b.slotDate)));
    for (const d of cells) {
      const rule = recurring.find((r) => r.dayOfWeek === d.getDay());
      if (rule) m.add(toLocalIso(d));
    }
    return m;
  }, [blocks, recurring, cells]);

  const maxGuests = Math.max(
    1,
    ...Array.from(byDay.values()).flatMap((arr) =>
      arr.map((r) => r.groupSize),
    ),
  );

  return (
    <div className="month" style={{ padding: "12px" }}>
      <div className="m-dow">
        {TR_DAYS_SHORT_MON.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="m-grid" style={{ gap: "4px" }}>
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = isSameLocalDay(d, today);
          const iso = toLocalIso(d);
          const closed = blockedDays.has(iso);
          const dayItems = byDay.get(iso) ?? [];
          const classes = [
            "m-cell",
            !inMonth && "dim",
            isToday && "today",
            closed && "closed",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={d.toISOString()}
              className={classes}
              onClick={() => onDayClick(d)}
              role="button"
              style={{ minHeight: "52px", padding: "5px 4px" }}
            >
              <div className="n" style={{ fontSize: "10px" }}>
                {d.getDate()}
              </div>
              {closed ? (
                <div className="closed-tag">Kapalı</div>
              ) : dayItems.length > 0 ? (
                <>
                  <div
                    className="mbars"
                    style={{ height: "16px", gap: "1px" }}
                  >
                    {dayItems.slice(0, 5).map((r) => {
                      const h = Math.max(
                        3,
                        Math.round((r.groupSize / maxGuests) * 16),
                      );
                      return (
                        <span
                          key={r.id}
                          className="m-bar"
                          style={{ height: `${h}px`, maxWidth: "4px" }}
                        />
                      );
                    })}
                  </div>
                  <div
                    className="mcnt"
                    style={{ fontSize: "8px", marginTop: "2px" }}
                  >
                    {dayItems.length}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
