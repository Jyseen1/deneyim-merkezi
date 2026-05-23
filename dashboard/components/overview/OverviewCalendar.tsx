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
      // Embed çoklu hafta: anchor haftasından başla, 4 hafta ileri (=28 gün).
      // Alt boşluğu doldurur, ay geçişlerini dim ile gösterir.
      const s = startOfWeekMon(anchor);
      return { start: s, end: addDays(s, 28) };
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
      return `${anchor.getDate()} ${MONTHS[anchor.getMonth()]}`;
    }
    if (mode === "week") {
      // Multi-week pencere için ilk haftanın ayı (referans dili)
      const s = startOfWeekMon(anchor);
      return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
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
          <span
            className="rng"
            style={{
              fontSize: "13px",
              /* Sabit genişlik — tarih metni değişse de ‹ › okları yer değiştirmesin */
              width: "120px",
              textAlign: "center",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
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
        <EmbedMultiWeek
          weekStart={startOfWeekMon(anchor)}
          weekCount={4}
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
// Embed Multi-Week — N ardışık hafta + tek dow header (referans multiweek)
// ─────────────────────────────────────────────────────────

function EmbedMultiWeek({
  weekStart,
  weekCount,
  items,
  blocks,
  recurring,
  onDayClick,
}: {
  weekStart: Date;
  weekCount: number;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onDayClick: (d: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  // İlk haftanın ayı; sonraki aya taşan günler dim
  const anchorMonth = weekStart.getMonth();

  const weeks = useMemo(() => {
    return Array.from({ length: weekCount }, (_, wi) =>
      Array.from({ length: 7 }, (_, di) => addDays(weekStart, wi * 7 + di)),
    );
  }, [weekStart, weekCount]);

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

  // Global max — tüm haftalar üzerinden bar yüksekliği normalize edilsin
  const allDays = weeks.flat();
  const maxGuests = Math.max(
    1,
    ...allDays.flatMap((d) => dayResv(d).map((r) => r.groupSize)),
  );

  return (
    <div>
      {/* dow header — tek sefer üstte */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "6px",
          padding: "0 14px 6px",
        }}
      >
        {TR_DAYS_SHORT_MON.map((d) => (
          <span
            key={d}
            style={{
              textAlign: "center",
              fontSize: "9px",
              color: "var(--muted3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {d}
          </span>
        ))}
      </div>

      <div
        style={{
          padding: "0 14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "6px",
            }}
          >
            {week.map((d, di) => {
              const isToday = isSameLocalDay(d, today);
              const closed = dayFullClosed(d);
              const resv = dayResv(d);
              const dim = d.getMonth() !== anchorMonth;
              const cls = [
                "ht-day",
                isToday && "today",
                closed && "closed",
                dim && "dim",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={di}
                  type="button"
                  onClick={() => onDayClick(d)}
                  className={cls}
                  style={{
                    border: "none",
                    fontFamily: "inherit",
                    width: "100%",
                    padding: "8px 6px",
                    minHeight: "78px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    className="dn"
                    style={{ fontSize: "16px", margin: "0 0 4px" }}
                  >
                    {d.getDate()}
                  </div>
                  <div
                    className="ht-bars"
                    style={{ height: "22px", gap: "2px", margin: "6px 0 4px", flex: 1 }}
                  >
                    {resv.slice(0, 5).map((r) => {
                      const h = Math.max(
                        3,
                        Math.round((r.groupSize / maxGuests) * 22),
                      );
                      return (
                        <span
                          key={r.id}
                          className="ht-bar"
                          style={{ width: "6px", height: `${h}px` }}
                        />
                      );
                    })}
                  </div>
                  {closed ? (
                    <div className="ht-cnt closed" style={{ fontSize: "9px" }}>
                      Kapalı
                    </div>
                  ) : resv.length === 0 ? (
                    <div className="ht-cnt zero" style={{ fontSize: "9px" }}>
                      —
                    </div>
                  ) : (
                    <div className="ht-cnt" style={{ fontSize: "9px" }}>
                      {resv.length}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
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
