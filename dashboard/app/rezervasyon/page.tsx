"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { formatTrLongDate, toLocalIso } from "@/lib/date";

export const dynamic = "force-dynamic";

type AvailableSlot = { startTime: string; endTime: string };
type SlotsResp = { date: string; durationMinutes: number; slots: AvailableSlot[] };

// Telegram Web App SDK runtime tipi
type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  close: () => void;
  sendData: (data: string) => void;
  initDataUnsafe?: {
    // Persistent menu butonundan acilirsa chat_id query'de yok;
    // user.id (Telegram user id) chat_id ile esit.
    user?: { id?: number };
  };
  themeParams?: Record<string, string>;
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const DURATION_OPTIONS = [60, 90, 120, 150, 180];

const COLOR = {
  heading: "#1e1b4b",
  muted: "#818cf8",
  pale: "#a5b4fc",
  cardBg: "rgba(255,255,255,0.85)",
  cardBorder: "rgba(209,196,255,0.6)",
  primary: "#4338ca",
  primaryHover: "#3730a3",
  primaryText: "#e0e7ff",
  ghostBg: "#ede9fe",
  ghostText: "#4338ca",
};

function todayISO(): string {
  return toLocalIso(new Date());
}

// Telefon: store "+905321234567" (sabit +90 prefix + 10 hane);
// goster "+90 532 123 45 67" (3-3-2-2 gruplama).
function formatPhoneDisplay(stored: string): string {
  const digits = stored.replace(/\D/g, "").replace(/^90/, "").slice(0, 10);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ].filter(Boolean);
  return parts.length === 0 ? "+90 " : "+90 " + parts.join(" ");
}

// Kullanici girdisini normalize et: tum non-digit'leri at, leading 90/0 strip,
// ilk 10 haneyi al, "+90" prefix ekle.
function parsePhoneInput(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("90")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  return "+90" + digits;
}

function PageBg() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        background:
          "linear-gradient(135deg, #e8e4ff 0%, #ddd6fe 40%, #d4d4ff 70%, #e8e4ff 100%)",
        backgroundSize: "400% 400%",
        animation: "bgShift 12s ease infinite",
      }}
    />
  );
}

export default function PublicReservationPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#a5b4fc", fontSize: "13px" }}>
          Yükleniyor…
        </div>
      }
    >
      <ReservationForm />
    </Suspense>
  );
}

