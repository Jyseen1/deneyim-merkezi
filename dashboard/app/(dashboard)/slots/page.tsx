"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  formatTrLongDate,
  toLocalIso,
  TR_DAYS_SHORT_MON,
} from "@/lib/date";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useToast } from "@/hooks/useToast";
import { ToastViewport } from "@/components/ToastViewport";
import { ReservationDrawer } from "@/components/ReservationDrawer";
import { useSession } from "next-auth/react";

type SlotStatus = "available" | "booked" | "pending" | "closed";

type Slot = {
  startTime: string;
  endTime: string;
  status: SlotStatus;
  label?: string;
  reservationId?: string;
  blockId?: string;
};

type SlotsResp = { date: string; slots: Slot[] };

const CLOSE_REASONS = ["Bakım", "Özel Etkinlik", "Dolu", "Diğer"];

export default function SlotsPage() {
  const token = useBackendToken();
  const { data: session } = useSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const { toasts, show, dismiss } = useToast();

  const [dateISO, setDateISO] = useState(toLocalIso(new Date()));
  const [weekView, setWeekView] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [activeReservationId, setActiveReservationId] = useState<string | null>(null);
  const [blockDayOpen, setBlockDayOpen] = useState(false);
  const [blockRangeOpen, setBlockRangeOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

  const [modal, setModal] = useState<{
    slotIndex: number;
    selectedReason: string;
    note: string;
  } | null>(null);

  const selectedDate = useMemo(
    () => new Date(`${dateISO}T00:00:00`),
    [dateISO],
  );
  const longDate = formatTrLongDate(selectedDate);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<SlotsResp>(
        `/dashboard/slots?date=${dateISO}`,
        {},
        token,
      );
      setSlots(res.slots);
    } catch (e) {
      show(
        `Slotlar yüklenemedi: ${e instanceof ApiError ? e.message : (e as Error).message}`,
        "error",
      );
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [dateISO, token, show]);

  useEffect(() => {
    load();
  }, [load]);

  function openClose(idx: number) {
    setModal({ slotIndex: idx, selectedReason: CLOSE_REASONS[0], note: "" });
  }

  async function confirmClose() {
    if (!modal) return;
    const slot = slots[modal.slotIndex];
    if (!slot) return;
    const reason =
      modal.selectedReason === "Diğer"
        ? modal.note.trim() || "Diğer"
        : modal.selectedReason;
    setBusyIdx(modal.slotIndex);
    try {
      await apiFetch(
        "/slots/block",
        {
          method: "POST",
          body: JSON.stringify({
            date: dateISO,
            startTime: slot.startTime,
            endTime: slot.endTime,
            reason,
          }),
        },
        token,
      );
      setModal(null);
      show("Slot kapatıldı", "success");
      await load();
    } catch (e) {
      show(
        `Kapatılamadı: ${e instanceof ApiError ? e.message : (e as Error).message}`,
        "error",
      );
    } finally {
      setBusyIdx(null);
    }
  }

  async function reopen(idx: number) {
    const slot = slots[idx];
    if (!slot?.blockId) return;
    setBusyIdx(idx);
    try {
      await apiFetch(`/slots/block/${slot.blockId}`, { method: "DELETE" }, token);
      show("Slot açıldı", "success");
      await load();
    } catch (e) {
      show(
        `Açılamadı: ${e instanceof ApiError ? e.message : (e as Error).message}`,
        "error",
      );
    } finally {
      setBusyIdx(null);
    }
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
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
              margin: 0,
            }}
          >
            Slot Yönetimi
          </h1>
          <p style={{ fontSize: "13px", color: "#818cf8", margin: "4px 0 0" }}>
            Günlük slot durumunu yönetin, kapatma kuralları ekleyin.
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
          <input
            type="date"
            value={dateISO}
            onChange={(e) => setDateISO(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(209,196,255,0.6)",
              borderRadius: "10px",
              padding: "8px 12px",
              fontSize: "13px",
              color: "#1e1b4b",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setWeekView((v) => !v)}
            style={{
              background: weekView ? "#4338ca" : "rgba(255,255,255,0.7)",
              border: weekView
                ? "1px solid #4338ca"
                : "1px solid rgba(209,196,255,0.6)",
              borderRadius: "99px",
              padding: "7px 16px",
              fontSize: "12px",
              fontWeight: 600,
              color: weekView ? "#e0e7ff" : "#4338ca",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {weekView ? "Tek Günü Göster" : "Tüm Haftayı Göster"}
          </button>
        </div>
      </div>

      <div
        className="glass fade-up fade-up-1"
        style={{
          padding: "16px 18px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "#818cf8",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginRight: "auto",
          }}
        >
          Hızlı Eylemler
        </div>
        <ActionButton
          icon={<CloseIcon />}
          label="Gün Kapat"
          tone="danger"
          onClick={() => setBlockDayOpen(true)}
        />
        <ActionButton
          icon={<RepeatIcon />}
          label="Tekrarlayan Kural"
          onClick={() => setRecurringOpen(true)}
        />
        <ActionButton
          icon={<GiftIcon />}
          label="Tatil Ekle"
          onClick={() => setBlockRangeOpen(true)}
        />
      </div>

      {weekView ? (
        <WeekView selectedISO={dateISO} token={token} />
      ) : (
        <SingleDayView
          slots={slots}
          loading={loading}
          longDate={longDate}
          busyIdx={busyIdx}
          onClose={openClose}
          onReopen={reopen}
          onDetail={(id) => setActiveReservationId(id)}
        />
      )}

      <ClosedDaysPanel
        token={token}
        onMutated={load}
        onError={(msg) => show(msg, "error")}
        onSuccess={(msg) => show(msg, "success")}
      />

      {blockDayOpen && (
        <BlockDayModal
          defaultDate={dateISO}
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
          defaultDate={dateISO}
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

      <ReservationDrawer
        reservationId={activeReservationId}
        staffId={staffId}
        onClose={() => setActiveReservationId(null)}
        onMutated={load}
      />

      {modal && (
        <CloseModal
          slot={slots[modal.slotIndex]}
          state={modal}
          busy={busyIdx === modal.slotIndex}
          onUpdate={(s) => setModal(s)}
          onCancel={() => setModal(null)}
          onConfirm={confirmClose}
        />
      )}

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background:
          tone === "danger" ? "rgba(239,68,68,0.08)" : "rgba(67,56,202,0.08)",
        border: `1px solid ${tone === "danger" ? "rgba(239,68,68,0.3)" : "#ede9fe"}`,
        color: tone === "danger" ? "#ef4444" : "#4338ca",
        borderRadius: "99px",
        padding: "7px 14px",
        fontSize: "12px",
        fontWeight: 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.15s ease",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SingleDayView({
  slots,
  loading,
  longDate,
  busyIdx,
  onClose,
  onReopen,
  onDetail,
}: {
  slots: Slot[];
  loading: boolean;
  longDate: string;
  busyIdx: number | null;
  onClose: (idx: number) => void;
  onReopen: (idx: number) => void;
  onDetail: (reservationId: string) => void;
}) {
  return (
    <div className="glass fade-up fade-up-2">
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid rgba(209,196,255,0.5)",
          borderLeft: "4px solid #4338ca",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{ fontSize: "14px", fontWeight: 600, color: "#1e1b4b" }}
          >
            {longDate}
          </div>
          <div
            style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}
          >
            09:00 – 19:00 · 2 saatlik slotlar
          </div>
        </div>
      </div>
      <div>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`sk-${i}`}
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid rgba(209,196,255,0.4)",
                }}
              >
                <div
                  className="shimmer"
                  style={{ height: "20px", width: "70%", borderRadius: "6px" }}
                />
              </div>
            ))
          : slots.length === 0
          ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#a5b4fc",
                  fontSize: "13px",
                }}
              >
                Slot bulunamadı.
              </div>
            )
          : slots.map((s, i) => (
              <SlotRow
                key={`${s.startTime}-${i}`}
                slot={s}
                busy={busyIdx === i}
                onClose={() => onClose(i)}
                onReopen={() => onReopen(i)}
                onDetail={() => s.reservationId && onDetail(s.reservationId)}
              />
            ))}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  busy,
  onClose,
  onReopen,
  onDetail,
}: {
  slot: Slot;
  busy: boolean;
  onClose: () => void;
  onReopen: () => void;
  onDetail: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "14px 20px",
        borderBottom: "1px solid rgba(209,196,255,0.4)",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#1e1b4b",
          width: "120px",
          flexShrink: 0,
        }}
      >
        {slot.startTime} – {slot.endTime}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <SlotStatusBar slot={slot} />
      </div>

      <div style={{ flexShrink: 0 }}>
        {slot.status === "available" && (
          <button
            onClick={onClose}
            disabled={busy}
            className="btn-ghost"
            style={{ padding: "6px 14px", fontSize: "12px" }}
          >
            {busy ? "..." : "Kapat"}
          </button>
        )}
        {slot.status === "closed" && (
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            style={{
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 500,
              background: "transparent",
              border: "1px solid #ede9fe",
              borderRadius: "99px",
              color: "#a5b4fc",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.5 : 1,
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              if (busy) return;
              e.currentTarget.style.borderColor = "#a7f3d0";
              e.currentTarget.style.color = "#059669";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#ede9fe";
              e.currentTarget.style.color = "#a5b4fc";
            }}
          >
            {busy ? "..." : "Aç"}
          </button>
        )}
        {(slot.status === "booked" || slot.status === "pending") && (
          <button
            type="button"
            onClick={onDetail}
            disabled={!slot.reservationId}
            style={{
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 500,
              background: "rgba(67,56,202,0.08)",
              border: "1px solid #ede9fe",
              borderRadius: "99px",
              color: "#4338ca",
              cursor: slot.reservationId ? "pointer" : "not-allowed",
              opacity: slot.reservationId ? 1 : 0.5,
            }}
          >
            Detay
          </button>
        )}
      </div>
    </div>
  );
}

