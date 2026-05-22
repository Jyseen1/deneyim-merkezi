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
  const { toasts, show, dismiss } = useToast();

  const [dateISO, setDateISO] = useState(toLocalIso(new Date()));
  const [weekView, setWeekView] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

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
          onClick={() => show("Gün kapatma yakında", "error")}
        />
        <ActionButton
          icon={<RepeatIcon />}
          label="Tekrarlayan Kural"
          onClick={() => show("Tekrarlayan kural ekranı yakında", "error")}
        />
        <ActionButton
          icon={<GiftIcon />}
          label="Tatil Ekle"
          onClick={() => show("Tatil tanımlama yakında", "error")}
        />
      </div>

      {weekView ? (
        <WeekView selectedISO={dateISO} />
      ) : (
        <SingleDayView
          slots={slots}
          loading={loading}
          longDate={longDate}
          busyIdx={busyIdx}
          onClose={openClose}
          onReopen={reopen}
        />
      )}

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
}: {
  slots: Slot[];
  loading: boolean;
  longDate: string;
  busyIdx: number | null;
  onClose: (idx: number) => void;
  onReopen: (idx: number) => void;
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
}: {
  slot: Slot;
  busy: boolean;
  onClose: () => void;
  onReopen: () => void;
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
            onClick={() => alert("Detay görünümü yakında.")}
            style={{
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 500,
              background: "rgba(67,56,202,0.08)",
              border: "1px solid #ede9fe",
              borderRadius: "99px",
              color: "#4338ca",
              cursor: "pointer",
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

function WeekView({ selectedISO }: { selectedISO: string }) {
  const date = new Date(`${selectedISO}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const SLOT_TIMES: { start: string; end: string }[] = [
    { start: "09:00", end: "11:00" },
    { start: "11:00", end: "13:00" },
    { start: "13:00", end: "15:00" },
    { start: "15:00", end: "17:00" },
    { start: "17:00", end: "19:00" },
  ];

  return (
    <div className="glass fade-up fade-up-2" style={{ padding: "16px 18px" }}>
      <div
        style={{
          fontSize: "12px",
          color: "#a5b4fc",
          marginBottom: "10px",
          textAlign: "center",
        }}
      >
        Hafta görünümü gerçek verisi yakında — şimdilik şablon.
      </div>
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
          {days.map((_, dayIdx) => (
            <div
              key={dayIdx}
              style={{
                background: "rgba(255,255,255,0.5)",
                border: "1px solid #c4b5fd",
                borderRadius: "8px",
                height: "34px",
              }}
            />
          ))}
        </div>
      ))}
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
