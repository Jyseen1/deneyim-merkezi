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
  TR_DAYS,
  TR_DAYS_SHORT_MON,
  calendarCells,
  formatTrLongDate,
  formatTrMonthYear,
  isSameLocalDay,
  mondayIndex,
  monthRange,
  toLocalIso,
} from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/useToast";
import { ReservationDrawer } from "@/components/ReservationDrawer";
import {
  BlockDayModal,
  BlockRangeModal,
  RecurringRuleModal,
  EmptyCellMenu,
  BlockDetailModal,
  ManageBlocksModal,
  type SlotBlock,
  type RecurringRule,
} from "@/components/calendar/CalendarModals";

// ─────────────────────────────────────────────────────────
// Types + helpers
// ─────────────────────────────────────────────────────────

type CalendarView = "day" | "week" | "month";
const VIEW_KEY = "dm.calendarView";

type SettingsLite = {
  workStart: string;
  workEnd: string;
  defaultDuration: number;
};

const DEFAULT_SETTINGS: SettingsLite = {
  workStart: "09:00",
  workEnd: "19:00",
  defaultDuration: 120,
};

const MONTHS_TR = [
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

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function readView(): CalendarView {
  if (typeof window === "undefined") return "week";
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw === "day" || raw === "week" || raw === "month") return raw;
  } catch {
    /* sessiz */
  }
  return "week";
}
function writeView(v: CalendarView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* sessiz */
  }
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

function computePeriod(
  view: CalendarView,
  anchor: Date,
): { start: Date; end: Date } {
  if (view === "day") {
    const s = startOfDay(anchor);
    return { start: s, end: addDays(s, 1) };
  }
  if (view === "week") {
    const s = startOfWeekMon(anchor);
    return { start: s, end: addDays(s, 7) };
  }
  const r = monthRange(anchor.getFullYear(), anchor.getMonth());
  return { start: r.start, end: r.end };
}

