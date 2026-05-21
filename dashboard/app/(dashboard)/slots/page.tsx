"use client";

import { useMemo, useState } from "react";
import { formatTrLongDate, toLocalIso, TR_DAYS_SHORT_MON } from "@/lib/date";

// TODO: Backend'e baglandiginda buradan kaldirilacak; simdilik mock.
type SlotStatus = "available" | "booked" | "pending" | "closed";

type Slot = {
  start: string;
  end: string;
  status: SlotStatus;
  label?: string;
  reason?: string;
};

const SLOT_TIMES: { start: string; end: string }[] = [
  { start: "09:00", end: "11:00" },
  { start: "11:00", end: "13:00" },
  { start: "13:00", end: "15:00" },
  { start: "15:00", end: "17:00" },
  { start: "17:00", end: "19:00" },
];

function mockSlotsForDate(_dateISO: string): Slot[] {
  // Tamamen deterministik mock: gercek veri yok.
  return [
    { start: "09:00", end: "11:00", status: "available" },
    { start: "11:00", end: "13:00", status: "booked", label: "Demir Ailesi" },
    { start: "13:00", end: "15:00", status: "pending", label: "Yılmaz Grubu" },
    { start: "15:00", end: "17:00", status: "available" },
    {
      start: "17:00",
      end: "19:00",
      status: "closed",
      reason: "Bakım",
    },
  ];
}

const CLOSE_REASONS = ["Bakım", "Özel Etkinlik", "Dolu", "Diğer"];