function SlotStatusBar({ slot }: { slot: Slot }) {
  switch (slot.status) {
    case "available":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: "#059669",
              flexShrink: 0,
            }}
          />
          <span
            style={{ fontSize: "13px", color: "#059669", fontWeight: 500 }}
          >
            Müsait
          </span>
        </div>
      );
    case "booked":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: "#4338ca",
              borderRadius: "8px",
              padding: "6px 12px",
              color: "#e0e7ff",
              fontSize: "12px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {slot.label ?? "Dolu"}
          </div>
        </div>
      );
    case "pending":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: "#fbbf24",
              flexShrink: 0,
              boxShadow: "0 0 0 3px rgba(251,191,36,0.25)",
            }}
          />
          <span
            style={{ fontSize: "13px", color: "#92400e", fontWeight: 500 }}
          >
            Onay bekliyor
          </span>
          {slot.label && (
            <span style={{ fontSize: "12px", color: "#a5b4fc" }}>
              · {slot.label}
            </span>
          )}
        </div>
      );
    case "closed":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "5px",
              background: "rgba(239,68,68,0.12)",
              color: "#ef4444",
              fontSize: "12px",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </span>
          <span
            style={{ fontSize: "13px", color: "#ef4444", fontWeight: 500 }}
          >
            Kapalı
          </span>
          {slot.label && (
            <span style={{ fontSize: "12px", color: "#a5b4fc" }}>
              · {slot.label}
            </span>
          )}
        </div>
      );
  }
}

