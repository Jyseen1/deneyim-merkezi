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
import { ToastViewport } from "@/components/ToastViewport";
import { ReservationDrawer } from "@/components/ReservationDrawer";

// ─────────────────────────────────────────────────────────
// Types + sabitler
// ─────────────────────────────────────────────────────────

type CalendarView = "day" | "week" | "month";
const VIEW_KEY = "dm.calendarView";

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

const STATUS_COLORS: Record<
  ReservationStatus,
  { bg: string; border: string; fg: string }
> = {
  PENDING_APPROVAL: { bg: "#ef9f27", border: "#d97706", fg: "#7c2d12" },
  APPROVED: { bg: "#1d9e75", border: "#15835f", fg: "#e7fbf3" },
  REJECTED: { bg: "#fee2e2", border: "#fca5a5", fg: "#7f1d1d" },
  CANCELLED: { bg: "#e2e8f0", border: "#94a3b8", fg: "#1e293b" },
  COMPLETED: { bg: "#dbeafe", border: "#93c5fd", fg: "#1e3a8a" },
  NO_SHOW: { bg: "#ffedd5", border: "#fdba74", fg: "#7c2d12" },
};

const DAYS_FULL = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

const CLOSE_REASONS = ["Bakım", "Özel Etkinlik", "Dolu", "Diğer"];

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
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
  const idx = mondayIndex(d); // 0 = Pzt
  return addDays(startOfDay(d), -idx);
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
  // month
  const d = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return d;
}

