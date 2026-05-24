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
import { productLabel } from "@/lib/products";

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
      className="card ov-cal-card"
      style={{
        padding: 0,
        minWidth: 0,
        // flex column → ajanda alanı flex:1, footer margin-top:auto ile alta
        // yapışır. .grid2 align-items:stretch ile bu kart sağ panel kadar uzar.
        // Yükseklik viewport'a sabit (.ov-cal-card globals.css) → iç scroll.
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
// Embed Day — Hero Now + compact timeline (collapsed empty bands).
// ─────────────────────────────────────────────────────────

// Format a minutes-from-now value into "X dk sonra" / "X sa Y dk sonra".
function formatUntil(mins: number): string {
  if (mins <= 0) return "Şu an";
  if (mins < 60) return `${mins} dk sonra`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} sa sonra` : `${h} sa ${m} dk sonra`;
}

function endTime(start: string, durationMinutes: number): string {
  const s = parseHHMM(start) + (durationMinutes || 60);
  const h = Math.floor(s / 60);
  const m = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
  const dayItems = useMemo(
    () =>
      items
        .filter(
          (r) =>
            isSameLocalDay(new Date(r.visitDate), date) &&
            (r.status === "APPROVED" || r.status === "PENDING_APPROVAL"),
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [items, date],
  );

  // Mount-time "now" — Guardian decision: no setInterval, static label.
  const now = useMemo(() => new Date(), []);
  const isToday = isSameLocalDay(now, date);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const totalGuests = dayItems.reduce((s, r) => s + (r.groupSize || 0), 0);
  const pendingCount = dayItems.filter((r) => r.status === "PENDING_APPROVAL").length;

  // Find the "hero" visit: next upcoming for today, else first of the day.
  const heroVisit = useMemo(() => {
    if (dayItems.length === 0) return null;
    if (!isToday) return dayItems[0];
    const upcoming = dayItems.find((r) => parseHHMM(r.startTime) >= nowMin);
    return upcoming ?? dayItems[dayItems.length - 1];
  }, [dayItems, isToday, nowMin]);

  const heroUntilLabel = useMemo(() => {
    if (!heroVisit) return null;
    if (!isToday) return "Bu gün";
    const diff = parseHHMM(heroVisit.startTime) - nowMin;
    return formatUntil(diff);
  }, [heroVisit, isToday, nowMin]);

  // Compute morning / evening empty bands around populated hours.
  // Boundaries: 09:00 morning start, 13:00 split, 19:00 evening end.
  const firstStart = dayItems.length > 0 ? parseHHMM(dayItems[0].startTime) : null;
  const lastStart =
    dayItems.length > 0 ? parseHHMM(dayItems[dayItems.length - 1].startTime) : null;
  const morningEmpty = !dayClosed && (firstStart === null || firstStart >= 13 * 60);
  const eveningEmpty = !dayClosed && (lastStart === null || lastStart < 13 * 60);

  // Empty card content — closed or no visits.
  if (dayItems.length === 0) {
    return (
      <>
        <div className="ovd-empty">
          <div className="ic">○</div>
          <div className="t">
            {dayClosed ? (
              <>Bu gün <em>kapalı</em></>
            ) : (
              <>Bu gün <em>rezervasyon</em> yok</>
            )}
          </div>
        </div>
        <div className="ovd-foot">
          <span>Toplam <b>0</b> ziyaret</span>
          <span>{dayClosed ? "Kapalı" : "Tüm gün müsait"}</span>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Hero: now / next upcoming visit */}
      {heroVisit && (
        <div className="ovd-hero">
          <div className="ovd-tag">
            <span className="dot" />
            {isToday ? "Sıradaki ziyaret" : "İlk ziyaret"}
            {heroUntilLabel && isToday ? ` · ${heroUntilLabel}` : null}
          </div>
          <div
            className="ovd-row"
            onClick={() => onSlotClick(heroVisit.id)}
            role="button"
            style={{ cursor: "pointer" }}
          >
            <div className="ovd-time">
              {heroVisit.startTime.split(":")[0]}
              <span className="min">:{heroVisit.startTime.split(":")[1]}</span>
            </div>
            <div className="ovd-meta">
              <div className="ovd-name">{heroVisit.visitor?.name ?? "—"}</div>
              <div className="ovd-sub">
                <span>{heroVisit.groupSize} kişi</span>
                {heroVisit.product && (
                  <>
                    <span className="sep">·</span>
                    <span
                      style={{
                        fontFamily: "var(--grotesk)",
                        fontSize: "10px",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "rgba(124,58,237,0.18)",
                        color: "var(--accent4)",
                        border: "1px solid rgba(124,58,237,0.35)",
                      }}
                    >
                      {productLabel(heroVisit.product)}
                    </span>
                  </>
                )}
                {heroVisit.status === "PENDING_APPROVAL" && (
                  <>
                    <span className="sep">·</span>
                    <span className="pend">Onay bekliyor</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary chips */}
      <div className="ovd-summary">
        <div className="ovd-chip">
          <span className="v">{dayItems.length}</span>
          <span className="l">Ziyaret</span>
        </div>
        <div className="ovd-chip">
          <span className="v">{totalGuests}</span>
          <span className="l">Misafir</span>
        </div>
        {pendingCount > 0 ? (
          <div className="ovd-chip warn">
            <span className="v">{pendingCount}</span>
            <span className="l">Onay bekliyor</span>
          </div>
        ) : (
          <div className="ovd-chip">
            <span className="v">0</span>
            <span className="l">Bekleyen</span>
          </div>
        )}
      </div>

      {/* Compact timeline — only populated rows + collapsed empty bands */}
      <div className="ovd-tl">
        <div className="ovd-tl-h">Bugünün Programı</div>

        {morningEmpty && (
          <div className="ovd-band">
            <span className="ic">○</span>
            <span className="lbl">Sabah müsait</span>
            <span className="rng-x">09:00 – 13:00</span>
          </div>
        )}

        {dayItems.map((r) => {
          const isPending = r.status === "PENDING_APPROVAL";
          return (
            <div key={r.id} className={`ovd-tlrow${isPending ? " pend" : ""}`}>
              <div className="ovd-tt">{r.startTime}</div>
              <div
                className={`ovd-tcard${isPending ? " pend" : ""}`}
                onClick={() => onSlotClick(r.id)}
                role="button"
              >
                <div className="ovd-top">
                  <span className="ovd-tname">{r.visitor?.name ?? "—"}</span>
                  <span className="ovd-trange">
                    {r.startTime} – {endTime(r.startTime, r.durationMinutes)}
                  </span>
                </div>
                <div className="ovd-tmeta">
                  <span>{r.groupSize} kişi</span>
                  <span className="sep">·</span>
                  <span className={`ovd-tstatus ${isPending ? "pend" : "ok"}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {eveningEmpty && dayItems.length > 0 && (
          <div className="ovd-band">
            <span className="ic">○</span>
            <span className="lbl">Akşam müsait</span>
            <span className="rng-x">17:00 – 19:00</span>
          </div>
        )}
      </div>

      <div className="ovd-foot">
        <span>
          {isToday ? "Bugün" : "Bu gün"} <b>{dayItems.length}</b> ziyaret · <b>{totalGuests}</b> misafir
        </span>
        <span>
          {pendingCount > 0 ? `${pendingCount} onay bekliyor` : "Hepsi onaylı"}
        </span>
      </div>
    </>
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

// Last name from full name — "Ahmet Yılmaz" → "Yılmaz". Used as the
// in-cell hint so the eye picks a person without reading the full string.
function lastName(full?: string | null): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

// Map a visit count to a density bucket (1–4) for the dot opacity.
function densityBucket(count: number): 1 | 2 | 3 | 4 {
  if (count >= 5) return 4;
  if (count >= 3) return 3;
  if (count >= 2) return 2;
  return 1;
}

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

  // Month-level summary — only in-month, non-closed days with visits count.
  const monthStats = useMemo(() => {
    let totalVisits = 0;
    let totalGuests = 0;
    let fullDays = 0;
    let pendingCount = 0;
    for (const d of cells) {
      if (d.getMonth() !== anchor.getMonth()) continue;
      const list = byDay.get(toLocalIso(d)) ?? [];
      if (list.length === 0) continue;
      totalVisits += list.length;
      fullDays += 1;
      for (const r of list) {
        totalGuests += r.groupSize || 0;
        if (r.status === "PENDING_APPROVAL") pendingCount += 1;
      }
    }
    return { totalVisits, totalGuests, fullDays, pendingCount };
  }, [cells, byDay, anchor]);

  // Per-week visit totals for the bottom stripe. 6 rows × 7 cells; only count
  // in-month days so out-of-month padding does not inflate the bars.
  const weekStats = useMemo(() => {
    const rows: { visits: number; capacity: number; hasCurrent: boolean }[] = [];
    for (let w = 0; w < 6; w++) {
      let visits = 0;
      let capacity = 0;
      let hasCurrent = false;
      for (let i = 0; i < 7; i++) {
        const d = cells[w * 7 + i];
        if (!d) continue;
        if (d.getMonth() !== anchor.getMonth()) continue;
        capacity += 1;
        const list = byDay.get(toLocalIso(d)) ?? [];
        visits += list.length;
        if (isSameLocalDay(d, today)) hasCurrent = true;
      }
      if (capacity > 0) rows.push({ visits, capacity, hasCurrent });
    }
    const maxVisits = Math.max(1, ...rows.map((r) => r.visits));
    return { rows, maxVisits };
  }, [cells, byDay, anchor, today]);

  return (
    <>
      {/* Month hero — single-glance summary */}
      <div className="ovm-hero">
        <div className="ovm-hero-l">
          <div className="lbl">{MONTHS[anchor.getMonth()]} özeti</div>
          <div className="t">
            <b>{monthStats.totalVisits}</b> ziyaret · <em>{monthStats.fullDays}</em> dolu gün
          </div>
        </div>
        <div className="ovm-hero-r">
          <div className="ovm-stat">
            <div className="v">{monthStats.totalGuests}</div>
            <div className="l">Misafir</div>
          </div>
          {monthStats.pendingCount > 0 && (
            <div className="ovm-stat warn">
              <div className="v">{monthStats.pendingCount}</div>
              <div className="l">Bekliyor</div>
            </div>
          )}
        </div>
      </div>

      <div className="ovm-dow">
        {TR_DAYS_SHORT_MON.map((d, i) => (
          <span key={d} className={i >= 5 ? "we" : undefined}>
            {d}
          </span>
        ))}
      </div>

      <div className="ovm-grid">
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = isSameLocalDay(d, today);
          const iso = toLocalIso(d);
          const closed = blockedDays.has(iso);
          const dayItems = byDay.get(iso) ?? [];
          const busy = dayItems.length > 0 && !closed;

          // Build class string explicitly so we can read it.
          const classes = ["ovm-cell"];
          if (!inMonth) classes.push("dim");
          else if (closed) classes.push("closed");
          else if (busy) classes.push("busy");
          else classes.push("empty");
          if (isToday) classes.push("today");

          if (!inMonth) {
            return (
              <div key={d.toISOString()} className={classes.join(" ")}>
                <div className="top">
                  <span className="n">{d.getDate()}</span>
                </div>
              </div>
            );
          }

          if (closed) {
            return (
              <div
                key={d.toISOString()}
                className={classes.join(" ")}
                onClick={() => onDayClick(d)}
                role="button"
              >
                <div className="top">
                  <span className="n">{d.getDate()}</span>
                </div>
                <span className="tag">Kapalı</span>
              </div>
            );
          }

          if (!busy) {
            return (
              <div
                key={d.toISOString()}
                className={classes.join(" ")}
                onClick={() => onDayClick(d)}
                role="button"
              >
                <div className="top">
                  <span className="n">{d.getDate()}</span>
                </div>
                <span className="midline" />
              </div>
            );
          }

          // Busy cell — pick first visitor's surname + extra count badge.
          const first = dayItems[0];
          const extra = dayItems.length - 1;
          const hintBase = lastName(first?.visitor?.name);
          const hint = extra > 0 ? `${hintBase} +${extra}` : hintBase || "—";
          const bucket = densityBucket(dayItems.length);

          return (
            <div
              key={d.toISOString()}
              className={classes.join(" ")}
              onClick={() => onDayClick(d)}
              role="button"
            >
              <div className="top">
                <span className="n">{d.getDate()}</span>
                <span className={`dot d${bucket}`} />
              </div>
              <div className="bot">
                <span className="hint">{hint}</span>
                <span className="cnt">
                  <b>{dayItems.length}</b> ziyaret
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Week stripe — real horizontal bars per week */}
      {weekStats.rows.length > 0 && (
        <div className="ovm-wstripe">
          <div className="ovm-wstripe-h">
            <span>Haftalık dağılım</span>
            <span style={{ color: "var(--accent4)" }}>
              {monthStats.totalVisits} toplam
            </span>
          </div>
          {weekStats.rows.map((row, i) => {
            const pct = Math.round((row.visits / weekStats.maxVisits) * 100);
            return (
              <div
                key={i}
                className={`ovm-wrow${row.hasCurrent ? " current" : ""}`}
              >
                <span className="wn">Hafta {i + 1}</span>
                <span className="bar">
                  <span className="fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="wv">
                  {row.visits}
                  <span className="ws">/{row.capacity}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="ovm-foot">
        <span>
          {MONTHS[anchor.getMonth()]} <b>{monthStats.totalVisits}</b> ziyaret · <b>{monthStats.fullDays}</b> dolu gün
        </span>
        <span>
          {monthStats.pendingCount > 0
            ? `${monthStats.pendingCount} onay bekliyor`
            : "Hepsi onaylı"}
        </span>
      </div>
    </>
  );
}