type WeekResp = {
  startDate: string;
  days: Record<string, Slot[]>;
};

const SLOT_TIMES: { start: string; end: string }[] = [
  { start: "09:00", end: "11:00" },
  { start: "11:00", end: "13:00" },
  { start: "13:00", end: "15:00" },
  { start: "15:00", end: "17:00" },
  { start: "17:00", end: "19:00" },
];

function cellVisual(status: SlotStatus | undefined): {
  bg: string;
  border: string;
  color: string;
} {
  switch (status) {
    case "booked":
      return { bg: "#4338ca", border: "#4338ca", color: "#e0e7ff" };
    case "pending":
      return { bg: "#fbbf24", border: "#f59e0b", color: "#78350f" };
    case "closed":
      return {
        bg: "rgba(239,68,68,0.15)",
        border: "rgba(239,68,68,0.4)",
        color: "#991b1b",
      };
    case "available":
    default:
      return { bg: "rgba(255,255,255,0.5)", border: "#c4b5fd", color: "#4338ca" };
  }
}

function WeekView({
  selectedISO,
  token,
}: {
  selectedISO: string;
  token: string | undefined;
}) {
  const date = new Date(`${selectedISO}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  const startISO = toLocalIso(monday);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const dayKeys = days.map((d) => toLocalIso(d));

  const [data, setData] = useState<Record<string, Slot[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<WeekResp>(
      `/dashboard/week-slots?startDate=${startISO}`,
      {},
      token,
    )
      .then((r) => {
        if (!cancelled) setData(r.days ?? {});
      })
      .catch(() => {
        if (!cancelled) setData({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startISO, token]);

  function statusAt(dayKey: string, startTime: string): SlotStatus | undefined {
    return data[dayKey]?.find((s) => s.startTime === startTime)?.status;
  }
  function labelAt(dayKey: string, startTime: string): string | undefined {
    return data[dayKey]?.find((s) => s.startTime === startTime)?.label;
  }

  return (
    <div className="glass fade-up fade-up-2" style={{ padding: "16px 18px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <div />
        {days.map((d, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 600,
              color: "#818cf8",
            }}
          >
            <div>{TR_DAYS_SHORT_MON[i]}</div>
            <div style={{ color: "#1e1b4b", marginTop: "2px" }}>
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {SLOT_TIMES.map((row, slotIdx) => (
        <div
          key={slotIdx}
          style={{
            display: "grid",
            gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#1e1b4b",
              fontWeight: 600,
              alignSelf: "center",
            }}
          >
            {row.start}
          </div>
          {dayKeys.map((dayKey) => {
            if (loading) {
              return (
                <div
                  key={dayKey}
                  className="shimmer"
                  style={{ height: "34px", borderRadius: "8px" }}
                />
              );
            }
            const status = statusAt(dayKey, row.start);
            const label = labelAt(dayKey, row.start);
            const v = cellVisual(status);
            return (
              <div
                key={dayKey}
                title={label ?? status ?? "müsait"}
                style={{
                  background: v.bg,
                  border: `1px solid ${v.border}`,
                  borderRadius: "8px",
                  height: "34px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  fontWeight: 600,
                  color: v.color,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  padding: "0 6px",
                }}
              >
                {status === "booked" || status === "pending"
                  ? (label ?? "").slice(0, 12)
                  : status === "closed"
                  ? "kapalı"
                  : ""}
              </div>
            );
          })}
        </div>
      ))}

      <div
        style={{
          marginTop: "10px",
          display: "flex",
          gap: "14px",
          fontSize: "11px",
          color: "#818cf8",
          flexWrap: "wrap",
        }}
      >
        <WeekLegend color="#4338ca" label="Dolu" />
        <WeekLegend color="#fbbf24" label="Bekliyor" />
        <WeekLegend color="#c4b5fd" outline label="Müsait" />
        <WeekLegend color="#ef4444" outline label="Kapalı" />
      </div>
    </div>
  );
}

function WeekLegend({
  color,
  label,
  outline,
}: {
  color: string;
  label: string;
  outline?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "3px",
          background: outline ? "transparent" : color,
          border: `1.5px solid ${color}`,
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function CloseModal({
  slot,
  state,
  busy,
  onUpdate,
  onCancel,
  onConfirm,
}: {
  slot: Slot;
  state: { slotIndex: number; selectedReason: string; note: string };
  busy: boolean;
  onUpdate: (s: typeof state) => void;
  onCancel: () => void;
  onConfirm: () => void;
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
          maxWidth: "420px",
          background: "#ffffff",
          borderRadius: "16px",
          padding: "22px",
          boxShadow: "0 24px 48px rgba(30,27,75,0.25)",
          border: "1px solid #ede9fe",
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
          Slot Kapat
        </h3>
        <p style={{ fontSize: "12px", color: "#818cf8", margin: "4px 0 16px" }}>
          {slot.startTime} – {slot.endTime} slotunu neden kapatıyorsunuz?
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          {CLOSE_REASONS.map((r) => {
            const active = state.selectedReason === r;
            return (
              <button
                key={r}
                onClick={() => onUpdate({ ...state, selectedReason: r })}
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: active ? "1px solid #4338ca" : "1px solid #ede9fe",
                  background: active ? "rgba(67,56,202,0.08)" : "#ffffff",
                  color: active ? "#4338ca" : "#1e1b4b",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>

        <label
          style={{
            display: "block",
            fontSize: "11px",
            color: "#818cf8",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginTop: "16px",
            marginBottom: "6px",
          }}
        >
          Ek not (opsiyonel)
        </label>
        <input
          type="text"
          value={state.note}
          onChange={(e) => onUpdate({ ...state, note: e.target.value })}
          placeholder="Açıklama yazın"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #ede9fe",
            fontSize: "13px",
            color: "#1e1b4b",
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            Vazgeç
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? "..." : "Slotu Kapat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function RepeatIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────
// Generic Modal wrapper
// ─────────────────────────────────────────────────────────
function ModalShell({
  title,
  subtitle,
  children,
  busy,
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
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
          maxWidth: "440px",
          background: "#ffffff",
          borderRadius: "16px",
          padding: "22px",
          boxShadow: "0 24px 48px rgba(30,27,75,0.25)",
          border: "1px solid #ede9fe",
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
          <p style={{ fontSize: "12px", color: "#818cf8", margin: "4px 0 16px" }}>
            {subtitle}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {children}
        </div>
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            Vazgeç
          </button>
          <button onClick={onConfirm} disabled={busy} className="btn-primary">
            {busy ? "..." : confirmLabel}
          </button>
        </div>
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
  };
}

// ─────────────────────────────────────────────────────────
// Gün Kapat
// ─────────────────────────────────────────────────────────
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
      onError(
        e instanceof ApiError ? e.message : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Gün Kapat"
      subtitle="Çalışma saatleri içindeki tüm slotları kapatır."
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
      confirmLabel="Günü Kapat"
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

// ─────────────────────────────────────────────────────────
// Tatil / Tarih Aralığı
// ─────────────────────────────────────────────────────────
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
      onError(
        e instanceof ApiError ? e.message : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Tatil Ekle"
      subtitle="Tarih aralığındaki tüm günleri kapatır."
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
      confirmLabel="Tatil Tanımla"
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

// ─────────────────────────────────────────────────────────
// Tekrarlayan Kural
// ─────────────────────────────────────────────────────────
const DAYS_FULL = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

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
  const [dayOfWeek, setDayOfWeek] = useState(5); // Cuma default
  const [startTime, setStartTime] = useState("17:00");
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
      onError(
        e instanceof ApiError ? e.message : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Tekrarlayan Kural"
      subtitle="Her hafta seçilen günde, saat aralığında otomatik kapatma."
      busy={busy}
      onCancel={onClose}
      onConfirm={submit}
      confirmLabel="Kural Ekle"
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

// ─────────────────────────────────────────────────────────
// Kapatilan Gunler + Tekrarlayan Kurallar yonetim paneli
// ─────────────────────────────────────────────────────────
type ClosedDayItem = {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  blockReason: string | null;
};
type RecurringItem = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string | null;
};

function ClosedDaysPanel({
  token,
  onMutated,
  onError,
  onSuccess,
}: {
  token: string | undefined;
  onMutated: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [blocks, setBlocks] = useState<ClosedDayItem[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    // Bugun -> 1 yil sonra arasi blocks. Gecmis blocklari listelemiyoruz.
    const today = toLocalIso(new Date());
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const futureISO = toLocalIso(future);
    try {
      const [b, r] = await Promise.all([
        apiFetch<{ items: ClosedDayItem[] }>(
          `/slots/blocks?date_from=${today}&date_to=${futureISO}`,
          {},
          token,
        ).catch(() => ({ items: [] as ClosedDayItem[] })),
        apiFetch<{ items: RecurringItem[] }>(
          "/slots/recurring",
          {},
          token,
        ).catch(() => ({ items: [] as RecurringItem[] })),
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

  async function removeBlock(id: string, label: string) {
    if (
      !window.confirm(
        `Bu kapatmayı kaldırmak istediğinize emin misiniz?\n\n${label}`,
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await apiFetch(`/slots/blocks/${id}`, { method: "DELETE" }, token);
      onSuccess("Kapatma kaldırıldı");
      await load();
      onMutated();
    } catch (e) {
      onError(
        e instanceof ApiError ? e.message : (e as Error).message,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeRecurring(id: string, label: string) {
    if (
      !window.confirm(
        `Bu tekrarlayan kuralı kaldırmak istediğinize emin misiniz?\n\n${label}`,
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await apiFetch(`/slots/recurring/${id}`, { method: "DELETE" }, token);
      onSuccess("Tekrarlayan kural kaldırıldı");
      await load();
      onMutated();
    } catch (e) {
      onError(
        e instanceof ApiError ? e.message : (e as Error).message,
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="glass fade-up fade-up-3" style={{ marginTop: "20px" }}>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid rgba(209,196,255,0.5)",
          borderLeft: "4px solid #94a3b8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div>
          <div
            style={{ fontSize: "14px", fontWeight: 600, color: "#1e1b4b" }}
          >
            Kapatılan Günler ve Kurallar
          </div>
          <div
            style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}
          >
            Aktif kapatmaları görüntüleyin ve kaldırın.
          </div>
        </div>
        <span
          style={{
            fontSize: "11px",
            color: "#818cf8",
            background: "rgba(67,56,202,0.06)",
            border: "1px solid #ede9fe",
            padding: "3px 10px",
            borderRadius: "99px",
            whiteSpace: "nowrap",
          }}
        >
          {blocks.length + recurring.length} aktif
        </span>
      </div>

      <div style={{ padding: "14px 20px" }}>
        {/* Kapatilan gunler */}
        <SectionHeader title="Kapatılan günler" count={blocks.length} />
        {loading ? (
          <SkeletonList />
        ) : blocks.length === 0 ? (
          <EmptyHint text="Aktif kapatma yok." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {blocks.map((b) => {
              const dateText = formatTrLongDate(new Date(b.slotDate));
              const label = `${dateText} (${b.startTime}–${b.endTime})${b.blockReason ? ` · ${b.blockReason}` : ""}`;
              return (
                <ManagedRow
                  key={b.id}
                  busy={busyId === b.id}
                  onRemove={() => removeBlock(b.id, label)}
                  icon="📅"
                  primary={dateText}
                  secondary={`${b.startTime}–${b.endTime}${b.blockReason ? ` · ${b.blockReason}` : ""}`}
                />
              );
            })}
          </div>
        )}

        {/* Tekrarlayan kurallar */}
        <div style={{ marginTop: "20px" }}>
          <SectionHeader
            title="Tekrarlayan kurallar"
            count={recurring.length}
          />
          {loading ? (
            <SkeletonList />
          ) : recurring.length === 0 ? (
            <EmptyHint text="Aktif tekrarlayan kural yok." />
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              {recurring.map((r) => {
                const dayName = DAYS_FULL[r.dayOfWeek] ?? `Gün ${r.dayOfWeek}`;
                const label = `Her ${dayName} ${r.startTime}–${r.endTime}${r.reason ? ` · ${r.reason}` : ""}`;
                return (
                  <ManagedRow
                    key={r.id}
                    busy={busyId === r.id}
                    onRemove={() => removeRecurring(r.id, label)}
                    icon="↻"
                    primary={`Her ${dayName}`}
                    secondary={`${r.startTime}–${r.endTime}${r.reason ? ` · ${r.reason}` : ""}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
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
          transition: "all 0.15s ease",
        }}
      >
        {busy ? "..." : "Kaldır"}
      </button>
    </div>
  );
}
