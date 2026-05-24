"use client";

// Takvim modalleri — page.tsx'ten çıkarıldı.
// Veri kontratları, formlar ve mantık DEĞİŞMEDİ; sadece organizasyon.

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatTrLongDate, toLocalIso } from "@/lib/date";
import { DatePicker } from "@/components/ui/DatePicker";
import { GXSelect } from "@/components/ui/GXSelect";
import { GXTimePicker } from "@/components/ui/GXTimePicker";

// ─────────────────────────────────────────────────────────
// Tipler
// ─────────────────────────────────────────────────────────

export type SlotBlock = {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  blockReason: string | null;
};

export type RecurringRule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string | null;
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

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────
// Modal shell
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
        background: "rgba(0,0,0,0.65)",
        // Above drawer (70) and any picker (9999) opened from within.
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: `${width}px`,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), #0F0F18",
          borderRadius: "16px",
          padding: "22px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          border: "1px solid rgba(124,58,237,0.30)",
          maxHeight: "90vh",
          overflowY: "auto",
          color: "var(--txt)",
        }}
      >
        <h3
          className="font-display"
          style={{
            fontSize: "18px",
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.01em",
            color: "var(--txt)",
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted)",
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
    color: "var(--muted2)",
    fontWeight: 600,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    marginBottom: "6px",
  };
}
function modalInput(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,0.04)",
    fontSize: "13px",
    color: "var(--txt)",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

// ─────────────────────────────────────────────────────────
// Gün Kapat
// ─────────────────────────────────────────────────────────

export function BlockDayModal({
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
        <DatePicker
          value={date}
          onChange={setDate}
          ariaLabel="Kapatılacak tarih"
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
// Tatil Ekle
// ─────────────────────────────────────────────────────────

export function BlockRangeModal({
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
          <DatePicker
            value={startDate}
            onChange={setStartDate}
            ariaLabel="Başlangıç tarihi"
          />
        </div>
        <div>
          <label style={modalLabel()}>Bitiş</label>
          <DatePicker
            value={endDate}
            onChange={setEndDate}
            min={startDate || undefined}
            ariaLabel="Bitiş tarihi"
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

export function RecurringRuleModal({
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
        <GXSelect<number>
          value={dayOfWeek}
          onChange={setDayOfWeek}
          options={DAYS_FULL.map((name, idx) => ({ value: idx, label: name }))}
          ariaLabel="Tekrarlayan kural günü"
        />
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
          <GXTimePicker
            value={startTime}
            onChange={setStartTime}
            ariaLabel="Başlangıç saati"
          />
        </div>
        <div>
          <label style={modalLabel()}>Bitiş</label>
          <GXTimePicker
            value={endTime}
            onChange={setEndTime}
            ariaLabel="Bitiş saati"
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
// Boş Slot Menüsü (+ Slot Kapat hızlı yolu)
// ─────────────────────────────────────────────────────────

export function EmptyCellMenu({
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
      reason === "Diğer" ? note.trim() || "Diğer" : reason;
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
                      ? "1px solid var(--accent)"
                      : "1px solid var(--line)",
                    background: active
                      ? "rgba(124,58,237,0.18)"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "var(--accent3)" : "var(--txt)",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
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
        ? "1px solid var(--accent)"
        : "1px solid rgba(239,68,68,0.3)",
    background:
      tone === "primary"
        ? "rgba(124,58,237,0.10)"
        : "rgba(239,68,68,0.06)",
    color: tone === "primary" ? "var(--accent3)" : "#f87171",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
    fontFamily: "inherit",
  };
}

// ─────────────────────────────────────────────────────────
// Blok / Recurring detay
// ─────────────────────────────────────────────────────────

export function BlockDetailModal({
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
              padding: "9px 18px",
              borderRadius: "10px",
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.08)",
              color: "#f87171",
              fontWeight: 600,
              fontSize: "13px",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
              fontFamily: "inherit",
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
          color: "var(--txt)",
          padding: "10px 12px",
          background: "rgba(124,58,237,0.06)",
          border: "1px solid rgba(124,58,237,0.20)",
          borderRadius: "10px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            color: "var(--muted2)",
            fontWeight: 600,
            letterSpacing: "0.10em",
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

// ─────────────────────────────────────────────────────────
// Aktif Kapatmalar (yönetim)
// ─────────────────────────────────────────────────────────

export function ManageBlocksModal({
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
        apiFetch<{ items: RecurringRule[] }>(
          "/slots/recurring",
          {},
          token,
        ).catch(() => ({ items: [] as RecurringRule[] })),
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
      !window.confirm(
        "Bu tekrarlayan kuralı kaldırmak istediğinize emin misiniz?",
      )
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
          color: "var(--muted2)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "11px", color: "var(--muted)" }}>{count}</div>
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
        color: "var(--muted)",
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed var(--line)",
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
        background: "rgba(255,255,255,0.025)",
        border: "1px solid var(--line)",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: "rgba(124,58,237,0.15)",
          color: "var(--accent3)",
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
            color: "var(--txt)",
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
            color: "var(--muted)",
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
          borderRadius: "10px",
          border: "1px solid rgba(239,68,68,0.3)",
          background: busy ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.08)",
          color: "#f87171",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
          flexShrink: 0,
          fontFamily: "inherit",
        }}
      >
        {busy ? "..." : "Kaldır"}
      </button>
    </div>
  );
}