export default function SlotsPage() {
  const [dateISO, setDateISO] = useState(toLocalIso(new Date()));
  const [weekView, setWeekView] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(mockSlotsForDate(dateISO));

  const [modal, setModal] = useState<{
    slotIndex: number;
    selectedReason: string;
    note: string;
  } | null>(null);

  const selectedDate = useMemo(() => new Date(`${dateISO}T00:00:00`), [dateISO]);
  const longDate = formatTrLongDate(selectedDate);

  function refreshForDate(iso: string) {
    setDateISO(iso);
    setSlots(mockSlotsForDate(iso));
  }

  function openClose(idx: number) {
    setModal({ slotIndex: idx, selectedReason: CLOSE_REASONS[0], note: "" });
  }

  function confirmClose() {
    if (!modal) return;
    setSlots((prev) =>
      prev.map((s, i) =>
        i === modal.slotIndex
          ? {
              ...s,
              status: "closed",
              reason:
                modal.selectedReason === "Diğer"
                  ? modal.note.trim() || "Diğer"
                  : modal.selectedReason,
            }
          : s,
      ),
    );
    setModal(null);
  }

  function reopen(idx: number) {
    setSlots((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, status: "available", reason: undefined } : s,
      ),
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
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
              margin: 0,
            }}
          >
            Slot Yönetimi
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "#818cf8",
              margin: "4px 0 0",
            }}
          >
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
            onChange={(e) => refreshForDate(e.target.value)}
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
              border: weekView ? "1px solid #4338ca" : "1px solid rgba(209,196,255,0.6)",
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

      {/* Hizli eylemler */}
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
          // eslint-disable-next-line no-alert
          onClick={() => alert("Gün kapatma henüz bağlanmadı (mock).")}
        />
        <ActionButton
          icon={<RepeatIcon />}
          label="Tekrarlayan Kural"
          // eslint-disable-next-line no-alert
          onClick={() => alert("Tekrarlayan kural ekranı yakında.")}
        />
        <ActionButton
          icon={<GiftIcon />}
          label="Tatil Ekle"
          // eslint-disable-next-line no-alert
          onClick={() => alert("Tatil tanımlama yakında.")}
        />
      </div>

      {/* Slot grid */}
      {weekView ? (
        <WeekView selectedISO={dateISO} />
      ) : (
        <SingleDayView
          slots={slots}
          longDate={longDate}
          onClose={openClose}
          onReopen={reopen}
        />
      )}

      {/* Close modal */}
      {modal && (
        <CloseModal
          slot={slots[modal.slotIndex]}
          state={modal}
          onUpdate={(s) => setModal(s)}
          onCancel={() => setModal(null)}
          onConfirm={confirmClose}
        />
      )}
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
        background: tone === "danger" ? "rgba(239,68,68,0.08)" : "rgba(67,56,202,0.08)",
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
  longDate,
  onClose,
  onReopen,
}: {
  slots: Slot[];
  longDate: string;
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
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e1b4b" }}>
            {longDate}
          </div>
          <div style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}>
            09:00 – 19:00 · 2 saatlik slotlar
          </div>
        </div>
      </div>
      <div>
        {slots.map((s, i) => (
          <SlotRow
            key={i}
            slot={s}
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
  onClose,
  onReopen,
}: {
  slot: Slot;
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
      {/* Saat */}
      <div
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: "#1e1b4b",
          width: "120px",
          flexShrink: 0,
        }}
      >
        {slot.start} – {slot.end}
      </div>

      {/* Durum */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <SlotStatusBar slot={slot} />
      </div>

      {/* Aksiyon */}
      <div style={{ flexShrink: 0 }}>
        {slot.status === "available" && (
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: "6px 14px", fontSize: "12px" }}
          >
            Kapat
          </button>
        )}
        {slot.status === "closed" && (
          <button
            type="button"
            onClick={onReopen}
            style={{
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 500,
              background: "transparent",
              border: "1px solid #ede9fe",
              borderRadius: "99px",
              color: "#a5b4fc",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "#a7f3d0";
              e.currentTarget.style.color = "#059669";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#ede9fe";
              e.currentTarget.style.color = "#a5b4fc";
            }}
          >
            Aç
          </button>
        )}
        {(slot.status === "booked" || slot.status === "pending") && (
          <button
            type="button"
            // eslint-disable-next-line no-alert
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
          <span style={{ fontSize: "13px", color: "#059669", fontWeight: 500 }}>
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
          <span style={{ fontSize: "13px", color: "#92400e", fontWeight: 500 }}>
            Onay bekliyor
          </span>
          {slot.label && (
            <span style={{ fontSize: "12px", color: "#a5b4fc" }}>· {slot.label}</span>
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
          <span style={{ fontSize: "13px", color: "#ef4444", fontWeight: 500 }}>
            Kapalı
          </span>
          {slot.reason && (
            <span style={{ fontSize: "12px", color: "#a5b4fc" }}>· {slot.reason}</span>
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

  // Her gun icin mock slot durumu (sadece gorsel).
  function visualFor(dayIdx: number, slotIdx: number): SlotStatus {
    const pattern: SlotStatus[][] = [
      ["available", "booked", "available", "available", "closed"], // Pzt
      ["booked", "available", "pending", "booked", "available"],   // Sal
      ["available", "booked", "booked", "pending", "available"],   // Çar
      ["pending", "available", "booked", "available", "closed"],   // Per
      ["booked", "booked", "pending", "available", "available"],   // Cum
      ["available", "pending", "available", "booked", "booked"],   // Cmt
      ["closed", "closed", "closed", "closed", "closed"],          // Paz
    ];
    return pattern[dayIdx]?.[slotIdx] ?? "available";
  }

  function bgFor(s: SlotStatus): string {
    switch (s) {
      case "booked":
        return "#4338ca";
      case "pending":
        return "#fbbf24";
      case "closed":
        return "rgba(239,68,68,0.15)";
      case "available":
      default:
        return "rgba(255,255,255,0.6)";
    }
  }
  function borderFor(s: SlotStatus): string {
    switch (s) {
      case "booked":
        return "#4338ca";
      case "pending":
        return "#f59e0b";
      case "closed":
        return "rgba(239,68,68,0.3)";
      case "available":
      default:
        return "#c4b5fd";
    }
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
            <div style={{ color: "#1e1b4b", marginTop: "2px" }}>{d.getDate()}</div>
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
          {days.map((_, dayIdx) => {
            const s = visualFor(dayIdx, slotIdx);
            return (
              <div
                key={dayIdx}
                style={{
                  background: bgFor(s),
                  border: `1px solid ${borderFor(s)}`,
                  borderRadius: "8px",
                  height: "34px",
                }}
                title={s}
              />
            );
          })}
        </div>
      ))}

      <div style={{ display: "flex", gap: "14px", marginTop: "12px", fontSize: "11px", color: "#818cf8" }}>
        <Legend color="#4338ca" label="Dolu" />
        <Legend color="#fbbf24" label="Bekliyor" />
        <Legend color="#c4b5fd" label="Müsait" outline />
        <Legend color="#ef4444" label="Kapalı" outline />
      </div>
    </div>
  );
}

function Legend({
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
  onUpdate,
  onCancel,
  onConfirm,
}: {
  slot: Slot;
  state: { slotIndex: number; selectedReason: string; note: string };
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
          {slot.start} – {slot.end} slotunu neden kapatıyorsunuz?
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
          <button onClick={onCancel} className="btn-ghost">
            Vazgeç
          </button>
          <button onClick={onConfirm} className="btn-primary">
            Slotu Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function RepeatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