function periodTitle(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return `${formatTrLongDate(anchor)} ${TR_DAYS[anchor.getDay()]}`;
  }
  if (view === "week") {
    const start = startOfWeekMon(anchor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][start.getMonth()]} ${start.getFullYear()}`;
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
  const { toasts, show, dismiss } = useToast();

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
    const startISO = toLocalIso(period.start);
    const lastDay = addDays(period.end, -1);
    const endISO = toLocalIso(lastDay);
    try {
      const [resvRes, blocksRes, recurRes, settingsRes] = await Promise.all([
        apiFetch<ReservationList>(
          `/reservations?date_from=${startISO}&date_to=${endISO}&limit=300`,
          {},
          token,
        ).catch(() => ({ items: [] as Reservation[], total: 0, page: 1, limit: 300 })),
        apiFetch<{ items: SlotBlock[] }>(
          `/slots/blocks?date_from=${startISO}&date_to=${endISO}`,
          {},
          token,
        ).catch(() => ({ items: [] as SlotBlock[] })),
        apiFetch<{ items: RecurringRule[] }>("/slots/recurring", {}, token).catch(
          () => ({ items: [] as RecurringRule[] }),
        ),
        apiFetch<SettingsLite>("/settings", {}, token).catch(
          () => DEFAULT_SETTINGS,
        ),
      ]);
      setItems(resvRes.items);
      setBlocks(blocksRes.items);
      setRecurring(recurRes.items);
      setSettings({
        workStart: settingsRes.workStart || DEFAULT_SETTINGS.workStart,
        workEnd: settingsRes.workEnd || DEFAULT_SETTINGS.workEnd,
        defaultDuration:
          settingsRes.defaultDuration || DEFAULT_SETTINGS.defaultDuration,
      });
    } finally {
      setLoading(false);
    }
  }, [period.start, period.end, token]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime({
    onNewReservation: () => load(),
    onReservationUpdated: () => load(),
  });

  const title = periodTitle(view, anchorDate);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
      {/* HEADER */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div style={{ minWidth: 0 }}>
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
            Rezervasyonlar, kapatmalar ve kurallar tek yerde.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <ActionPillButton
            label="+ Rezervasyon"
            tone="primary"
            onClick={() =>
              typeof window !== "undefined" &&
              window.open("/rezervasyon", "_blank")
            }
          />
          <ActionPillButton
            label="Gün Kapat"
            tone="danger"
            onClick={() => setBlockDayOpen(true)}
          />
          <ActionPillButton
            label="Tatil Ekle"
            onClick={() => setBlockRangeOpen(true)}
          />
          <ActionPillButton
            label="Tekrarlayan Kural"
            onClick={() => setRecurringOpen(true)}
          />
          <ActionPillButton
            label="Aktif Kapatmalar"
            onClick={() => setManageOpen(true)}
          />
        </div>
      </div>

      {/* SUB-HEADER: navigation + view switcher */}
      <div
        className="fade-up fade-up-1"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(209,196,255,0.6)",
            borderRadius: "99px",
            padding: "4px 4px 4px 12px",
          }}
        >
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: "99px",
              border: "1px solid #ede9fe",
              background: "rgba(255,255,255,0.8)",
              color: "#4338ca",
              cursor: "pointer",
            }}
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(shiftAnchor(view, anchorDate, -1))}
            aria-label="Önceki"
            style={navArrow()}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#1e1b4b",
              minWidth: "180px",
              textAlign: "center",
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={() => setAnchorDate(shiftAnchor(view, anchorDate, 1))}
            aria-label="Sonraki"
            style={navArrow()}
          >
            ›
          </button>
        </div>

        <ViewSwitcher view={view} onChange={setView} />
      </div>

      {/* MAIN VIEW */}
      <div style={{ position: "relative" }}>
        {view === "week" && (
          <WeekView
            period={period}
            items={items}
            blocks={blocks}
            recurring={recurring}
            settings={settings}
            onReservationClick={(id) => setActiveReservationId(id)}
            onEmptyCellClick={(date, time) => setEmptyMenu({ date, time })}
            onBlockClick={(b) => setBlockDetail({ kind: "block", data: b })}
            onRecurringClick={(r) =>
              setBlockDetail({ kind: "recurring", data: r })
            }
          />
        )}
        {view === "day" && (
          <DayView
            date={anchorDate}
            items={items}
            blocks={blocks}
            recurring={recurring}
            settings={settings}
            onReservationClick={(id) => setActiveReservationId(id)}
            onEmptyCellClick={(date, time) => setEmptyMenu({ date, time })}
            onBlockClick={(b) => setBlockDetail({ kind: "block", data: b })}
            onRecurringClick={(r) =>
              setBlockDetail({ kind: "recurring", data: r })
            }
          />
        )}
        {view === "month" && (
          <MonthView
            anchorDate={anchorDate}
            items={items}
            blocks={blocks}
            recurring={recurring}
            onDayClick={(d) => {
              setAnchorDate(d);
              setView("day");
            }}
          />
        )}
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 12,
              fontSize: "11px",
              color: "#a5b4fc",
            }}
          >
            Yükleniyor…
          </div>
        )}
      </div>

      <Legend />

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
            typeof window !== "undefined" &&
            window.open(
              `/rezervasyon?date=${emptyMenu.date}${emptyMenu.time ? `&time=${emptyMenu.time}` : ""}`,
              "_blank",
            )
          }
        />
      )}
      {blockDetail && (
        <BlockDetailModal
          detail={blockDetail}
          token={token}
          onClose={() => setBlockDetail(null)}
          onRemoved={(msg) => {
            show(msg, "success");
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
          onSuccess={(msg) => show(msg, "success")}
        />
      )}

      <ReservationDrawer
        reservationId={activeReservationId}
        staffId={staffId}
        onClose={() => setActiveReservationId(null)}
        onMutated={load}
      />

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function ActionPillButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone?: "primary" | "danger";
  onClick: () => void;
}) {
  const base: React.CSSProperties = {
    padding: "7px 14px",
    fontSize: "12px",
    fontWeight: 600,
    borderRadius: "99px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
  };
  let style: React.CSSProperties;
  if (tone === "primary") {
    style = {
      ...base,
      background: "#4338ca",
      border: "1px solid #4338ca",
      color: "#e0e7ff",
    };
  } else if (tone === "danger") {
    style = {
      ...base,
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.3)",
      color: "#ef4444",
    };
  } else {
    style = {
      ...base,
      background: "rgba(255,255,255,0.7)",
      border: "1px solid rgba(209,196,255,0.6)",
      color: "#4338ca",
    };
  }
  return (
    <button type="button" onClick={onClick} style={style}>
      {label}
    </button>
  );
}

function navArrow(): React.CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: "#4338ca",
    fontSize: "20px",
    lineHeight: 1,
    cursor: "pointer",
  };
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  const opts: { v: CalendarView; label: string }[] = [
    { v: "day", label: "Gün" },
    { v: "week", label: "Hafta" },
    { v: "month", label: "Ay" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: "rgba(255,255,255,0.7)",
        border: "1px solid rgba(209,196,255,0.6)",
        borderRadius: "99px",
        padding: "4px",
        gap: "2px",
      }}
    >
      {opts.map((o) => {
        const active = view === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={active}
            style={{
              padding: "6px 16px",
              borderRadius: "99px",
              border: "none",
              background: active ? "#4338ca" : "transparent",
              color: active ? "#e0e7ff" : "#4338ca",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  const items: { color: string; label: string; outline?: boolean }[] = [
    { color: STATUS_COLORS.APPROVED.bg, label: "Onaylı" },
    { color: STATUS_COLORS.PENDING_APPROVAL.bg, label: "Bekliyor" },
    {
      color: "rgba(239,68,68,0.4)",
      label: "Kapalı",
    },
    { color: "#cbd5e1", label: "Çalışma dışı", outline: true },
  ];
  return (
    <div
      style={{
        marginTop: "14px",
        display: "flex",
        flexWrap: "wrap",
        gap: "14px",
        fontSize: "11px",
        color: "#818cf8",
      }}
    >
      {items.map((i) => (
        <div
          key={i.label}
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "3px",
              background: i.outline ? "transparent" : i.color,
              border: `1.5px solid ${i.color}`,
            }}
          />
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Week / Day grid (saat bazli)
// ─────────────────────────────────────────────────────────

type GridCellProps = {
  date: Date;
  hourStart: number; // dakika
  hourEnd: number; // dakika
  reservations: Reservation[];
  block?: SlotBlock;
  recurringRule?: RecurringRule;
  inWorkHours: boolean;
  onReservationClick: (id: string) => void;
  onEmptyClick: (date: string, time: string) => void;
  onBlockClick: (b: SlotBlock) => void;
  onRecurringClick: (r: RecurringRule) => void;
};

function HourCell(props: GridCellProps) {
  const {
    date,
    hourStart,
    reservations,
    block,
    recurringRule,
    inWorkHours,
    onReservationClick,
    onEmptyClick,
    onBlockClick,
    onRecurringClick,
  } = props;

  const isClosed = !!block || !!recurringRule;
  const blocked = block ?? null;
  const recur = !block ? recurringRule ?? null : null;

  return (
    <div
      style={{
        position: "relative",
        minHeight: "56px",
        background: !inWorkHours
          ? "repeating-linear-gradient(45deg, rgba(148,163,184,0.07) 0 6px, transparent 6px 12px)"
          : isClosed
            ? "rgba(239,68,68,0.10)"
            : "rgba(255,255,255,0.55)",
        border: "1px solid rgba(209,196,255,0.4)",
        borderTop: "none",
        borderLeft: "none",
        padding: reservations.length || isClosed ? "4px" : "0",
        cursor: inWorkHours && !isClosed ? "pointer" : "default",
        transition: "background 0.12s ease",
      }}
      onClick={() => {
        if (!inWorkHours) return;
        if (isClosed) {
          if (blocked) onBlockClick(blocked);
          else if (recur) onRecurringClick(recur);
          return;
        }
        if (reservations.length === 0) {
          onEmptyClick(toLocalIso(date), fmtMin(hourStart));
        }
      }}
    >
      {blocked && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBlockClick(blocked);
          }}
          style={blockChipStyle("#ef4444")}
          title={`Kapalı · ${blocked.blockReason ?? ""}`}
        >
          🔒 {blocked.blockReason ?? "Kapalı"}
        </button>
      )}
      {!blocked && recur && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRecurringClick(recur);
          }}
          style={blockChipStyle("#ef4444")}
          title={`Haftalık kapalı · ${recur.reason ?? ""}`}
        >
          ↻ {recur.reason ?? "Haftalık kapalı"}
        </button>
      )}
      {reservations.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReservationClick(r.id);
          }}
          style={reservationChipStyle(STATUS_COLORS[r.status])}
          title={`${r.startTime} · ${r.visitor?.name ?? ""} · ${STATUS_LABEL[r.status]}`}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {r.startTime}
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.visitor?.name ?? "?"}
          </span>
          <span style={{ fontSize: "10px", opacity: 0.9 }}>
            {r.groupSize} kişi
          </span>
        </button>
      ))}
    </div>
  );
}

function blockChipStyle(color: string): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    background: "rgba(239,68,68,0.18)",
    border: `1px dashed ${color}`,
    color: "#991b1b",
    borderRadius: "6px",
    padding: "4px 6px",
    fontSize: "10px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    marginBottom: "3px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

function reservationChipStyle(c: {
  bg: string;
  border: string;
  fg: string;
}): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.fg,
    borderRadius: "6px",
    padding: "4px 6px",
    cursor: "pointer",
    textAlign: "left",
    marginBottom: "3px",
    transition: "transform 0.12s ease",
    fontFamily: "inherit",
  };
}

function WeekView(props: {
  period: { start: Date; end: Date };
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  settings: SettingsLite;
  onReservationClick: (id: string) => void;
  onEmptyCellClick: (date: string, time: string) => void;
  onBlockClick: (b: SlotBlock) => void;
  onRecurringClick: (r: RecurringRule) => void;
}) {
  return (
    <DayWeekGrid
      days={Array.from({ length: 7 }, (_, i) => addDays(props.period.start, i))}
      {...props}
      compact
    />
  );
}

function DayView(props: {
  date: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  settings: SettingsLite;
  onReservationClick: (id: string) => void;
  onEmptyCellClick: (date: string, time: string) => void;
  onBlockClick: (b: SlotBlock) => void;
  onRecurringClick: (r: RecurringRule) => void;
}) {
  return (
    <DayWeekGrid
      days={[startOfDay(props.date)]}
      {...props}
      period={{ start: startOfDay(props.date), end: addDays(props.date, 1) }}
      compact={false}
    />
  );
}

function DayWeekGrid(props: {
  days: Date[];
  period: { start: Date; end: Date };
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  settings: SettingsLite;
  compact: boolean;
  onReservationClick: (id: string) => void;
  onEmptyCellClick: (date: string, time: string) => void;
  onBlockClick: (b: SlotBlock) => void;
  onRecurringClick: (r: RecurringRule) => void;
}) {
  const {
    days,
    items,
    blocks,
    recurring,
    settings,
    compact,
    onReservationClick,
    onEmptyCellClick,
    onBlockClick,
    onRecurringClick,
  } = props;

  const today = useMemo(() => new Date(), []);
  const workStart = parseHHMM(settings.workStart);
  const workEnd = parseHHMM(settings.workEnd);
  // 09:00 ile 19:00 arasi 1 saatlik hucreler; calisma saatinin disindaki
  // saatleri de gosteriyoruz (cizgili, kapali) — kullanici workEnd sonrasi
  // hicbir sey gormesin diye sadece work araliginda render edelim.
  const hours: { start: number; end: number }[] = [];
  for (let m = workStart; m < workEnd; m += 60) {
    hours.push({ start: m, end: Math.min(m + 60, workEnd) });
  }

  // O hucreye dusen rezervasyonlari bul
  function resInCell(d: Date, hourStart: number, hourEnd: number) {
    return items.filter((r) => {
      if (!isSameLocalDay(new Date(r.visitDate), d)) return false;
      const rs = parseHHMM(r.startTime);
      return rs >= hourStart && rs < hourEnd;
    });
  }

  // Hücreyi kapatan blok (slot blocks); recurring kural farkli ele alinir
  function blockInCell(d: Date, hourStart: number, hourEnd: number) {
    const iso = toLocalIso(d);
    return blocks.find((b) => {
      if (toLocalIso(new Date(b.slotDate)) !== iso) return false;
      const bs = parseHHMM(b.startTime);
      const be = parseHHMM(b.endTime);
      return bs < hourEnd && be > hourStart;
    });
  }
  function recurringInCell(d: Date, hourStart: number, hourEnd: number) {
    const dow = d.getDay();
    return recurring.find((r) => {
      if (r.dayOfWeek !== dow) return false;
      const rs = parseHHMM(r.startTime);
      const re = parseHHMM(r.endTime);
      return rs < hourEnd && re > hourStart;
    });
  }

  return (
    <div
      className="glass fade-up fade-up-2"
      style={{
        padding: "0",
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `64px repeat(${days.length}, minmax(${compact ? "110px" : "200px"}, 1fr))`,
            minWidth: compact ? `${64 + days.length * 110}px` : "auto",
          }}
        >
          {/* Header row */}
          <div
            style={{
              padding: "12px 8px",
              fontSize: "10px",
              fontWeight: 600,
              color: "#818cf8",
              textAlign: "center",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderBottom: "1px solid rgba(209,196,255,0.5)",
              background: "rgba(245,243,255,0.6)",
            }}
          >
            Saat
          </div>
          {days.map((d, i) => {
            const isToday = isSameLocalDay(d, today);
            const isWeekendClosed =
              recurring.some(
                (r) => r.dayOfWeek === d.getDay() &&
                  parseHHMM(r.startTime) <= workStart &&
                  parseHHMM(r.endTime) >= workEnd,
              );
            return (
              <div
                key={i}
                style={{
                  padding: "10px 8px",
                  textAlign: "center",
                  borderBottom: "1px solid rgba(209,196,255,0.5)",
                  background: isToday
                    ? "rgba(67,56,202,0.06)"
                    : "rgba(245,243,255,0.6)",
                  borderLeft: "1px solid rgba(209,196,255,0.4)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "#818cf8",
                    letterSpacing: "0.05em",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {TR_DAYS_SHORT_MON[mondayIndex(d)]}
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: isToday ? 700 : 600,
                    color: isToday ? "#4338ca" : "#1e1b4b",
                    marginTop: "2px",
                  }}
                >
                  {d.getDate()}
                </div>
                {isWeekendClosed && (
                  <div
                    style={{
                      fontSize: "9px",
                      fontWeight: 600,
                      color: "#991b1b",
                      marginTop: "2px",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    Kapalı
                  </div>
                )}
              </div>
            );
          })}

          {/* Body rows */}
          {hours.map(({ start, end }) => (
            <FragRow
              key={start}
              hour={start}
              days={days}
              workStart={workStart}
              workEnd={workEnd}
              resInCell={resInCell}
              blockInCell={blockInCell}
              recurringInCell={recurringInCell}
              hourStart={start}
              hourEnd={end}
              onReservationClick={onReservationClick}
              onEmptyCellClick={onEmptyCellClick}
              onBlockClick={onBlockClick}
              onRecurringClick={onRecurringClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FragRow(props: {
  hour: number;
  days: Date[];
  workStart: number;
  workEnd: number;
  hourStart: number;
  hourEnd: number;
  resInCell: (d: Date, s: number, e: number) => Reservation[];
  blockInCell: (d: Date, s: number, e: number) => SlotBlock | undefined;
  recurringInCell: (
    d: Date,
    s: number,
    e: number,
  ) => RecurringRule | undefined;
  onReservationClick: (id: string) => void;
  onEmptyCellClick: (date: string, time: string) => void;
  onBlockClick: (b: SlotBlock) => void;
  onRecurringClick: (r: RecurringRule) => void;
}) {
  const {
    hour,
    days,
    workStart,
    workEnd,
    hourStart,
    hourEnd,
    resInCell,
    blockInCell,
    recurringInCell,
    onReservationClick,
    onEmptyCellClick,
    onBlockClick,
    onRecurringClick,
  } = props;
  const inWork = hour >= workStart && hour < workEnd;

  return (
    <>
      <div
        style={{
          padding: "6px 6px",
          fontSize: "10px",
          fontWeight: 600,
          color: inWork ? "#475569" : "#cbd5e1",
          textAlign: "right",
          borderTop: "1px solid rgba(209,196,255,0.3)",
          background: "rgba(250,250,255,0.6)",
          minHeight: "56px",
        }}
      >
        {fmtMin(hour)}
      </div>
      {days.map((d, i) => (
        <HourCell
          key={i}
          date={d}
          hourStart={hourStart}
          hourEnd={hourEnd}
          reservations={resInCell(d, hourStart, hourEnd)}
          block={blockInCell(d, hourStart, hourEnd)}
          recurringRule={recurringInCell(d, hourStart, hourEnd)}
          inWorkHours={inWork}
          onReservationClick={onReservationClick}
          onEmptyClick={onEmptyCellClick}
          onBlockClick={onBlockClick}
          onRecurringClick={onRecurringClick}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Month view
// ─────────────────────────────────────────────────────────

function MonthView(props: {
  anchorDate: Date;
  items: Reservation[];
  blocks: SlotBlock[];
  recurring: RecurringRule[];
  onDayClick: (d: Date) => void;
}) {
  const { anchorDate, items, blocks, recurring, onDayClick } = props;
  const today = useMemo(() => new Date(), []);
  const cells = useMemo(
    () => calendarCells(anchorDate.getFullYear(), anchorDate.getMonth()),
    [anchorDate],
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
    const m = new Map<string, { reason: string; source: "block" | "recurring" }>();
    for (const b of blocks) {
      const k = toLocalIso(new Date(b.slotDate));
      if (!m.has(k))
        m.set(k, { reason: b.blockReason ?? "Kapalı", source: "block" });
    }
    if (recurring.length > 0) {
      for (const d of cells) {
        const k = toLocalIso(d);
        if (m.has(k)) continue;
        const rule = recurring.find((r) => r.dayOfWeek === d.getDay());
        if (rule)
          m.set(k, {
            reason: rule.reason ?? "Haftalık kapalı",
            source: "recurring",
          });
      }
    }
    return m;
  }, [blocks, recurring, cells]);

  return (
    <div className="glass fade-up fade-up-2" style={{ padding: "16px" }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: "6px",
        }}
      >
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchorDate.getMonth();
          const isToday = isSameLocalDay(d, today);
          const iso = toLocalIso(d);
          const dayItems = byDay.get(iso) ?? [];
          const closed = blockedDays.get(iso);
          const approved = dayItems.filter((r) => r.status === "APPROVED").length;
          const pending = dayItems.filter(
            (r) => r.status === "PENDING_APPROVAL",
          ).length;

          return (
            <button
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              title={closed ? `Kapalı · ${closed.reason}` : undefined}
              style={{
                minHeight: "86px",
                padding: "8px",
                borderRadius: "10px",
                background: closed
                  ? "rgba(239,68,68,0.08)"
                  : isToday
                    ? "rgba(67,56,202,0.06)"
                    : "rgba(255,255,255,0.55)",
                border: closed
                  ? "1px dashed rgba(239,68,68,0.4)"
                  : isToday
                    ? "2px solid #4338ca"
                    : "1px solid rgba(209,196,255,0.5)",
                opacity: inMonth ? 1 : 0.35,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontFamily: "inherit",
                color: "#1e1b4b",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? "#4338ca" : "#1e1b4b",
                  }}
                >
                  {d.getDate()}
                </div>
                {closed && (
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "#991b1b",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {closed.source === "recurring" ? "↻" : "🔒"} Kapalı
                  </span>
                )}
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "3px" }}
              >
                {approved > 0 && (
                  <CountBadge
                    color={STATUS_COLORS.APPROVED.bg}
                    fg={STATUS_COLORS.APPROVED.fg}
                    label={`${approved} onaylı`}
                  />
                )}
                {pending > 0 && (
                  <CountBadge
                    color={STATUS_COLORS.PENDING_APPROVAL.bg}
                    fg={STATUS_COLORS.PENDING_APPROVAL.fg}
                    label={`${pending} bekliyor`}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CountBadge({
  color,
  fg,
  label,
}: {
  color: string;
  fg: string;
  label: string;
}) {
  return (
    <div
      style={{
        background: color,
        color: fg,
        fontSize: "10px",
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: "5px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Modaller: BlockDay, BlockRange, Recurring, EmptyCellMenu,
// BlockDetail, ManageBlocks
// ─────────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onCancel,
  width = 440,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onCancel: () => void;
  width?: number;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30,27,75,0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: `${width}px`,
          background: "#ffffff",
          borderRadius: "16px",
          padding: "22px",
          boxShadow: "0 24px 48px rgba(30,27,75,0.25)",
          border: "1px solid #ede9fe",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          className="gradient-text"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.3px",
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            style={{
              fontSize: "12px",
              color: "#818cf8",
              margin: "4px 0 16px",
            }}
          >
            {subtitle}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function modalLabel(): React.CSSProperties {
  return {
    display: "block",
    fontSize: "10px",
    color: "#818cf8",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "6px",
  };
}
function modalInput(): React.CSSProperties {
  return {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "10px",
    border: "1px solid #ede9fe",
    fontSize: "13px",
    color: "#1e1b4b",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function BlockDayModal({
  defaultDate,
  token,
  onClose,
  onSuccess,
  onError,
}: {
  defaultDate: string;
  token: string | undefined;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await apiFetch(
        "/slots/block-day",
        {
          method: "POST",
          body: JSON.stringify({ date, reason: reason.trim() || undefined }),
        },
        token,
      );
      onSuccess("Gün kapatıldı");
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Gün Kapat"
      subtitle="Çalışma saatleri içindeki tüm slotları kapatır."
      onCancel={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            Vazgeç
          </button>
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy ? "..." : "Günü Kapat"}
          </button>
        </>
      }
    >
      <div>
        <label style={modalLabel()}>Tarih</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={modalInput()}
        />
      </div>
      <div>
        <label style={modalLabel()}>Neden (opsiyonel)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="örn. Bayram tatili"
          style={modalInput()}
        />
      </div>
    </ModalShell>
  );
}

function BlockRangeModal({
  defaultDate,
  token,
  onClose,
  onSuccess,
  onError,
}: {
  defaultDate: string;
  token: string | undefined;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (endDate < startDate) {
      onError("Bitiş tarihi başlangıçtan önce olamaz");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ blocked: number; days: string[] }>(
        "/slots/block-range",
        {
          method: "POST",
          body: JSON.stringify({
            startDate,
            endDate,
            reason: reason.trim() || undefined,
          }),
        },
        token,
      );
      onSuccess(`${res.blocked} gün kapatıldı`);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Tatil Ekle"
      subtitle="Tarih aralığındaki tüm günleri kapatır."
      onCancel={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            Vazgeç
          </button>
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy ? "..." : "Tatil Tanımla"}
          </button>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
        }}
      >
        <div>
          <label style={modalLabel()}>Başlangıç</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={modalInput()}
          />
        </div>
        <div>
          <label style={modalLabel()}>Bitiş</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={modalInput()}
          />
        </div>
      </div>
      <div>
        <label style={modalLabel()}>Neden (opsiyonel)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="örn. Yılbaşı tatili"
          style={modalInput()}
        />
      </div>
    </ModalShell>
  );
}

function RecurringRuleModal({
  token,
  onClose,
  onSuccess,
  onError,
}: {
  token: string | undefined;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState(5);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("19:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (endTime <= startTime) {
      onError("Bitiş saati başlangıçtan sonra olmalı");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(
        "/slots/recurring-rule",
        {
          method: "POST",
          body: JSON.stringify({
            dayOfWeek,
            startTime,
            endTime,
            reason: reason.trim() || undefined,
          }),
        },
        token,
      );
      onSuccess("Tekrarlayan kural eklendi");
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Tekrarlayan Kural"
      subtitle="Her hafta seçilen günde, saat aralığında otomatik kapatma."
      onCancel={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            Vazgeç
          </button>
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy ? "..." : "Kural Ekle"}
          </button>
        </>
      }
    >
      <div>
        <label style={modalLabel()}>Gün</label>
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value))}
          style={modalInput()}
        >
          {DAYS_FULL.map((name, idx) => (
            <option key={idx} value={idx}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
        }}
      >
        <div>
          <label style={modalLabel()}>Başlangıç</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={modalInput()}
          />
        </div>
        <div>
          <label style={modalLabel()}>Bitiş</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={modalInput()}
          />
        </div>
      </div>
      <div>
        <label style={modalLabel()}>Neden (opsiyonel)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="örn. Haftalık temizlik"
          style={modalInput()}
        />
      </div>
    </ModalShell>
  );
}

function EmptyCellMenu({
  date,
  time,
  token,
  onClose,
  onSuccess,
  onError,
  onNewReservation,
}: {
  date: string;
  time?: string;
  token: string | undefined;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onNewReservation: () => void;
}) {
  const [modeBlock, setModeBlock] = useState(false);
  const [reason, setReason] = useState(CLOSE_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function blockSlot() {
    if (!time) return;
    const finalReason =
      reason === "Diğer" ? (note.trim() || "Diğer") : reason;
    const startMin = parseHHMM(time);
    const endTime = fmtMin(startMin + 60);
    setBusy(true);
    try {
      await apiFetch(
        "/slots/block",
        {
          method: "POST",
          body: JSON.stringify({
            date,
            startTime: time,
            endTime,
            reason: finalReason,
          }),
        },
        token,
      );
      onSuccess("Slot kapatıldı");
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={modeBlock ? "Slot Kapat" : "Boş Slot"}
      subtitle={
        modeBlock
          ? `${date} · ${time}`
          : `${date}${time ? ` · ${time}` : ""} — ne yapmak istersiniz?`
      }
      onCancel={onClose}
      footer={
        modeBlock ? (
          <>
            <button onClick={onClose} disabled={busy} className="btn-ghost">
              Vazgeç
            </button>
            <button onClick={blockSlot} disabled={busy} className="btn-primary">
              {busy ? "..." : "Slotu Kapat"}
            </button>
          </>
        ) : undefined
      }
    >
      {modeBlock ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "8px",
            }}
          >
            {CLOSE_REASONS.map((r) => {
              const active = reason === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: active
                      ? "1px solid #4338ca"
                      : "1px solid #ede9fe",
                    background: active
                      ? "rgba(67,56,202,0.08)"
                      : "#ffffff",
                    color: active ? "#4338ca" : "#1e1b4b",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div>
            <label style={modalLabel()}>Ek not (opsiyonel)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Açıklama yazın"
              style={modalInput()}
            />
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              onNewReservation();
              onClose();
            }}
            style={menuActionStyle("primary")}
          >
            <span>+ Rezervasyon Ekle</span>
            <span style={{ fontSize: "11px", opacity: 0.8 }}>
              Yeni rezervasyon formu açılır
            </span>
          </button>
          {time && (
            <button
              type="button"
              onClick={() => setModeBlock(true)}
              style={menuActionStyle("danger")}
            >
              <span>🔒 Bu slotu kapat</span>
              <span style={{ fontSize: "11px", opacity: 0.8 }}>
                {date} · {time} – {fmtMin(parseHHMM(time) + 60)}
              </span>
            </button>
          )}
        </>
      )}
    </ModalShell>
  );
}

function menuActionStyle(tone: "primary" | "danger"): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2px",
    width: "100%",
    padding: "12px 14px",
    borderRadius: "10px",
    border:
      tone === "primary"
        ? "1px solid #4338ca"
        : "1px solid rgba(239,68,68,0.3)",
    background:
      tone === "primary" ? "rgba(67,56,202,0.06)" : "rgba(239,68,68,0.06)",
    color: tone === "primary" ? "#4338ca" : "#ef4444",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
  };
}

function BlockDetailModal({
  detail,
  token,
  onClose,
  onRemoved,
  onError,
}: {
  detail:
    | { kind: "block"; data: SlotBlock }
    | { kind: "recurring"; data: RecurringRule };
  token: string | undefined;
  onClose: () => void;
  onRemoved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm("Bu kapatmayı kaldırmak istediğinize emin misiniz?"))
      return;
    setBusy(true);
    try {
      if (detail.kind === "block") {
        await apiFetch(
          `/slots/blocks/${detail.data.id}`,
          { method: "DELETE" },
          token,
        );
        onRemoved("Kapatma kaldırıldı");
      } else {
        await apiFetch(
          `/slots/recurring/${detail.data.id}`,
          { method: "DELETE" },
          token,
        );
        onRemoved("Tekrarlayan kural kaldırıldı");
      }
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isBlock = detail.kind === "block";
  const title = isBlock ? "Kapatılan Slot" : "Tekrarlayan Kural";
  const subtitle = isBlock
    ? `${formatTrLongDate(new Date(detail.data.slotDate))} · ${detail.data.startTime}–${detail.data.endTime}`
    : `Her ${DAYS_FULL[(detail.data as RecurringRule).dayOfWeek]} · ${detail.data.startTime}–${detail.data.endTime}`;
  const reason = isBlock
    ? detail.data.blockReason
    : (detail.data as RecurringRule).reason;

  return (
    <ModalShell
      title={title}
      subtitle={subtitle}
      onCancel={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            Kapat
          </button>
          <button
            onClick={remove}
            disabled={busy}
            style={{
              padding: "8px 18px",
              borderRadius: "99px",
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.08)",
              color: "#ef4444",
              fontWeight: 600,
              fontSize: "13px",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "..." : "Kaldır"}
          </button>
        </>
      }
    >
      <div
        style={{
          fontSize: "13px",
          color: "#1e1b4b",
          padding: "10px 12px",
          background: "#faf5ff",
          border: "1px solid #ede9fe",
          borderRadius: "10px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            color: "#818cf8",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: "6px",
          }}
        >
          Sebep
        </div>
        <div>{reason || "(belirtilmemiş)"}</div>
      </div>
    </ModalShell>
  );
}

function ManageBlocksModal({
  token,
  onClose,
  onChanged,
  onError,
  onSuccess,
}: {
  token: string | undefined;
  onClose: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [blocks, setBlocks] = useState<SlotBlock[]>([]);
  const [recurring, setRecurring] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const today = toLocalIso(new Date());
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const futureISO = toLocalIso(future);
    try {
      const [b, r] = await Promise.all([
        apiFetch<{ items: SlotBlock[] }>(
          `/slots/blocks?date_from=${today}&date_to=${futureISO}`,
          {},
          token,
        ).catch(() => ({ items: [] as SlotBlock[] })),
        apiFetch<{ items: RecurringRule[] }>("/slots/recurring", {}, token).catch(
          () => ({ items: [] as RecurringRule[] }),
        ),
      ]);
      setBlocks(b.items);
      setRecurring(r.items);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeBlock(id: string) {
    if (!window.confirm("Bu kapatmayı kaldırmak istediğinize emin misiniz?"))
      return;
    setBusyId(id);
    try {
      await apiFetch(`/slots/blocks/${id}`, { method: "DELETE" }, token);
      onSuccess("Kapatma kaldırıldı");
      await load();
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function removeRecurring(id: string) {
    if (
      !window.confirm("Bu tekrarlayan kuralı kaldırmak istediğinize emin misiniz?")
    )
      return;
    setBusyId(id);
    try {
      await apiFetch(`/slots/recurring/${id}`, { method: "DELETE" }, token);
      onSuccess("Tekrarlayan kural kaldırıldı");
      await load();
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModalShell
      title="Aktif Kapatmalar"
      subtitle="Kapatılan günleri ve tekrarlayan kuralları yönetin."
      onCancel={onClose}
      width={520}
      footer={
        <button onClick={onClose} className="btn-ghost">
          Kapat
        </button>
      }
    >
      <SectionHeader title="Kapatılan günler" count={blocks.length} />
      {loading ? (
        <SkeletonList />
      ) : blocks.length === 0 ? (
        <EmptyHint text="Aktif kapatma yok." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {blocks.map((b) => (
            <ManagedRow
              key={b.id}
              busy={busyId === b.id}
              icon="📅"
              primary={formatTrLongDate(new Date(b.slotDate))}
              secondary={`${b.startTime}–${b.endTime}${b.blockReason ? ` · ${b.blockReason}` : ""}`}
              onRemove={() => removeBlock(b.id)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: "12px" }}>
        <SectionHeader
          title="Tekrarlayan kurallar"
          count={recurring.length}
        />
        {loading ? (
          <SkeletonList />
        ) : recurring.length === 0 ? (
          <EmptyHint text="Aktif tekrarlayan kural yok." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {recurring.map((r) => (
              <ManagedRow
                key={r.id}
                busy={busyId === r.id}
                icon="↻"
                primary={`Her ${DAYS_FULL[r.dayOfWeek] ?? r.dayOfWeek}`}
                secondary={`${r.startTime}–${r.endTime}${r.reason ? ` · ${r.reason}` : ""}`}
                onRemove={() => removeRecurring(r.id)}
              />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: "8px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 600,
          color: "#818cf8",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "11px", color: "#a5b4fc" }}>{count}</div>
    </div>
  );
}
function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px 14px",
        textAlign: "center",
        fontSize: "12px",
        color: "#a5b4fc",
        background: "rgba(255,255,255,0.5)",
        border: "1px dashed #c4b5fd",
        borderRadius: "10px",
      }}
    >
      {text}
    </div>
  );
}
function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="shimmer"
          style={{ height: "44px", borderRadius: "10px" }}
        />
      ))}
    </div>
  );
}
function ManagedRow({
  busy,
  onRemove,
  icon,
  primary,
  secondary,
}: {
  busy: boolean;
  onRemove: () => void;
  icon: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.65)",
        border: "1px solid #ede9fe",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: "rgba(148,163,184,0.18)",
          color: "#475569",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "16px",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#1e1b4b",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {primary}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "#818cf8",
            marginTop: "2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {secondary}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        style={{
          padding: "6px 14px",
          fontSize: "12px",
          fontWeight: 600,
          borderRadius: "99px",
          border: "1px solid rgba(239,68,68,0.3)",
          background: busy ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.08)",
          color: "#ef4444",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {busy ? "..." : "Kaldır"}
      </button>
    </div>
  );
}
