"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { ToastViewport } from "@/components/ToastViewport";
import { useBackendToken } from "@/hooks/useBackendToken";

type Health = { status?: string; env?: string };

export default function SettingsPage() {
  const { toasts, show, dismiss } = useToast();
  const token = useBackendToken();

  // WA
  const [waPhone, setWaPhone] = useState("+90");
  const [waApprovalNotif, setWaApprovalNotif] = useState(true);
  const [waReminderNotif, setWaReminderNotif] = useState(true);

  // Rezervasyon
  const [defaultDuration, setDefaultDuration] = useState(120);
  const [approvalTimeout, setApprovalTimeout] = useState(2);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("19:00");
  const [reminderBefore, setReminderBefore] = useState(24);

  // Sistem bilgisi
  const [waConnected, setWaConnected] = useState<boolean | null>(null);
  const [savingWa, setSavingWa] = useState(false);
  const [savingRes, setSavingRes] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiFetch<Health>("/../health" as any)
      .catch(async () => {
        // /api/v1 prefix yok - manuel fetch
        try {
          const base =
            process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
          const res = await fetch(`${base}/health`);
          return res.ok ? ((await res.json()) as Health) : null;
        } catch {
          return null;
        }
      })
      .then((r) => setWaConnected(Boolean(r && r.status === "ok")))
      .catch(() => setWaConnected(false));
  }, []);

  async function saveWa() {
    setSavingWa(true);
    try {
      // TODO: POST /api/v1/settings/whatsapp ile gercek kayit
      await new Promise((r) => setTimeout(r, 400));
      show("WhatsApp ayarları kaydedildi", "success");
    } catch {
      show("Kaydedilemedi", "error");
    } finally {
      setSavingWa(false);
    }
  }

  async function saveReservation() {
    setSavingRes(true);
    try {
      // TODO: POST /api/v1/settings/reservation
      await new Promise((r) => setTimeout(r, 400));
      show("Rezervasyon ayarları kaydedildi", "success");
    } catch {
      show("Kaydedilemedi", "error");
    } finally {
      setSavingRes(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await apiFetch("/whatsapp/test", { method: "POST" }, token);
      show("Test mesajı gönderildi", "success");
    } catch (e) {
      // Endpoint henuz yoksa kullaniciya bilgilendirici mesaj
      if (e instanceof ApiError && e.status === 404) {
        show("Test endpoint'i henüz hazır değil (mock)", "error");
      } else {
        show(`Hata: ${(e as Error).message}`, "error");
      }
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
        <Field label="Yetkili WhatsApp numarası">
          <input
            type="text"
            value={waPhone}
            onChange={(e) => setWaPhone(e.target.value)}
            placeholder="+90..."
            style={inputStyle()}
          />
        </Field>
        <Toggle
          label="Onay bildirimi aktif"
          desc="Yeni rezervasyonlarda yetkiliye WA mesajı gönderilsin."
          value={waApprovalNotif}
          onChange={setWaApprovalNotif}
        />
        <Toggle
          label="Hatırlatma bildirimi aktif"
          desc="Ziyaretten 24 saat önce ziyaretçiye hatırlatma mesajı."
          value={waReminderNotif}
          onChange={setWaReminderNotif}
        />
        <Note>
          WA_ACCESS_TOKEN ve diğer API bilgileri sunucu tarafında <code>.env</code> dosyasından okunur.
        </Note>
        <Action onClick={saveWa} loading={savingWa} label="Kaydet" />
      </Section>

      {/* B) Rezervasyon */}
      <Section title="Rezervasyon Ayarları" fadeClass="fade-up-2">
        <Row2>
          <Field label="Varsayılan süre">
            <select
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(Number(e.target.value))}
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
              value={approvalTimeout}
              onChange={(e) => setApprovalTimeout(Number(e.target.value))}
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
              value={workStart}
              onChange={(e) => setWorkStart(e.target.value)}
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
              value={workEnd}
              onChange={(e) => setWorkEnd(e.target.value)}
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
            value={reminderBefore}
            onChange={(e) => setReminderBefore(Number(e.target.value))}
            style={inputStyle()}
          >
            {[12, 24, 48].map((h) => (
              <option key={h} value={h}>
                {h} saat
              </option>
            ))}
          </select>
        </Field>
        <Action onClick={saveReservation} loading={savingRes} label="Kaydet" />
      </Section>

      {/* C) Bildirim testi */}
      <Section title="Bildirim Testi" fadeClass="fade-up-3">
        <p
          style={{
            fontSize: "13px",
            color: "#1e1b4b",
            margin: "0 0 12px",
          }}
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
    <div
      className="grid grid-cols-1 md:grid-cols-2"
      style={{ gap: "12px" }}
    >
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
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
