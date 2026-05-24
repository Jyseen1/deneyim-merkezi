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
  onAddReservation,
}: {
  onReservationClick: (id: string) => void;
  onNavigateToFull: () => void;
  onAddReservation: () => void;
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
      // Embed hafta ajandası: anchor haftası (7 gün). Sadece dolu günler
      // listelenir, +N daha mantığı ile asla taşmaz; alta footer yapışır.
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
      return `${anchor.getDate()} ${MONTHS[anchor.getMonth()]}`;
    }
    if (mode === "week") {
      // Hafta ajandası — referans: "18–24 Mayıs" / cross-month: "29 May – 4 Haz"
      const s = startOfWeekMon(anchor);
      const e = addDays(s, 6);
      if (s.getMonth() === e.getMonth()) {
        return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`;
      }
      const fm = MONTHS[s.getMonth()].slice(0, 3);
      const tm = MONTHS[e.getMonth()].slice(0, 3);
      return `${s.getDate()} ${fm} – ${e.getDate()} ${tm}`;
    }
    return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [mode, anchor]);

  function goToDayMode(d: Date) {
    setAnchor(d);
    setMode("day");
  }

  return (
    <div
      className="card"
      style={{
        padding: 0,
        minWidth: 0,
        // flex column → ajanda alanı flex:1, footer margin-top:auto ile alta
        // yapışır. .grid2 align-items:stretch ile bu kart sağ panel kadar uzar.
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
      }}
    >
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
        <EmbedWeekAgenda
          weekStart={startOfWeekMon(anchor)}
          items={items}
          onReservationClick={onReservationClick}
          onDayClick={goToDayMode}
          onAddReservation={onAddReservation}
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
    // flex column + flex:1 → card wrapper kart dolu yüksekliğine yayar.
    // Satırları "space-between" ile aralarına eşit boşluk dağıt + track height
    // 28→44 (saat slotları daha ferah, sağ panelle dengeli).
    <div
      style={{
        padding: "12px 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        flex: 1,
        justifyContent: "space-between",
      }}
    >
      {hours.map((h) => {
        const hm = parseHHMM(h);
        const inHour = dayItems.filter((r) => {
          const rm = parseHHMM(r.startTime);
          return rm >= hm && rm < hm + 120;
        });
        if (inHour.length === 0) {
          return (
            <div key={h} className="hrow" style={{ padding: 0 }}>
              <div className="ht">{h}</div>
              <div
                className="track"
                style={{ height: "44px", cursor: "default" }}
              >
                <div className="empty" style={{ lineHeight: "44px" }}>
                  {dayClosed ? "Kapalı" : "Müsait"}
                </div>
              </div>
            </div>
          );
        }
        const first = inHour[0];
        return (
          <div key={h} className="hrow" style={{ padding: 0 }}>
            <div className="ht">{h}</div>
            <div
              className="track"
              style={{ height: "44px" }}
              onClick={() => onSlotClick(first.id)}
              role="button"
            >
              <div
                className={`fill ${
                  first.status === "PENDING_APPROVAL" ? "pend" : "busy"
                }`}
                style={{ fontSize: "12px" }}
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
// Embed Week Agenda — sadece dolu günler + +N daha + footer simetri
// (referans agenda-reference.html)
// ─────────────────────────────────────────────────────────

const TR_DOW_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function EmbedWeekAgenda({
  weekStart,
  items,
  onReservationClick,
  onDayClick,
  onAddReservation,
}: {
  weekStart: Date;
  items: Reservation[];
  onReservationClick: (id: string) => void;
  onDayClick: (d: Date) => void;
  onAddReservation: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Sadece APPROVED + PENDING_APPROVAL ziyaret sayılır (referansla aynı tanım)
  function dayResv(d: Date): Reservation[] {
    return items
      .filter(
        (r) =>
          isSameLocalDay(new Date(r.visitDate), d) &&
          (r.status === "APPROVED" || r.status === "PENDING_APPROVAL"),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const populated = days
    .map((d) => ({ date: d, resv: dayResv(d) }))
    .filter((d) => d.resv.length > 0);

  const totalVisits = populated.reduce((s, d) => s + d.resv.length, 0);
  const fullDays = populated.length;
  const emptyDays = 7 - fullDays;

  // Taşma kontrolü: dolu gün sayısına göre satır limiti
  // ≤2 dolu gün → max 3 satır, ≥3 dolu gün → max 2 satır
  const perDayLimit = fullDays <= 2 ? 3 : 2;

  return (
    <div className="agw">
      {populated.length === 0 ? (
        <div className="agw-empty">
          <div className="ic">○</div>
          <div className="tx">
            Bu hafta <em>rezervasyon</em> yok
          </div>
          <button
            type="button"
            className="qa-btn"
            onClick={onAddReservation}
            style={{
              flex: "none",
              padding: "9px 18px",
              fontSize: "13px",
              marginTop: "4px",
              fontFamily: "inherit",
            }}
          >
            + Rezervasyon ekle
          </button>
        </div>
      ) : (
        populated.map(({ date, resv }) => {
          const isToday = isSameLocalDay(date, today);
          const dow = TR_DOW_SHORT[(date.getDay() + 6) % 7];
          const visible = resv.slice(0, perDayLimit);
          const hidden = resv.length - visible.length;
          return (
            <div
              key={date.toISOString()}
              className={`agw-day${isToday ? " today" : ""}`}
            >
              <div
                className={`agw-date${isToday ? " today" : ""}`}
                onClick={() => onDayClick(date)}
                role="button"
              >
                <div className="dn">{date.getDate()}</div>
                <div className="dow">{dow}</div>
                <div className="cnt">
                  {resv.length}{" "}
                  {resv.length === 1 ? "ziyaret" : "ziyaret"}
                </div>
              </div>
              <div className="agw-evs">
                {visible.map((r) => {
                  const isPending = r.status === "PENDING_APPROVAL";
                  return (
                    <div
                      key={r.id}
                      className={`agw-ev${isPending ? " pend" : ""}`}
                      onClick={() => onReservationClick(r.id)}
                      role="button"
                    >
                      <div className="tm">{r.startTime}</div>
                      <div className="nm">{r.visitor?.name ?? "—"}</div>
                      <div className="mt">{r.groupSize} kişi</div>
                    </div>
                  );
                })}
                {hidden > 0 && (
                  <div
                    className="agw-more"
                    onClick={() => onDayClick(date)}
                    role="button"
                  >
                    +{hidden} ziyaret daha →
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      <div className="agw-foot">
        <span>
          Bu hafta <b>{totalVisits}</b> ziyaret
          {fullDays > 0 ? (
            <>
              {" · "}
              <b>{fullDays}</b> dolu gün
            </>
          ) : null}
        </span>
        <span>
          {emptyDays} gün boş
        </span>
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
    <div
      className="month"
      style={{
        padding: "12px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
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