function ReservationForm() {
  const params = useSearchParams();
  const isTelegram = params.get("source") === "telegram";
  // chat_id iki yolla gelebilir:
  //  - Query (?chat_id=...): /start mesajindan acilan Web App'te elle eklenir
  //  - initDataUnsafe.user.id: Persistent menu butonu acilirken Telegram
  //    runtime'da SDK uzerinden saglar (query bos olur)
  const [telegramChatId, setTelegramChatId] = useState<string | undefined>(
    () => params.get("chat_id") || undefined,
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Adim 1
  const [dateISO, setDateISO] = useState(todayISO());
  const [duration, setDuration] = useState(120);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Adim 2
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+90");
  const [email, setEmail] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [note, setNote] = useState("");

  // Adim 3 / submit
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [alts, setAlts] = useState<AvailableSlot[]>([]);

  // Slotlari cek
  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(null);
    setSelectedSlot(null);
    apiFetch<SlotsResp>(`/slots/available?date=${dateISO}&duration=${duration}`)
      .then((r) => {
        if (!cancelled) setSlots(r.slots);
      })
      .catch((e) => {
        if (!cancelled) {
          setSlots([]);
          setSlotsError(
            e instanceof ApiError ? e.message : (e as Error).message,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateISO, duration, step]);

  function step2Valid(): boolean {
    if (name.trim().length < 2) return false;
    if (!/^\+90\d{10}$/.test(phone)) return false;
    if (groupSize < 1 || groupSize > 20) return false;
    return true;
  }

  // Telegram Web App SDK durumu: loading -> ready (SDK var) | fallback (3sn timeout)
  // Telegram dis web app olmasa bile (chat'ten link tiklanmis) form calismaya devam etmeli.
  type TgState = "ready" | "loading" | "fallback";
  const [tgState, setTgState] = useState<TgState>(isTelegram ? "loading" : "ready");

  useEffect(() => {
    if (!isTelegram) return;
    if (typeof window === "undefined") return;

    function onReady(tg: TelegramWebApp) {
      try {
        tg.ready();
        tg.expand();
      } catch {
        /* sessiz */
      }
      // Menu butonundan acildiysa chat_id query'de yok — SDK'dan al
      const uid = tg.initDataUnsafe?.user?.id;
      if (uid != null) {
        setTelegramChatId((prev) => prev ?? String(uid));
      }
      setTgState("ready");
    }

    // SDK zaten var mi?
    if (window.Telegram?.WebApp) {
      onReady(window.Telegram.WebApp);
      return;
    }

    // SDK yoksa elle ekle (Telegram normalde otomatik enjekte eder, ama
    // bazi durumlarda — orn. dis browser'da acilirsa — eksik olur).
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://telegram.org/js/telegram-web-app.js"]',
    );
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://telegram.org/js/telegram-web-app.js";
      s.async = true;
      document.head.appendChild(s);
    }

    // SDK yuklenene kadar bekle: 100ms araliklarla, max 3sn.
    let elapsed = 0;
    const interval = window.setInterval(() => {
      if (window.Telegram?.WebApp) {
        onReady(window.Telegram.WebApp);
        window.clearInterval(interval);
        return;
      }
      elapsed += 100;
      if (elapsed >= 3000) {
        // SDK gelmedi - normal POST'a dus
        setTgState("fallback");
        window.clearInterval(interval);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [isTelegram]);

  async function submit() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitErr(null);
    setAlts([]);

    // Backend Zod tip kontrolleri icin defansif primitive coercion.
    // Onemli: phone state'i RAW "+905321234567" formatinda — display
    // (boslukli) sadece input value'sunda, body'ye ham gider.
    const body: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      visitDate: dateISO,
      startTime: selectedSlot.startTime,
      durationMinutes: Number(duration),
      groupSize: Number(groupSize),
      note: note.trim() || undefined,
    };

    // Telegram modunda source + chat_id ekle ki backend onay/red mesajini
    // dogru chat'e gondersin. NOT: sendData() SADECE keyboard-button ile
    // acilan Web App'lerde calisir; persistent menu button'dan acilanda
    // sessizce hata verir. Bu yuzden Telegram dahil HER durumda HTTP POST
    // kullaniyoruz.
    if (isTelegram && telegramChatId) {
      body.source = "telegram";
      body.telegramChatId = telegramChatId;
    }

    try {
      const res = await apiFetch<{ id: string }>("/reservations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSuccessId(res.id);
      // Telegram: success sonrasi mini-app'i kapat — onay mesaji
      // chat'e dusecek (sendStaffApproval -> staff onaylar -> visitor confirm).
      if (isTelegram && typeof window !== "undefined") {
        setTimeout(() => {
          try {
            window.Telegram?.WebApp?.close();
          } catch {
            /* sessiz */
          }
        }, 1500);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const errBody = e.body as { available_slots?: AvailableSlot[] } | null;
        setAlts(errBody?.available_slots ?? []);
        setSubmitErr(
          "Bu saat artık müsait değil. Aşağıdaki saatlerden birini deneyebilirsiniz.",
        );
      } else {
        setSubmitErr(
          e instanceof ApiError ? e.message : (e as Error).message,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px 12px",
        overflowX: "hidden",
      }}
    >
      <PageBg />

      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        {/* Header */}
        <div
          className="fade-up"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "12px",
              background: "#e0e7ff",
              color: "#3730a3",
              fontWeight: 700,
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(67,56,202,0.2)",
            }}
          >
            DM
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="gradient-text"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "-0.3px",
                lineHeight: 1.1,
              }}
            >
              Deneyim Merkezi
            </div>
            <div style={{ fontSize: "13px", color: "#818cf8" }}>
              Ziyaret Rezervasyonu
            </div>
          </div>
        </div>

        {/* Stepper */}
        {!successId && <Stepper current={step} />}

        {successId ? (
          <SuccessCard id={successId} dateISO={dateISO} slot={selectedSlot} />
        ) : (
          <div
            className="fade-up fade-up-1"
            style={{
              background: COLOR.cardBg,
              border: `1px solid ${COLOR.cardBorder}`,
              borderRadius: "16px",
              padding: "18px 16px",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              minWidth: 0,
            }}
          >
            {step === 1 && (
              <Step1
                dateISO={dateISO}
                setDateISO={setDateISO}
                duration={duration}
                setDuration={setDuration}
                slots={slots}
                slotsLoading={slotsLoading}
                slotsError={slotsError}
                selectedSlot={selectedSlot}
                setSelectedSlot={setSelectedSlot}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <Step2
                name={name}
                setName={setName}
                phone={phone}
                setPhone={setPhone}
                email={email}
                setEmail={setEmail}
                groupSize={groupSize}
                setGroupSize={setGroupSize}
                note={note}
                setNote={setNote}
                canNext={step2Valid()}
                onPrev={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && (
              <Step3
                summary={{
                  dateISO,
                  slot: selectedSlot,
                  duration,
                  name,
                  phone,
                  email,
                  groupSize,
                  note,
                }}
                onPrev={() => setStep(2)}
                onSubmit={submit}
                submitting={submitting}
                submitErr={submitErr}
                alts={alts}
                onPickAlt={(s) => {
                  setSelectedSlot(s);
                  setAlts([]);
                  setSubmitErr(null);
                }}
              />
            )}
          </div>
        )}

        <p
          style={{
            marginTop: "16px",
            textAlign: "center",
            fontSize: "11px",
            color: "#a5b4fc",
          }}
        >
          © {new Date().getFullYear()} Deneyim Merkezi
        </p>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Tarih & Saat" },
    { n: 2, label: "Bilgiler" },
    { n: 3, label: "Onay" },
  ];
  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        marginBottom: "16px",
      }}
    >
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div
            key={s.n}
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              gap: "8px",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: active || done ? "#4338ca" : "rgba(255,255,255,0.7)",
                color: active || done ? "#e0e7ff" : "#a5b4fc",
                border:
                  active || done ? "none" : "1px solid rgba(209,196,255,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                flexShrink: 0,
                transition: "all 0.2s ease",
              }}
            >
              {done ? "✓" : s.n}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: active ? "#1e1b4b" : "#818cf8",
                fontWeight: active ? 600 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: "1px",
                  background:
                    current > s.n ? "#4338ca" : "rgba(165,180,252,0.4)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1(props: {
  dateISO: string;
  setDateISO: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  slots: AvailableSlot[];
  slotsLoading: boolean;
  slotsError: string | null;
  selectedSlot: AvailableSlot | null;
  setSelectedSlot: (s: AvailableSlot | null) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <Field label="Ziyaret tarihi">
        <input
          type="date"
          min={todayISO()}
          value={props.dateISO}
          onChange={(e) => props.setDateISO(e.target.value)}
          style={fieldInput()}
        />
      </Field>

      <Field label="Süre" style={{ marginTop: "14px" }}>
        <select
          value={props.duration}
          onChange={(e) => props.setDuration(Number(e.target.value))}
          style={fieldInput()}
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} dk
            </option>
          ))}
        </select>
      </Field>

      <div style={{ marginTop: "18px" }}>
        <div
          style={{
            fontSize: "10px",
            color: "#818cf8",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "10px",
          }}
        >
          Müsait Saatler
        </div>
        {props.slotsLoading && (
          <div
            className="grid grid-cols-2"
            style={{ gap: "8px" }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="shimmer"
                style={{ height: "44px", borderRadius: "10px" }}
              />
            ))}
          </div>
        )}
        {!props.slotsLoading && props.slotsError && (
          <div
            style={{
              padding: "10px 12px",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              fontSize: "12px",
              color: "#991b1b",
            }}
          >
            Müsait saatler alınamadı: {props.slotsError}
          </div>
        )}
        {!props.slotsLoading && !props.slotsError && props.slots.length === 0 && (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              color: "#a5b4fc",
              fontSize: "13px",
              border: "1px dashed #c4b5fd",
              borderRadius: "10px",
            }}
          >
            Bu gün için müsait saat bulunmuyor.
          </div>
        )}
        {!props.slotsLoading && props.slots.length > 0 && (
          <div
            className="grid grid-cols-2"
            style={{ gap: "8px" }}
          >
            {props.slots.map((s) => {
              const active =
                props.selectedSlot?.startTime === s.startTime &&
                props.selectedSlot?.endTime === s.endTime;
              return (
                <button
                  key={`${s.startTime}-${s.endTime}`}
                  type="button"
                  onClick={() => props.setSelectedSlot(s)}
                  style={{
                    padding: "12px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: active ? "#4338ca" : "#ede9fe",
                    color: active ? "#e0e7ff" : "#4338ca",
                    border: active ? "1px solid #4338ca" : "1px solid transparent",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.border = "1px solid #c4b5fd";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      e.currentTarget.style.border = "1px solid transparent";
                  }}
                >
                  {s.startTime} – {s.endTime}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn-primary"
          onClick={props.onNext}
          disabled={!props.selectedSlot}
          style={{ opacity: props.selectedSlot ? 1 : 0.5, cursor: props.selectedSlot ? "pointer" : "not-allowed" }}
        >
          İleri →
        </button>
      </div>
    </div>
  );
}

function Step2(props: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  groupSize: number;
  setGroupSize: (v: number) => void;
  note: string;
  setNote: (v: string) => void;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <Field label="Ad Soyad *">
        <input
          type="text"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          placeholder="Adınız ve soyadınız"
          style={fieldInput()}
          required
        />
      </Field>
      <Field label="Telefon *" style={{ marginTop: "12px" }}>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={formatPhoneDisplay(props.phone)}
          onChange={(e) => props.setPhone(parsePhoneInput(e.target.value))}
          placeholder="+90 5XX XXX XX XX"
          style={fieldInput()}
        />
        <div style={{ fontSize: "11px", color: "#a5b4fc", marginTop: "4px" }}>
          Onay mesajı bu numaraya gönderilecek.
        </div>
      </Field>
      <Field label="E-posta (opsiyonel)" style={{ marginTop: "12px" }}>
        <input
          type="email"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          placeholder="ornek@email.com"
          style={fieldInput()}
        />
      </Field>
      <Field label="Kişi sayısı *" style={{ marginTop: "12px" }}>
        <GroupSizeStepper
          value={props.groupSize}
          onChange={props.setGroupSize}
        />
      </Field>
      <Field label="Not (opsiyonel)" style={{ marginTop: "12px" }}>
        <textarea
          value={props.note}
          onChange={(e) => props.setNote(e.target.value)}
          rows={3}
          placeholder="Özel istekleriniz..."
          style={{ ...fieldInput(), resize: "vertical" }}
        />
      </Field>

      <div
        style={{
          marginTop: "20px",
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <button
          type="button"
          className="btn-ghost"
          onClick={props.onPrev}
        >
          ← Geri
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={props.onNext}
          disabled={!props.canNext}
          style={{ opacity: props.canNext ? 1 : 0.5, cursor: props.canNext ? "pointer" : "not-allowed" }}
        >
          İleri →
        </button>
      </div>
    </div>
  );
}

type SummaryProps = {
  dateISO: string;
  slot: AvailableSlot | null;
  duration: number;
  name: string;
  phone: string;
  email: string;
  groupSize: number;
  note: string;
};

function Step3(props: {
  summary: SummaryProps;
  onPrev: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitErr: string | null;
  alts: AvailableSlot[];
  onPickAlt: (s: AvailableSlot) => void;
}) {
  const s = props.summary;
  return (
    <div>
      <div
        style={{
          background: "#faf5ff",
          border: "1px solid #ede9fe",
          borderRadius: "12px",
          padding: "10px 12px",
          minWidth: 0,
        }}
      >
        <SumRow icon="📅" label="Tarih" value={formatTrLongDate(s.dateISO)} />
        <SumRow
          icon="🕒"
          label="Saat"
          value={s.slot ? `${s.slot.startTime} – ${s.slot.endTime}` : "-"}
        />
        <SumRow icon="⏱" label="Süre" value={`${s.duration} dk`} />
        <SumRow icon="👤" label="Ad Soyad" value={s.name} />
        <SumRow icon="📱" label="Telefon" value={s.phone} />
        {s.email && <SumRow icon="✉" label="E-posta" value={s.email} />}
        <SumRow icon="👥" label="Kişi" value={`${s.groupSize} kişi`} />
        {s.note && <SumRow icon="📝" label="Not" value={s.note} last />}
      </div>

      {props.submitErr && (
        <div
          style={{
            marginTop: "14px",
            padding: "10px 12px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: "10px",
            fontSize: "12px",
          }}
        >
          {props.submitErr}
          {props.alts.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                Alternatif saatler:
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0,1fr))",
                  gap: "6px",
                }}
              >
                {props.alts.map((a) => (
                  <button
                    key={`${a.startTime}-${a.endTime}`}
                    type="button"
                    onClick={() => props.onPickAlt(a)}
                    style={{
                      background: "#ede9fe",
                      color: "#4338ca",
                      border: "1px solid #ddd6fe",
                      borderRadius: "8px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {a.startTime} – {a.endTime}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: "20px",
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <button type="button" className="btn-ghost" onClick={props.onPrev}>
          ← Geri
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={props.onSubmit}
          disabled={props.submitting || !s.slot}
        >
          {props.submitting ? "Gönderiliyor..." : "Rezervasyon Talebi Gönder"}
        </button>
      </div>
    </div>
  );
}

function SumRow({
  icon,
  label,
  value,
  last,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "8px 0",
        borderBottom: last ? "none" : "1px solid rgba(237,233,254,0.7)",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "14px",
          width: "18px",
          textAlign: "center",
          flexShrink: 0,
          lineHeight: 1.4,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: "11px",
          color: "#818cf8",
          width: "60px",
          flexShrink: 0,
          lineHeight: 1.4,
          paddingTop: "1px",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "12.5px",
          color: "#1e1b4b",
          flex: 1,
          minWidth: 0,
          fontWeight: 500,
          lineHeight: 1.4,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SuccessCard({
  id,
  dateISO,
  slot,
}: {
  id: string;
  dateISO: string;
  slot: AvailableSlot | null;
}) {
  return (
    <div
      className="fade-up fade-up-1"
      style={{
        background: "rgba(255,255,255,0.85)",
        border: "1px solid rgba(209,196,255,0.6)",
        borderRadius: "16px",
        padding: "26px 22px",
        textAlign: "center",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          width: "76px",
          height: "76px",
          borderRadius: "50%",
          background: "#d1fae5",
          color: "#059669",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
          fontSize: "36px",
          lineHeight: 1,
        }}
      >
        ✓
      </div>
      <h2
        className="gradient-text"
        style={{
          fontSize: "20px",
          fontWeight: 700,
          letterSpacing: "-0.3px",
          margin: 0,
        }}
      >
        Talebiniz alındı
      </h2>
      <p style={{ fontSize: "13px", color: "#1e1b4b", margin: "8px 0 4px" }}>
        Onay için WhatsApp mesajı bekleyiniz.
      </p>
      <p style={{ fontSize: "11px", color: "#818cf8", margin: "0 0 14px" }}>
        {formatTrLongDate(dateISO)} {slot ? `· ${slot.startTime} – ${slot.endTime}` : ""}
      </p>
      <div
        style={{
          background: "#faf5ff",
          border: "1px solid #ede9fe",
          borderRadius: "10px",
          padding: "10px 12px",
          fontSize: "11px",
          color: "#818cf8",
        }}
      >
        Rezervasyon kodu:{" "}
        <span
          style={{
            color: "#4338ca",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
            fontWeight: 600,
          }}
        >
          {id.slice(0, 8).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function GroupSizeStepper({
  value,
  onChange,
  min = 1,
  max = 20,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const safe = Math.max(min, Math.min(max, Math.trunc(value) || min));
  const dec = () => onChange(Math.max(min, safe - 1));
  const inc = () => onChange(Math.min(max, safe + 1));
  const atMin = safe <= min;
  const atMax = safe >= max;

  const btnBase: React.CSSProperties = {
    minWidth: "40px",
    minHeight: "40px",
    borderRadius: "10px",
    border: "1px solid #ddd6fe",
    background: "#ede9fe",
    color: "#4338ca",
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    transition: "background 0.15s ease, opacity 0.15s ease",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: "8px",
        width: "100%",
      }}
    >
      <button
        type="button"
        onClick={dec}
        disabled={atMin}
        aria-label="Azalt"
        style={{
          ...btnBase,
          opacity: atMin ? 0.4 : 1,
          cursor: atMin ? "not-allowed" : "pointer",
        }}
      >
        −
      </button>
      <div
        style={{
          flex: 1,
          minHeight: "40px",
          borderRadius: "10px",
          border: "1px solid #ede9fe",
          background: "rgba(255,255,255,0.85)",
          color: "#1e1b4b",
          fontSize: "14px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.01em",
        }}
        aria-live="polite"
      >
        {safe} kişi
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={atMax}
        aria-label="Arttır"
        style={{
          ...btnBase,
          opacity: atMax ? 0.4 : 1,
          cursor: atMax ? "not-allowed" : "pointer",
        }}
      >
        +
      </button>
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
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

function fieldInput(): React.CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box", // padding+border ic genislige dahil — dar viewport'ta yatay tasmayi onler
    display: "block",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #ede9fe",
    background: "rgba(255,255,255,0.85)",
    color: "#1e1b4b",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit",
  };
}