function shiftAnchor(view: CalendarView, anchor: Date, dir: -1 | 1): Date {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, dir * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

function periodTitle(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return `${formatTrLongDate(anchor)} · ${TR_DAYS[anchor.getDay()]}`;
  }
  if (view === "week") {
    const start = startOfWeekMon(anchor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${MONTHS_TR[start.getMonth()]} ${start.getFullYear()}`;
    }
    return `${formatTrLongDate(start)} – ${formatTrLongDate(end)}`;
  }
  return formatTrMonthYear(anchor.getFullYear(), anchor.getMonth());
}

// ─────────────────────────────────────────────────────────
// Ana sayfa
// ─────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const token = useBackendToken();
  const { show } = useToast();

  const [view, setViewState] = useState<CalendarView>("week");
  useEffect(() => {
    setViewState(readView());
  }, []);
  const setView = (v: CalendarView) => {
    setViewState(v);
    writeView(v);
  };

  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const period = useMemo(
    () => computePeriod(view, anchorDate),
    [view, anchorDate],
  );

  const [items, setItems] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<SlotBlock[]>([]);
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);
  const [settings, setSettings] = useState<SettingsLite>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [blockDayOpen, setBlockDayOpen] = useState(false);
  const [blockRangeOpen, setBlockRangeOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [activeReservationId, setActiveReservationId] = useState<string | null>(
    null,
  );
  const [emptyMenu, setEmptyMenu] = useState<{
    date: string;
    time?: string;
  } | null>(null);
  const [blockDetail, setBlockDetail] = useState<
    | { kind: "block"; data: SlotBlock }
    | { kind: "recurring"; data: RecurringRule }
    | null
  >(null);
  const [manageOpen, setManageOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    const startISO = toLocalIso(period.start);
    const endISO = toLocalIso(addDays(period.end, -1));

    try {
      const resvRes = await apiFetch<ReservationList>(
        `/reservations?date_from=${startISO}&date_to=${endISO}&limit=500`,
        {},
        token,
      );
      setItems(resvRes.items);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `Rezervasyonlar yüklenemedi (HTTP ${err.status}): ${err.message}`
          : `Rezervasyonlar yüklenemedi: ${(err as Error).message}`;
      setLoadError(msg);
      setItems([]);
    }

    const [blocksRes, recurRes, settingsRes] = await Promise.all([
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
      apiFetch<SettingsLite>("/settings", {}, token).catch(
        () => DEFAULT_SETTINGS,
      ),
    ]);
    setBlocks(blocksRes.items);
    setRecurring(recurRes.items);
    setSettings({
      workStart: settingsRes.workStart || DEFAULT_SETTINGS.workStart,
      workEnd: settingsRes.workEnd || DEFAULT_SETTINGS.workEnd,
      defaultDuration:
        settingsRes.defaultDuration || DEFAULT_SETTINGS.defaultDuration,
    });

    setLoading(false);
  }, [period.start, period.end, token]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  const title = periodTitle(view, anchorDate);
  const rezCount = items.length;
  const rezLabel =
    view === "day"
      ? `${rezCount} ziyaret`
      : `${rezCount} rezervasyon`;

  function openNewReservation(date?: string, time?: string) {
    if (typeof window === "undefined") return;
    const q: string[] = [];
    if (date) q.push(`date=${date}`);
    if (time) q.push(`time=${time}`);
    const qs = q.length ? `?${q.join("&")}` : "";
    window.open(`/rezervasyon${qs}`, "_blank");
  }

  function goToDay(d: Date) {
    setAnchorDate(d);
    setView("day");
  }

  return (
    <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
      {/* TOPBAR */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div>
          <h1
            className="font-display"
            style={{
              fontSize: "28px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--txt)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Takvim
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            Rezervasyonlar,{" "}
            <span
              className="font-serif font-italic"
              style={{ color: "var(--accent3)" }}
            >
              kapatmalar
            </span>{" "}
            ve{" "}
            <span
              className="font-serif font-italic"
              style={{ color: "var(--accent3)" }}
            >
              kurallar
            </span>{" "}
            tek yerde.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openNewReservation()}
          >
            + Rezervasyon
          </button>
          <button
            type="button"
            className="btn btn-red"
            onClick={() => setBlockDayOpen(true)}
          >
            Gün Kapat
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setBlockRangeOpen(true)}
          >
            Tatil Ekle
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRecurringOpen(true)}
          >
            Tekrarlayan Kural
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setManageOpen(true)}
          >
            Aktif Kapatmalar
          </button>
        </div>
      </div>

      {/* CONTROL BAR — navigasyon (sol) + rezcount + segment (sağ) */}
      <div
        className="fade-up fade-up-1"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "14px",
        }}
      >
        <div className="navg">
          <button
            type="button"
            className="today"
            onClick={() => setAnchorDate(new Date())}
          >
            Bugün
          </button>
          <button
            type="button"
            className="arr"
            aria-label="Önceki"
            onClick={() => setAnchorDate(shiftAnchor(view, anchorDate, -1))}
          >
            ‹
          </button>
          <span className="rng">{title}</span>
          <button
            type="button"
            className="arr"
            aria-label="Sonraki"
            onClick={() => setAnchorDate(shiftAnchor(view, anchorDate, 1))}
          >
            ›
          </button>
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}
        >
          <span className="rezcount" title="Bu periyotta yüklenen kayıt sayısı">
            <em>{rezLabel}</em>
          </span>
          <div className="seg" role="tablist" aria-label="Takvim modu">
            {(["day", "week", "month"] as CalendarView[]).map((v) => (
              <b
                key={v}
                role="tab"
                aria-selected={view === v}
                className={view === v ? "on" : ""}
                onClick={() => setView(v)}
                style={{
                  /* takvim segmenti referansta mor solid — globals beyaz tonu var, override et */
                  background:
                    view === v ? "var(--accent)" : "transparent",
                  color: view === v ? "#fff" : "var(--muted)",
                }}
              >
                {v === "day" ? "Gün" : v === "week" ? "Hafta" : "Ay"}
              </b>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <div
          className="fade-up"
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            color: "var(--red)",
            borderRadius: "12px",
            fontSize: "13px",
          }}
        >
          {loadError}
        </div>
      )}

      {/* MAIN VIEW */}
      <div style={{ position: "relative" }}>
        {view === "day" && (
          <DayBusy
            date={anchorDate}
            items={items}
            blocks={blocks}
            recurring={recurring}
            settings={settings}
            onSlotClick={(id) => setActiveReservationId(id)}
            onEmptyClick={(date, time) => setEmptyMenu({ date, time })}
            onBlockClick={(b) => setBlockDetail({ kind: "block", data: b })}
            onRecurringClick={(r) =>
              setBlockDetail({ kind: "recurring", data: r })
            }
          />
        )}
        {view === "week" && (
          <HeatWeek
            weekStart={startOfWeekMon(anchorDate)}
            items={items}
            blocks={blocks}
            recurring={recurring}
            onDayClick={(d) => goToDay(d)}
          />
        )}
        {view === "month" && (
          <MonthHeat
            anchor={anchorDate}
            items={items}
            blocks={blocks}
            recurring={recurring}
            onDayClick={(d) => goToDay(d)}
          />
        )}
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 12,
              fontSize: "11px",
              color: "var(--muted)",
            }}
          >
            Yükleniyor…
          </div>
        )}
      </div>

      {/* Yardım şeridi */}
      <div className="legend">
        {view === "day" &&
          "Saat satırına tıklayınca o slottaki rezervasyon detayı açılır · boş slota tıklayınca hızlı rezervasyon"}
        {view === "week" &&
          "Her gün kartına tıklayınca o günün Gün görünümü (saat saat ajanda) açılır"}
        {view === "month" &&
          "Bar yüksekliği o günkü kişi sayısını gösterir · güne tıklayınca Gün görünümü açılır"}
      </div>

      {/* Modals */}
      {blockDayOpen && (
        <BlockDayModal
          defaultDate={toLocalIso(anchorDate)}
          token={token}
          onClose={() => setBlockDayOpen(false)}
          onSuccess={(msg) => {
            show(msg, "success");
            setBlockDayOpen(false);
            load();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}
      {blockRangeOpen && (
        <BlockRangeModal
          defaultDate={toLocalIso(anchorDate)}
          token={token}
          onClose={() => setBlockRangeOpen(false)}
          onSuccess={(msg) => {
            show(msg, "success");
            setBlockRangeOpen(false);
            load();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}
      {recurringOpen && (
        <RecurringRuleModal
          token={token}
          onClose={() => setRecurringOpen(false)}
          onSuccess={(msg) => {
            show(msg, "success");
            setRecurringOpen(false);
            load();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}
      {emptyMenu && (
        <EmptyCellMenu
          date={emptyMenu.date}
          time={emptyMenu.time}
          token={token}
          onClose={() => setEmptyMenu(null)}
          onSuccess={(msg) => {
            show(msg, "success");
            setEmptyMenu(null);
            load();
          }}
          onError={(msg) => show(msg, "error")}
          onNewReservation={() =>
            openNewReservation(emptyMenu.date, emptyMenu.time)
          }
        />
      )}
      {blockDetail && (
        <BlockDetailModal
          detail={blockDetail}
          token={token}
          onClose={() => setBlockDetail(null)}
          onRemoved={(msg) => {
            show(msg, "info");
            setBlockDetail(null);
            load();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}
      {manageOpen && (
        <ManageBlocksModal
          token={token}
          onClose={() => setManageOpen(false)}
          onChanged={() => load()}
          onError={(msg) => show(msg, "error")}
          onSuccess={(msg) => show(msg, "info")}
        />
      )}

      <ReservationDrawer
        reservationId={activeReservationId}
        staffId={staffId}
        onClose={() => setActiveReservationId(null)}
        onMutated={load}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// HAFTA — referans HEAT (7 gün özet kart)
// ─────────────────────────────────────────────────────────

function HeatWeek({
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

  function dayResv(d: Date): Reservation[] {
    return items
      .filter(
        (r) =>
          isSameLocalDay(new Date(r.visitDate), d) &&
          (r.status === "APPROVED" || r.status === "PENDING_APPROVAL"),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  function dayFullClosed(d: Date): boolean {
    const iso = toLocalIso(d);
    const hasBlock = blocks.some(
      (b) => toLocalIso(new Date(b.slotDate)) === iso,
    );
    if (hasBlock) return true;
    return recurring.some(
      (r) =>
        r.dayOfWeek === d.getDay() &&
        parseHHMM(r.startTime) <= 9 * 60 &&
        parseHHMM(r.endTime) >= 19 * 60,
    );
  }

  // Bar yüksekliği: o günkü en yüksek kişi sayısına göre normalize
  const maxGuests = Math.max(
    1,
    ...days.flatMap((d) => dayResv(d).map((r) => r.groupSize)),
  );

  return (
    <div className="card">
      <div className="heat">
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
              }}
            >
              <div className="dow">{dow}</div>
              <div className="dn">{d.getDate()}</div>
              <div className="ht-bars">
                {resv.length === 0
                  ? null
                  : resv.slice(0, 6).map((r) => {
                      const h = Math.max(
                        6,
                        Math.round((r.groupSize / maxGuests) * 36),
                      );
                      return (
                        <span
                          key={r.id}
                          className="ht-bar"
                          style={{ height: `${h}px` }}
                          title={`${r.startTime} · ${r.visitor?.name ?? "?"} · ${r.groupSize} kişi`}
                        />
                      );
                    })}
              </div>
              {closed ? (
                <div className="ht-cnt closed">Kapalı</div>
              ) : resv.length === 0 ? (
                <div className="ht-cnt zero">boş</div>
              ) : (
                <div className="ht-cnt">
                  {resv.length} {resv.length === 1 ? "ziyaret" : "ziyaret"}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// GÜN — özet bandı + saat saat doluluk
// ─────────────────────────────────────────────────────────

function DayBusy({
  date,
  items,
  blocks,
  recurring,
  settings,
  onSlotClick,
  onEmptyClick,
  onBlockClick,
  onRecurringClick,
}: {
  date: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  settings: SettingsLite;
  onSlotClick: (id: string) => void;
  onEmptyClick: (date: string, time: string) => void;
  onBlockClick: (b: SlotBlock) => void;
  onRecurringClick: (r: RecurringRule) => void;
}) {
  const iso = toLocalIso(date);
  const dayItems = items
    .filter((r) => isSameLocalDay(new Date(r.visitDate), date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const activeItems = dayItems.filter(
    (r) => r.status === "APPROVED" || r.status === "PENDING_APPROVAL",
  );

  const totalGuests = activeItems.reduce((s, r) => s + r.groupSize, 0);

  // Doluluk %: çalışma saatlerinin ne kadarı dolu (saat sayısı bazlı kaba ölçüm)
  const workStart = parseHHMM(settings.workStart);
  const workEnd = parseHHMM(settings.workEnd);
  const workMinutes = Math.max(60, workEnd - workStart);
  const busyMinutes = activeItems.reduce((s, r) => s + r.durationMinutes, 0);
  const utilization = Math.min(
    100,
    Math.round((busyMinutes / workMinutes) * 100),
  );

  const hours: number[] = [];
  for (let h = workStart; h < workEnd; h += 60) {
    hours.push(h);
  }

  function blockAt(h: number): SlotBlock | undefined {
    const hm = h;
    const hmEnd = h + 60;
    return blocks.find(
      (b) =>
        toLocalIso(new Date(b.slotDate)) === iso &&
        parseHHMM(b.startTime) < hmEnd &&
        parseHHMM(b.endTime) > hm,
    );
  }
  function recurAt(h: number): RecurringRule | undefined {
    const hm = h;
    const hmEnd = h + 60;
    return recurring.find(
      (r) =>
        r.dayOfWeek === date.getDay() &&
        parseHHMM(r.startTime) < hmEnd &&
        parseHHMM(r.endTime) > hm,
    );
  }
  function resvAt(h: number): Reservation[] {
    const hm = h;
    const hmEnd = h + 60;
    return activeItems.filter((r) => {
      const rs = parseHHMM(r.startTime);
      return rs >= hm && rs < hmEnd;
    });
  }

  function hhmm(h: number): string {
    return `${String(Math.floor(h / 60)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}`;
  }

  return (
    <div className="card day-wrap">
      <div className="day-summary">
        <div className="day-big">
          <div className="dn">
            <em>{date.getDate()}</em>
          </div>
          <div className="dow">{TR_DAYS[date.getDay()]}</div>
        </div>
        <div className="day-stats">
          <div className="day-stat">
            <div className="v mor">{activeItems.length}</div>
            <div className="l">Ziyaret</div>
          </div>
          <div className="day-stat">
            <div className="v">{totalGuests}</div>
            <div className="l">Toplam kişi</div>
          </div>
          <div className="day-stat">
            <div className="v">
              {utilization}
              <span style={{ fontSize: "14px", color: "var(--muted2)" }}>%</span>
            </div>
            <div className="l">Doluluk</div>
          </div>
        </div>
      </div>

      {hours.map((h) => {
        const block = blockAt(h);
        const recur = !block ? recurAt(h) : undefined;
        const resv = block || recur ? [] : resvAt(h);
        const timeStr = hhmm(h);

        return (
          <div key={h} className="hrow">
            <div className="ht">{timeStr}</div>
            {block ? (
              <div
                className="track"
                onClick={() => onBlockClick(block)}
                role="button"
              >
                <div className="fill closed">
                  <span className="who">🔒 {block.blockReason ?? "Kapalı"}</span>
                  <span className="mt">{block.startTime}–{block.endTime}</span>
                </div>
              </div>
            ) : recur ? (
              <div
                className="track"
                onClick={() => onRecurringClick(recur)}
                role="button"
              >
                <div className="fill closed">
                  <span className="who">↻ {recur.reason ?? "Haftalık kapalı"}</span>
                  <span className="mt">{recur.startTime}–{recur.endTime}</span>
                </div>
              </div>
            ) : resv.length === 0 ? (
              <div
                className="track"
                onClick={() => onEmptyClick(iso, timeStr)}
                role="button"
              >
                <div className="empty">Müsait</div>
              </div>
            ) : (
              <div
                className="track"
                onClick={() => onSlotClick(resv[0].id)}
                role="button"
              >
                <div
                  className={`fill ${
                    resv[0].status === "PENDING_APPROVAL" ? "pend" : "busy"
                  }`}
                >
                  <span className="who">{resv[0].visitor?.name ?? "?"}</span>
                  <span className="mt">
                    {resv[0].startTime !== timeStr
                      ? `${resv[0].startTime} · `
                      : ""}
                    {resv[0].groupSize} kişi · {STATUS_LABEL[resv[0].status]}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// AY — referans mini bar yoğunluk
// ─────────────────────────────────────────────────────────

function MonthHeat({
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
    if (recurring.length > 0) {
      for (const d of cells) {
        const rule = recurring.find((r) => r.dayOfWeek === d.getDay());
        if (rule) m.add(toLocalIso(d));
      }
    }
    return m;
  }, [blocks, recurring, cells]);

  const maxGuestsInMonth = Math.max(
    1,
    ...Array.from(byDay.values()).flatMap((arr) =>
      arr.map((r) => r.groupSize),
    ),
  );

  return (
    <div className="card month">
      <div className="m-dow">
        {TR_DAYS_SHORT_MON.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="m-grid">
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
            >
              <div className="n">{d.getDate()}</div>
              {closed ? (
                <div className="closed-tag">Kapalı</div>
              ) : dayItems.length > 0 ? (
                <>
                  <div className="mbars">
                    {dayItems.slice(0, 6).map((r) => {
                      const h = Math.max(
                        4,
                        Math.round((r.groupSize / maxGuestsInMonth) * 24),
                      );
                      return (
                        <span
                          key={r.id}
                          className="m-bar"
                          style={{ height: `${h}px` }}
                        />
                      );
                    })}
                  </div>
                  <div className="mcnt">{dayItems.length} ziyaret</div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
