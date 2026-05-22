"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { ToastViewport } from "@/components/ToastViewport";
import { useBackendToken } from "@/hooks/useBackendToken";

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
  const { toasts, show, dismiss } = useToast();
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
          className="gradient-text"
          style={{
            fontSize: "26px",
            fontWeight: 700,
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Ayarlar
        </h1>
        <p style={{ fontSize: "13px", color: "#818cf8", margin: "4px 0 0" }}>
          Sistem davranışını yapılandırın.
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
                <select
                  value={s.defaultDuration}
                  onChange={(e) =>
                    update("defaultDuration", Number(e.target.value))
                  }
                  style={inputStyle()}
                >
                  {[60, 90, 120, 150, 180].map((d) => (
                    <option key={d} value={d}>
                      {d} dk
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Onay timeout süresi">
                <select
                  value={s.approvalTimeout}
                  onChange={(e) =>
                    update("approvalTimeout", Number(e.target.value))
                  }
                  style={inputStyle()}
                >
                  {[1, 2, 4, 8].map((h) => (
                    <option key={h} value={h}>
                      {h} saat
                    </option>
                  ))}
                </select>
              </Field>
            </Row2>
            <Row2>
              <Field label="Çalışma saatleri (başlangıç)">
                <select
                  value={s.workStart}
                  onChange={(e) => update("workStart", e.target.value)}
                  style={inputStyle()}
                >
                  {["08:00", "09:00", "10:00"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Çalışma saatleri (bitiş)">
                <select
                  value={s.workEnd}
                  onChange={(e) => update("workEnd", e.target.value)}
                  style={inputStyle()}
                >
                  {["17:00", "18:00", "19:00", "20:00"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </Row2>
            <Field label="Hatırlatma (kaç saat önce)">
              <select
                value={s.reminderHours}
                onChange={(e) => update("reminderHours", Number(e.target.value))}
                style={inputStyle()}
              >
                {[12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h} saat
                  </option>
                ))}
              </select>
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
          style={{ fontSize: "13px", color: "#1e1b4b", margin: "0 0 12px" }}
        >
          Yapılandırılan WhatsApp ayarlarını test etmek için yetkili numaraya bir test mesajı gönderir.
        </p>
        <Action onClick={sendTest} loading={testing} label="Test Mesajı Gönder" />
      </Section>

      {/* D) Sistem Bilgisi */}
      <Section title="Sistem Bilgisi" fadeClass="fade-up-4" readonly>
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

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
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
      className={`glass fade-up ${fadeClass}`}
      style={{ padding: "20px 22px", marginTop: "16px" }}
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
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#1e1b4b",
            letterSpacing: "-0.01em",
            margin: 0,
            paddingLeft: "10px",
            borderLeft: "4px solid #4338ca",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
        {readonly && (
          <span
            style={{
              fontSize: "10px",
              color: "#818cf8",
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
          color: "#818cf8",
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
    padding: "9px 12px",
    borderRadius: "10px",
    border: "1px solid #ede9fe",
    background: "rgba(255,255,255,0.7)",
    color: "#1e1b4b",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit",
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
        <div style={{ fontSize: "13px", color: "#1e1b4b", fontWeight: 500 }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontSize: "11px", color: "#818cf8", marginTop: "2px" }}>
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
          background: value ? "#4338ca" : "#cbd5e1",
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
        background: "rgba(67,56,202,0.05)",
        border: "1px dashed #c4b5fd",
        borderRadius: "10px",
        padding: "10px 12px",
        fontSize: "11px",
        color: "#4338ca",
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
      ? "#059669"
      : tone === "danger"
      ? "#ef4444"
      : tone === "muted"
      ? "#a5b4fc"
      : "#1e1b4b";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid rgba(237,233,254,0.7)",
      }}
    >
      <span style={{ fontSize: "12px", color: "#818cf8" }}>{label}</span>
      <span style={{ fontSize: "13px", color, fontWeight: 500 }}>{value}</span>
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
