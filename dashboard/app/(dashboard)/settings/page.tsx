"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { useBackendToken } from "@/hooks/useBackendToken";
import { GXSelect } from "@/components/ui/GXSelect";

type Settings = {
  id: string;
  staffWaPhone: string | null;
  approvalEnabled: boolean;
  reminderEnabled: boolean;
  defaultDuration: number;
  approvalTimeout: number;
  workStart: string;
  workEnd: string;
  reminderHours: number;
};

type Health = { status?: string };

export default function SettingsPage() {
  const { show } = useToast();
  const token = useBackendToken();

  const [loading, setLoading] = useState(true);
  const [s, setS] = useState<Settings | null>(null);

  const [savingWa, setSavingWa] = useState(false);
  const [savingRes, setSavingRes] = useState(false);
  const [testing, setTesting] = useState(false);

  const [waConnected, setWaConnected] = useState<boolean | null>(null);

  // Health check (canli/degil)
  useEffect(() => {
    const base =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
    fetch(`${base}/health`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Health | null) => setWaConnected(Boolean(d && d.status === "ok")))
      .catch(() => setWaConnected(false));
  }, []);

  // Mevcut ayarlari getir
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<Settings>("/settings", {}, token)
      .then((data) => {
        if (!cancelled) setS(data);
      })
      .catch((e) => {
        if (!cancelled) {
          show(
            `Ayarlar yüklenemedi: ${e instanceof ApiError ? e.message : (e as Error).message}`,
            "error",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, show]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function persist(partial: Partial<Settings>, label: string, setBusy: (v: boolean) => void) {
    setBusy(true);
    try {
      const updated = await apiFetch<Settings>(
        "/settings",
        { method: "PUT", body: JSON.stringify(partial) },
        token,
      );
      setS(updated);
      show(`${label} kaydedildi`, "success");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      show(`Kaydedilemedi: ${msg}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function saveWa() {
    if (!s) return;
    return persist(
      {
        staffWaPhone: s.staffWaPhone,
        approvalEnabled: s.approvalEnabled,
        reminderEnabled: s.reminderEnabled,
      },
      "WhatsApp ayarları",
      setSavingWa,
    );
  }

  function saveReservation() {
    if (!s) return;
    return persist(
      {
        defaultDuration: s.defaultDuration,
        approvalTimeout: s.approvalTimeout,
        workStart: s.workStart,
        workEnd: s.workEnd,
        reminderHours: s.reminderHours,
      },
      "Rezervasyon ayarları",
      setSavingRes,
    );
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        "/whatsapp/test",
        { method: "POST" },
        token,
      );
      if (res.ok) show(res.message || "Test mesajı gönderildi", "success");
      else show(res.message || "Test mesajı gönderilemedi", "error");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      show(`Hata: ${msg}`, "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div className="fade-up" style={{ marginBottom: "20px" }}>
        <h1
          className="font-display"
          style={{
            fontSize: "32px",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--gx-text)",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Ayarlar
        </h1>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gx-text-muted)",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          Sistem{" "}
          <span
            className="font-serif font-italic"
            style={{ color: "var(--gx-accent-light)" }}
          >
            davranışını
          </span>{" "}
          yapılandırın.
        </p>
      </div>

      {/* A) WhatsApp */}
      <Section title="WhatsApp Ayarları" fadeClass="fade-up-1">
        {loading || !s ? (
          <ShimmerForm rows={3} />
        ) : (
          <>
            <Field label="Yetkili WhatsApp numarası">
              <input
                type="text"
                value={s.staffWaPhone ?? ""}
                onChange={(e) => update("staffWaPhone", e.target.value || null)}
                placeholder="+90..."
                style={inputStyle()}
              />
            </Field>
            <Toggle
              label="Onay bildirimi aktif"
              desc="Yeni rezervasyonlarda yetkiliye WA mesajı gönderilsin."
              value={s.approvalEnabled}
              onChange={(v) => update("approvalEnabled", v)}
            />
            <Toggle
              label="Hatırlatma bildirimi aktif"
              desc="Ziyaretten 24 saat önce ziyaretçiye hatırlatma mesajı."
              value={s.reminderEnabled}
              onChange={(v) => update("reminderEnabled", v)}
            />
            <Note>
              WA_ACCESS_TOKEN ve diğer API bilgileri sunucu tarafında{" "}
              <code>.env</code> dosyasından okunur.
            </Note>
            <Action onClick={saveWa} loading={savingWa} label="Kaydet" />
          </>
        )}
      </Section>

      {/* B) Rezervasyon */}
      <Section title="Rezervasyon Ayarları" fadeClass="fade-up-2">
        {loading || !s ? (
          <ShimmerForm rows={4} />
        ) : (
          <>
            <Row2>
              <Field label="Varsayılan süre">
                <GXSelect<number>
                  value={s.defaultDuration}
                  onChange={(v) => update("defaultDuration", v)}
                  options={[60, 90, 120, 150, 180].map((d) => ({
                    value: d,
                    label: `${d} dk`,
                  }))}
                  ariaLabel="Varsayılan süre"
                />
              </Field>
              <Field label="Onay timeout süresi">
                <GXSelect<number>
                  value={s.approvalTimeout}
                  onChange={(v) => update("approvalTimeout", v)}
                  options={[1, 2, 4, 8].map((h) => ({
                    value: h,
                    label: `${h} saat`,
                  }))}
                  ariaLabel="Onay timeout süresi"
                />
              </Field>
            </Row2>
            <Row2>
              <Field label="Çalışma saatleri (başlangıç)">
                <GXSelect
                  value={s.workStart}
                  onChange={(v) => update("workStart", v)}
                  options={["08:00", "09:00", "10:00"].map((t) => ({
                    value: t,
                    label: t,
                  }))}
                  ariaLabel="Çalışma başlangıç saati"
                />
              </Field>
              <Field label="Çalışma saatleri (bitiş)">
                <GXSelect
                  value={s.workEnd}
                  onChange={(v) => update("workEnd", v)}
                  options={["17:00", "18:00", "19:00", "20:00"].map((t) => ({
                    value: t,
                    label: t,
                  }))}
                  ariaLabel="Çalışma bitiş saati"
                />
              </Field>
            </Row2>
            <Field label="Hatırlatma (kaç saat önce)">
              <GXSelect<number>
                value={s.reminderHours}
                onChange={(v) => update("reminderHours", v)}
                options={[12, 24, 48].map((h) => ({
                  value: h,
                  label: `${h} saat`,
                }))}
                ariaLabel="Hatırlatma süresi"
              />
            </Field>
            <Action
              onClick={saveReservation}
              loading={savingRes}
              label="Kaydet"
            />
          </>
        )}
      </Section>

      {/* C) Bildirim testi */}
      <Section title="Bildirim Testi" fadeClass="fade-up-3">
        <p
          style={{ fontSize: "13px", color: "var(--gx-text)", margin: "0 0 12px" }}
        >
          Yapılandırılan WhatsApp ayarlarını test etmek için yetkili numaraya bir test mesajı gönderir.
        </p>
        <Action onClick={sendTest} loading={testing} label="Test Mesajı Gönder" />
      </Section>

      {/* D) Sistem Bilgisi */}
      {/* D) Ekip */}
      <Section title="Ekip" fadeClass="fade-up-4">
        <TeamSection />
      </Section>

      <Section title="Sistem Bilgisi" fadeClass="fade-up-5" readonly>
        <InfoRow label="Backend versiyon" value="1.0.0" />
        <InfoRow label="Node.js" value="v20.x" />
        <InfoRow label="Database" value="Neon PostgreSQL (Frankfurt)" />
        <InfoRow label="Cache & Queue" value="Upstash Redis (Frankfurt)" />
        <InfoRow
          label="WhatsApp API"
          value={
            waConnected === null
              ? "kontrol ediliyor..."
              : waConnected
              ? "bağlı"
              : "bağlı değil"
          }
          tone={waConnected ? "success" : waConnected === false ? "danger" : "muted"}
        />
      </Section>

    </div>
  );
}

function Section({
  title,
  children,
  fadeClass,
  readonly,
}: {
  title: string;
  children: React.ReactNode;
  fadeClass: string;
  readonly?: boolean;
}) {
  return (
    <section
      className={`gx-card fade-up ${fadeClass}`}
      style={{
        padding: "20px 22px 20px 24px",
        marginTop: "16px",
        borderLeft: "2px solid var(--gx-accent-light)",
        borderTopLeftRadius: "16px",
        borderBottomLeftRadius: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}
      >
        <h2
          className="font-display"
          style={{
            fontSize: "16px",
            fontWeight: 500,
            color: "var(--gx-text)",
            letterSpacing: "-0.01em",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        {readonly && (
          <span
            style={{
              fontSize: "10px",
              color: "var(--gx-text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Salt okunur
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
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
        {label}
      </label>
      {children}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "12px" }}>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid var(--gx-border)",
    background: "var(--gx-surface)",
    color: "var(--gx-text)",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 0",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", color: "var(--gx-text)", fontWeight: 500 }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontSize: "11px", color: "var(--gx-text-muted)", marginTop: "2px" }}>
            {desc}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "99px",
          border: "none",
          background: value ? "var(--gx-accent)" : "rgba(255,255,255,0.12)",
          padding: 0,
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "3px",
            left: value ? "23px" : "3px",
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "#ffffff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            transition: "left 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}

function Action({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <div
      style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}
    >
      <button
        type="button"
        className="btn-primary"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? "Kaydediliyor..." : label}
      </button>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(124,58,237,0.10)",
        border: "1px dashed var(--gx-border-accent)",
        borderRadius: "10px",
        padding: "10px 12px",
        fontSize: "11px",
        color: "var(--gx-accent-light)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "muted";
}) {
  const color =
    tone === "success"
      ? "var(--gx-success)"
      : tone === "danger"
      ? "var(--gx-danger)"
      : tone === "muted"
      ? "var(--gx-text-hint)"
      : "var(--gx-text)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        padding: "10px 0",
        borderBottom: "1px solid var(--gx-border)",
      }}
    >
      <span style={{ fontSize: "12px", color: "var(--gx-text-muted)" }}>{label}</span>
      <span
        style={{
          fontSize: "13px",
          color,
          fontWeight: 600,
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ShimmerForm({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div
            className="shimmer"
            style={{ height: "10px", width: "120px", borderRadius: "4px", marginBottom: "8px" }}
          />
          <div
            className="shimmer"
            style={{ height: "36px", width: "100%", borderRadius: "10px" }}
          />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Ekip — Staff listesi + ekleme/pasifleştirme (admin yetkisi)
// Veri kontratı: GET/POST/DELETE /api/v1/staff
// ─────────────────────────────────────────────────────────

type StaffItem = {
  id: string;
  name: string;
  email: string;
  waPhone: string | null;
  role: string;
  isActive: boolean;
};

function TeamSection() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const token = useBackendToken();
  const { show } = useToast();

  const [items, setItems] = useState<StaffItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ items: StaffItem[] }>(
        "/staff",
        {},
        token,
      );
      setItems(res.items);
    } catch (e) {
      show(
        `Ekip listelenemedi: ${e instanceof ApiError ? e.message : (e as Error).message}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [token, show]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  async function softDelete(id: string) {
    if (!window.confirm("Bu iş arkadaşını pasif yapmak istediğinize emin misiniz?"))
      return;
    setBusyId(id);
    try {
      await apiFetch(`/staff/${id}`, { method: "DELETE" }, token);
      show("Pasif yapıldı", "info");
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { error?: string } | null)?.error ?? e.message
          : (e as Error).message;
      show(`İşlem başarısız: ${msg}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function reactivate(id: string, name: string) {
    setBusyId(id);
    try {
      await apiFetch(
        `/staff/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        },
        token,
      );
      show(`${name} yeniden aktifleştirildi`, "success");
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { error?: string } | null)?.error ?? e.message
          : (e as Error).message;
      show(`İşlem başarısız: ${msg}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function hardDelete(id: string, name: string) {
    if (
      !window.confirm(
        `${name} kalıcı olarak silinecek, bu işlem geri alınamaz. Emin misiniz?`,
      )
    )
      return;
    setBusyId(id);
    try {
      await apiFetch(`/staff/${id}/permanent`, { method: "DELETE" }, token);
      show(`${name} kalıcı olarak silindi`, "info");
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? (e.body as { error?: string } | null)?.error ?? e.message
          : (e as Error).message;
      show(`İşlem başarısız: ${msg}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <p
        style={{
          fontSize: "13px",
          color: "var(--gx-text)",
          margin: "0 0 14px",
        }}
      >
        Google ile giriş yapabilecek kişileri yönet.{" "}
        <span
          className="font-serif font-italic"
          style={{ color: "var(--gx-accent-light)" }}
        >
          Eklediğin
        </span>{" "}
        kişi de admin yetkisine sahip olur.
      </p>

      {loading || items === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="shimmer"
              style={{ height: "54px", borderRadius: "12px" }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Note>
          Henüz eklenmiş iş arkadaşı yok. Aşağıdaki butondan ekleyebilirsin.
        </Note>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map((s) => {
            const isSelf = currentUserId === s.id;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "11px",
                  background: s.isActive
                    ? "rgba(255,255,255,0.025)"
                    : "rgba(255,255,255,0.015)",
                  border: "1px solid var(--gx-border)",
                  opacity: s.isActive ? 1 : 0.55,
                }}
              >
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, var(--gx-accent), var(--gx-accent-light))",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {(s.name || s.email).slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--gx-text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.name}
                    {isSelf && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "10px",
                          padding: "2px 7px",
                          borderRadius: "99px",
                          background: "rgba(124,58,237,0.15)",
                          color: "var(--gx-accent-light)",
                          letterSpacing: "0.04em",
                          fontWeight: 500,
                        }}
                      >
                        sen
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--gx-text-muted)",
                      marginTop: "2px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.email}
                    {s.waPhone ? ` · ${s.waPhone}` : ""}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    padding: "3px 9px",
                    borderRadius: "99px",
                    background: s.isActive
                      ? "rgba(74,222,128,0.12)"
                      : "rgba(161,161,170,0.15)",
                    color: s.isActive
                      ? "var(--gx-success)"
                      : "var(--gx-text-hint)",
                    border: `1px solid ${
                      s.isActive
                        ? "rgba(74,222,128,0.25)"
                        : "var(--gx-border)"
                    }`,
                    flexShrink: 0,
                  }}
                >
                  {s.isActive ? "Aktif" : "Pasif"}
                </span>
                {s.isActive ? (
                  <button
                    type="button"
                    onClick={() => softDelete(s.id)}
                    disabled={isSelf || busyId === s.id}
                    title={
                      isSelf
                        ? "Kendi hesabınızı pasif yapamazsınız"
                        : "Pasif yap"
                    }
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      borderRadius: "8px",
                      border: "1px solid rgba(239,68,68,0.3)",
                      background: "transparent",
                      color: "#f87171",
                      cursor:
                        isSelf || busyId === s.id ? "not-allowed" : "pointer",
                      opacity: isSelf || busyId === s.id ? 0.4 : 1,
                      flexShrink: 0,
                      fontFamily: "var(--font-inter), system-ui",
                    }}
                  >
                    {busyId === s.id ? "..." : "Sil"}
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => reactivate(s.id, s.name)}
                      disabled={busyId === s.id}
                      title="Yeniden aktifleştir"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        borderRadius: "8px",
                        border: "1px solid rgba(74,222,128,0.35)",
                        background: "transparent",
                        color: "var(--gx-success)",
                        cursor: busyId === s.id ? "not-allowed" : "pointer",
                        opacity: busyId === s.id ? 0.4 : 1,
                        fontFamily: "var(--font-inter), system-ui",
                      }}
                    >
                      {busyId === s.id ? "..." : "Aktifleştir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => hardDelete(s.id, s.name)}
                      disabled={busyId === s.id}
                      title="Kalıcı olarak sil (geri alınamaz)"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        borderRadius: "8px",
                        border: "1px solid rgba(239,68,68,0.3)",
                        background: "transparent",
                        color: "#f87171",
                        cursor: busyId === s.id ? "not-allowed" : "pointer",
                        opacity: busyId === s.id ? 0.4 : 1,
                        fontFamily: "var(--font-inter), system-ui",
                      }}
                    >
                      {busyId === s.id ? "..." : "Sil"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: "14px",
        }}
      >
        <button
          type="button"
          className="btn-primary"
          onClick={() => setAddOpen(true)}
        >
          + İş Arkadaşı Ekle
        </button>
      </div>

      {addOpen && (
        <AddStaffModal
          token={token}
          onClose={() => setAddOpen(false)}
          onSuccess={(name, reactivated) => {
            show(
              reactivated
                ? `${name} yeniden aktifleştirildi`
                : `${name} eklendi`,
              "success",
            );
            setAddOpen(false);
            load();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}
    </>
  );
}

function AddStaffModal({
  token,
  onClose,
  onSuccess,
  onError,
}: {
  token: string | undefined;
  onClose: () => void;
  onSuccess: (name: string, reactivated: boolean) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  function validate(): string | null {
    if (name.trim().length < 2) return "İsim en az 2 karakter olmalı";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Geçerli bir e-posta girin";
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) {
      onError(err);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ reactivated?: boolean }>(
        "/staff",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            // role'ü "admin" sabit gönderiyoruz — eklenen herkes admin
            role: "admin",
            // waPhone opsiyonel: boşsa gönderme
            ...(phone.trim() ? { waPhone: phone.trim() } : {}),
            // password gönderilmiyor — Google-only kullanıcı (passwordHash null)
          }),
        },
        token,
      );
      onSuccess(name.trim(), Boolean(res?.reactivated));
    } catch (e) {
      let msg = "İşlem başarısız";
      if (e instanceof ApiError) {
        if (e.status === 409) {
          // Backend ayri mesaj donduruyor: "zaten aktif" vs "telefon
          // baska kullanicida". Body'den oku, fallback generic.
          const body = e.body as { error?: string } | null;
          msg = body?.error ?? "Bu e-posta veya telefon zaten kayıtlı";
        } else if (e.status === 403) {
          msg = "Bu işlem için yönetici yetkisi gerekli";
        } else {
          const body = e.body as { error?: string } | null;
          msg = body?.error ?? `Hata: ${e.message}`;
        }
      } else {
        msg = (e as Error).message;
      }
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  // SSR guard — createPortal document.body'ye ihtiyac duyuyor. Server'da
  // window yok; client mount'a kadar null don.
  if (typeof window === "undefined") return null;

  // Modal'i Portal ile document.body'ye render et — aksi halde parent
  // .gx-card'in (backdrop-filter:blur + z-index:1) yarattigi stacking
  // context'ine hapsolur, z-index:9999 etkisiz kalir ve sonraki .gx-card'lar
  // (Sistem Bilgisi vs.) modal'in uzerine binar.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
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
          maxWidth: "440px",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), #0F0F18",
          borderRadius: "16px",
          padding: "22px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          border: "1px solid rgba(124,58,237,0.30)",
          color: "var(--gx-text)",
        }}
      >
        <h3
          className="font-display"
          style={{
            fontSize: "18px",
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          İş Arkadaşı Ekle
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--gx-text-muted)",
            margin: "4px 0 18px",
          }}
        >
          Google ile bu e-postadan giriş yapabilen yeni bir yönetici.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Field label="İsim">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ad Soyad"
              style={inputStyle()}
              autoFocus
            />
          </Field>
          <Field label="Telefon (opsiyonel)">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+90 5XX XXX XX XX"
              style={inputStyle()}
            />
          </Field>
          <Field label="Gmail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@gmail.com"
              style={inputStyle()}
              autoComplete="off"
            />
          </Field>
        </div>

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? "Ekleniyor..." : "Ekle"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
