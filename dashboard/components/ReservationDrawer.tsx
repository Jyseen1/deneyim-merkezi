"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useBackendToken } from "@/hooks/useBackendToken";
import { useToast } from "@/hooks/useToast";
import {
  STATUS_LABEL,
  type Reservation,
  type ReservationStatus,
} from "@/lib/types";
import { formatTrDateTime, formatTrShortDate } from "@/lib/date";
import { DatePicker } from "@/components/ui/DatePicker";

type Action = "approve" | "reject" | "cancel" | "no_show";

const ACTION_SUCCESS: Record<Action, { msg: string; type: "success" | "info" }> = {
  approve: { msg: "Rezervasyon onaylandı", type: "success" },
  reject: { msg: "Rezervasyon reddedildi", type: "info" },
  cancel: { msg: "Rezervasyon iptal edildi", type: "info" },
  no_show: { msg: "Gelmedi olarak işaretlendi", type: "info" },
};

type VisitorHistory = {
  visitor: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    createdAt: string;
  };
  reservations: Reservation[];
  stats: {
    total: number;
    approved: number;
    cancelled: number;
    rejected: number;
    noShow: number;
    completed: number;
    firstVisit: string | null;
    lastVisit: string | null;
  };
};

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "status-pending",
  APPROVED: "status-approved",
  REJECTED: "status-rejected",
  CANCELLED: "status-cancelled",
  COMPLETED: "status-completed",
  NO_SHOW: "status-noshow",
};

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid var(--gx-border)",
      }}
    >
      <div style={{ fontSize: "11px", color: "var(--gx-text-muted)" }}>{label}</div>
      <div
        style={{
          fontSize: "13px",
          color: "var(--gx-text)",
          textAlign: "right",
          maxWidth: "60%",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: "20px" }}>
      <h3
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--gx-text-muted)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      <div
        style={{
          marginTop: "8px",
          background: "var(--gx-surface)",
          border: "1px solid var(--gx-border)",
          borderRadius: "12px",
          padding: "8px 14px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ReservationDrawer({
  reservationId,
  staffId,
  onClose,
  onMutated,
}: {
  reservationId: string | null;
  staffId: string;
  onClose: () => void;
  onMutated: () => void;
}) {
  const token = useBackendToken();
  const { show } = useToast();
  const [data, setData] = useState<Reservation | null>(null);
  const [history, setHistory] = useState<VisitorHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [resending, setResending] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  async function resendNotification() {
    if (!data) return;
    setResending(true);
    try {
      // Fastify Content-Type:application/json + bos body kombinasyonu
      // FST_ERR_CTP_EMPTY_JSON_BODY ile 400 atar. Bos JSON gondererek parser'i
      // memnun ediyoruz.
      const res = await apiFetch<{
        ok: boolean;
        staffNotificationStatus: "sent" | "failed";
      }>(
        `/reservations/${data.id}/resend-notification`,
        { method: "POST", body: "{}" },
        token,
      );
      if (res.ok) {
        show("Bildirim gönderildi", "success");
      } else {
        show(
          "Bildirim hâlâ başarısız — arka planda otomatik tekrar denenecek",
          "info",
        );
      }
      const fresh = await apiFetch<Reservation>(
        `/reservations/${data.id}`,
        {},
        token,
      );
      setData(fresh);
      onMutated();
    } catch (e) {
      let msg = "İşlem başarısız";
      if (e instanceof ApiError) {
        const body = e.body as { error?: string; message?: string } | null;
        if (e.status === 400 && body?.error === "not_pending") {
          msg =
            body.message ?? "Bu rezervasyon zaten işlenmiş, bildirim gönderilmez.";
        } else if (e.status === 403) {
          msg = "Bu işlem için yönetici yetkisi gerekli";
        } else if (e.status === 404) {
          msg = "Rezervasyon bulunamadı";
        } else {
          msg = body?.message ?? body?.error ?? `Hata: HTTP ${e.status}`;
        }
      } else {
        msg = `Beklenmeyen hata: ${(e as Error).message}`;
      }
      show(`Bildirim gönderilemedi: ${msg}`, "error");
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setData(null);
    setHistory(null);
    setResending(false);
    setRescheduleOpen(false);
    apiFetch<Reservation>(`/reservations/${reservationId}`, {}, token)
      .then((r) => {
        if (!cancelled) setData(r);
        if (r.visitor?.phone) {
          apiFetch<VisitorHistory>(
            `/visitors/${encodeURIComponent(r.visitor.phone)}`,
            {},
            token,
          )
            .then((h) => {
              if (!cancelled) setHistory(h);
            })
            .catch(() => {
              if (!cancelled) setHistory(null);
            });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(
            e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reservationId, token]);

  async function act(action: Action) {
    if (!data) return;
    setBusy(action);
    setErr(null);
    try {
      await apiFetch(
        `/reservations/${data.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify(
            action === "approve" ? { action: "approve", staffId } : { action },
          ),
        },
        token,
      );
      const fresh = await apiFetch<Reservation>(
        `/reservations/${data.id}`,
        {},
        token,
      );
      setData(fresh);
      onMutated();
      const meta = ACTION_SUCCESS[action];
      show(meta.msg, meta.type);
    } catch (e) {
      const msg =
        e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
      setErr(msg);
      show(`İşlem başarısız: ${msg}`, "error");
    } finally {
      setBusy(null);
    }
  }

  const open = reservationId !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 40,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />

      {/* Panel — mobil: tam ekran sag panel; desktop: 420px sag panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(420px, 100vw)",
          background: "var(--gx-bg)",
          borderLeft: "1px solid var(--gx-border-accent)",
          zIndex: 50,
          boxShadow: "-24px 0 64px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "1px solid var(--gx-border)",
          }}
        >
          <div>
            <h2
              className="gradient-text font-display"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "-0.3px",
                margin: 0,
              }}
            >
              Rezervasyon Detayı
            </h2>
            {data && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--gx-text-hint)",
                  marginTop: "4px",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                }}
              >
                {data.id.slice(0, 8)}…
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "transparent",
              border: "none",
              color: "var(--gx-text-hint)",
              fontSize: "22px",
              lineHeight: 1,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#faf5ff";
              e.currentTarget.style.color = "var(--gx-text)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a5b4fc";
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 22px 20px",
          }}
        >
          {loading && (
            <div style={{ fontSize: "13px", color: "var(--gx-text-hint)" }}>
              Yükleniyor...
            </div>
          )}
          {err && (
            <div
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                color: "var(--gx-danger)",
                padding: "10px 12px",
                borderRadius: "10px",
                fontSize: "13px",
              }}
            >
              {err}
            </div>
          )}
          {data && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span className={`status-pill ${STATUS_CLASS[data.status]}`}>
                  {STATUS_LABEL[data.status]}
                </span>
                <span style={{ fontSize: "11px", color: "var(--gx-text-hint)" }}>
                  {data.groupSize} kişi · {data.durationMinutes} dk
                </span>
                {history && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 10px",
                      borderRadius: "99px",
                      background: "rgba(139,92,246,0.10)",
                      color: "#C4B5FD",
                      border: "1px solid rgba(139,92,246,0.20)",
                    }}
                  >
                    {history.stats.total <= 1
                      ? "İlk ziyaret"
                      : history.stats.total === 2
                        ? "Tekrar ziyaretçi"
                        : "Sadık ziyaretçi ✦"}
                  </span>
                )}
              </div>

              {data.staffNotificationStatus === "failed" && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px 14px",
                    background: "rgba(251,191,36,0.12)",
                    border: "1px solid rgba(251,191,36,0.35)",
                    borderRadius: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--gx-warning)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span aria-hidden>⚠</span>
                    Yetkili bildirimi gönderilemedi
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--gx-warning)", opacity: 0.85 }}>
                    Telegram/WhatsApp bildirimi başarısız oldu. Sistem 30sn,
                    2dk ve 5dk sonra otomatik tekrar deniyor. Manuel tetiklemek
                    için aşağıdaki butonu kullanın.
                  </div>
                  <button
                    type="button"
                    onClick={resendNotification}
                    disabled={resending}
                    style={{
                      alignSelf: "flex-end",
                      padding: "7px 14px",
                      borderRadius: "99px",
                      border: "1px solid var(--gx-warning)",
                      background: "rgba(251,191,36,0.20)",
                      color: "var(--gx-warning)",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: resending ? "not-allowed" : "pointer",
                      opacity: resending ? 0.6 : 1,
                    }}
                  >
                    {resending ? "Gönderiliyor..." : "Bildirimi tekrar gönder"}
                  </button>
                </div>
              )}

              <Block title="Ziyaretçi">
                <Row label="Ad" value={data.visitor?.name ?? "-"} />
                <Row label="Telefon" value={data.visitor?.phone ?? "-"} />
                <Row
                  label="E-posta"
                  value={data.visitor?.email ?? "-"}
                />
              </Block>

              <Block title="Ziyaret">
                <Row
                  label="Tarih"
                  value={formatTrShortDate(data.visitDate)}
                />
                <Row label="Saat" value={data.startTime} />
                <Row label="Süre" value={`${data.durationMinutes} dk`} />
                <Row label="Kişi sayısı" value={data.groupSize} />
                {data.note && <Row label="Not" value={data.note} />}
              </Block>

              <Block
                title={
                  <span
                    className="font-serif font-italic"
                    style={{
                      fontSize: "12px",
                      letterSpacing: "0",
                      textTransform: "none",
                      color: "var(--gx-accent-light)",
                      fontWeight: 400,
                    }}
                  >
                    Geçmiş
                  </span>
                }
              >
                <Row
                  label="Oluşturuldu"
                  value={formatTrDateTime(data.createdAt)}
                />
                <Row
                  label="Güncellendi"
                  value={formatTrDateTime(data.updatedAt)}
                />
                <Row
                  label="Onaylandı"
                  value={
                    data.approvedAt
                      ? `${formatTrDateTime(data.approvedAt)} · ${data.approvedBy ?? ""}`
                      : "-"
                  }
                />
                <Row
                  label="İptal/Red"
                  value={
                    data.cancelledAt
                      ? `${formatTrDateTime(data.cancelledAt)}${data.cancelReason ? ` · ${data.cancelReason}` : ""}`
                      : "-"
                  }
                />
              </Block>

              {history && history.reservations.length > 1 && (
                <Block title="Geçmiş Ziyaretler">
                  {history.reservations
                    .filter((r) => r.id !== data.id)
                    .slice(0, 5)
                    .map((r) => (
                      <Row
                        key={r.id}
                        label={formatTrShortDate(r.visitDate) + " · " + r.startTime}
                        value={
                          <span
                            className={`status-pill ${STATUS_CLASS[r.status]}`}
                            style={{ fontSize: "10px" }}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                        }
                      />
                    ))}
                  {history.reservations.length > 6 && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--gx-text-hint)",
                        textAlign: "center",
                        padding: "8px 0 0",
                      }}
                    >
                      +{history.reservations.length - 6} daha
                    </div>
                  )}
                </Block>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {data && (
          <div
            style={{
              padding: "14px 22px",
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              borderTop: "1px solid var(--gx-border)",
              background: "var(--gx-surface)",
            }}
          >
            {/* Reschedule sadece aktif rezervasyonlarda (pending/approved) */}
            {(data.status === "PENDING_APPROVAL" ||
              data.status === "APPROVED") && (
              <button
                type="button"
                onClick={() => setRescheduleOpen(true)}
                disabled={busy !== null}
                className="btn-ghost"
                title="Rezervasyonu yeni tarih/saate taşı"
              >
                Tarih/Saat Değiştir
              </button>
            )}
            {data.status === "PENDING_APPROVAL" && (
              <>
                <button
                  onClick={() => act("reject")}
                  disabled={busy !== null}
                  className="btn-ghost"
                >
                  {busy === "reject" ? "..." : "Reddet"}
                </button>
                <button
                  onClick={() => act("approve")}
                  disabled={busy !== null}
                  className="btn-primary"
                >
                  {busy === "approve" ? "..." : "Onayla"}
                </button>
              </>
            )}
            {data.status === "APPROVED" && (
              <>
                {(() => {
                  const visitMs =
                    new Date(data.visitDate).getTime() +
                    timeToMinutes(data.startTime) * 60_000;
                  const isPast = visitMs < Date.now();
                  return isPast ? (
                    <button
                      onClick={() => act("no_show")}
                      disabled={busy !== null}
                      className="btn-ghost"
                      style={{
                        borderColor: "rgba(251,191,36,0.35)",
                        color: "var(--gx-warning)",
                      }}
                    >
                      {busy === "no_show" ? "..." : "Gelmedi"}
                    </button>
                  ) : null;
                })()}
                <button
                  onClick={() => act("cancel")}
                  disabled={busy !== null}
                  className="btn-ghost"
                >
                  {busy === "cancel" ? "..." : "İptal et"}
                </button>
              </>
            )}
          </div>
        )}
      </aside>

      {rescheduleOpen && data && (
        <RescheduleModal
          reservation={data}
          token={token}
          onClose={() => setRescheduleOpen(false)}
          onSuccess={async (msg) => {
            show(msg, "success");
            setRescheduleOpen(false);
            // Drawer'i tazele
            const fresh = await apiFetch<Reservation>(
              `/reservations/${data.id}`,
              {},
              token,
            ).catch(() => null);
            if (fresh) setData(fresh);
            onMutated();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Reschedule modal — yeni tarih + musait slot secimi
// ─────────────────────────────────────────────────────────
type AvailableSlot = { startTime: string; endTime: string };
type SlotsResp = { date: string; slots: AvailableSlot[] };

function RescheduleModal({
  reservation,
  token,
  onClose,
  onSuccess,
  onError,
}: {
  reservation: Reservation;
  token: string | undefined;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const initialDate = (reservation.visitDate as string).slice(0, 10);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selected, setSelected] = useState<AvailableSlot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSlotsLoading(true);
    setSelected(null);
    apiFetch<SlotsResp>(
      `/slots/available?date=${date}&duration=${reservation.durationMinutes}`,
      {},
      token,
    )
      .then((r) => {
        if (cancelled) return;
        // Mevcut zaman ayni gun secildiyse onu da liste'ye ekleyelim,
        // backend isSlotAvailable kendi rezervasyonunu disliyor.
        let list = r.slots;
        if (date === initialDate) {
          const has = list.some((s) => s.startTime === reservation.startTime);
          if (!has) {
            const endMin =
              parseInt(reservation.startTime.slice(0, 2)) * 60 +
              parseInt(reservation.startTime.slice(3)) +
              reservation.durationMinutes;
            const endH = String(Math.floor(endMin / 60)).padStart(2, "0");
            const endM = String(endMin % 60).padStart(2, "0");
            list = [
              { startTime: reservation.startTime, endTime: `${endH}:${endM}` },
              ...list,
            ].sort((a, b) => a.startTime.localeCompare(b.startTime));
          }
        }
        setSlots(list);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reservation.durationMinutes, reservation.startTime, initialDate, token]);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(
        `/reservations/${reservation.id}/reschedule`,
        {
          method: "PATCH",
          body: JSON.stringify({
            visitDate: date,
            startTime: selected.startTime,
            durationMinutes: reservation.durationMinutes,
          }),
        },
        token,
      );
      onSuccess(`Rezervasyon ${date} ${selected.startTime} olarak güncellendi`);
    } catch (e) {
      let msg = "Güncelleme başarısız";
      if (e instanceof ApiError) {
        const body = e.body as { error?: string; message?: string } | null;
        if (e.status === 409 && body?.error === "slot_unavailable") {
          msg = body.message ?? "Bu slot artık müsait değil";
        } else if (e.status === 409 && body?.error === "already_processed") {
          msg = body.message ?? "Bu rezervasyon değiştirilemez";
        } else if (e.status === 403) {
          msg = "Bu işlem için yönetici yetkisi gerekli";
        } else {
          msg = body?.message ?? body?.error ?? `Hata: HTTP ${e.status}`;
        }
      } else {
        msg = (e as Error).message;
      }
      onError(`Tarih/Saat değiştirilemedi: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 70,
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
          maxWidth: "460px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--gx-surface-2)",
          borderRadius: "16px",
          padding: "22px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          border: "1px solid var(--gx-border-accent)",
          color: "var(--gx-text)",
        }}
      >
        <h3
          className="gradient-text font-display"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.3px",
          }}
        >
          Tarih/Saat Değiştir
        </h3>
        <p style={{ fontSize: "12px", color: "var(--gx-text-muted)", margin: "4px 0 16px" }}>
          Mevcut: {initialDate} · {reservation.startTime} (
          {reservation.durationMinutes} dk)
        </p>

        <label
          style={{
            display: "block",
            fontSize: "10px",
            color: "var(--gx-text-muted)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "6px",
          }}
        >
          Yeni Tarih
        </label>
        <DatePicker value={date} onChange={setDate} ariaLabel="Yeni tarih" />

        <div
          style={{
            marginTop: "16px",
            fontSize: "10px",
            color: "var(--gx-text-muted)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Müsait Saatler
        </div>
        {slotsLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0,1fr))",
              gap: "6px",
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="shimmer"
                style={{ height: "36px", borderRadius: "8px" }}
              />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div
            style={{
              padding: "14px",
              textAlign: "center",
              fontSize: "12px",
              color: "var(--gx-text-hint)",
              background: "var(--gx-surface)",
              border: "1px dashed var(--gx-border-accent)",
              borderRadius: "10px",
            }}
          >
            Bu gün için müsait saat bulunmuyor.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0,1fr))",
              gap: "6px",
            }}
          >
            {slots.map((s) => {
              const active =
                selected?.startTime === s.startTime &&
                selected?.endTime === s.endTime;
              const isCurrent =
                date === initialDate && s.startTime === reservation.startTime;
              return (
                <button
                  key={`${s.startTime}-${s.endTime}`}
                  type="button"
                  onClick={() => setSelected(s)}
                  style={{
                    padding: "10px 6px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: active
                      ? "var(--gx-gradient)"
                      : "var(--gx-surface)",
                    color: active ? "#ffffff" : "var(--gx-text-muted)",
                    border: active
                      ? "1px solid var(--gx-accent)"
                      : isCurrent
                        ? "1px dashed var(--gx-accent-light)"
                        : "1px solid var(--gx-border)",
                  }}
                  title={isCurrent ? "Mevcut saat" : undefined}
                >
                  {s.startTime}
                </button>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            Vazgeç
          </button>
          <button
            onClick={submit}
            disabled={busy || !selected}
            className="btn-primary"
            style={{ opacity: !selected ? 0.5 : 1 }}
          >
            {busy ? "Kaydediliyor..." : "Yeni Saate Taşı"}
          </button>
        </div>
      </div>
    </div>
  );
}
