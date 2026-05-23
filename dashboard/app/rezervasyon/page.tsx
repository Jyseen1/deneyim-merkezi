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

// GigaX paleti — koyu cam, mor aksan
const COLOR = {
  heading: "var(--gx-text)",
  muted: "var(--gx-text-muted)",
  pale: "var(--gx-text-hint)",
  cardBg:
    "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(255,255,255,0.02)), #16161D",
  cardBorder: "var(--gx-border)",
  primary: "var(--gx-accent)",
  primaryHover: "var(--gx-accent-light)",
  primaryText: "#ffffff",
  ghostBg: "var(--gx-surface)",
  ghostText: "var(--gx-text)",
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
        background: "var(--gx-bg)",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* Üst kose mor perde */}
      <div
        style={{
          position: "absolute",
          top: "-180px",
          right: "-120px",
          width: "480px",
          height: "480px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(124,58,237,0.28) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />
      {/* Alt kose hafif glow */}
      <div
        style={{
          position: "absolute",
          bottom: "-160px",
          left: "-160px",
          width: "440px",
          height: "440px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />
    </div>
  );
}

export default function PublicReservationPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--gx-text-hint)",
            fontSize: "13px",
            background: "var(--gx-bg)",
          }}
        >
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
    // Defansif: hicbir kosulda sessizce dusmesin. Dis try/catch sync
    // hatalari (JSON.stringify, string coercion vs.) da yakalar.
    setSubmitting(true);
    setSubmitErr(null);
    setAlts([]);

    try {
      if (!selectedSlot) {
        setSubmitErr("Lütfen önce bir saat seçin.");
        return;
      }

      // Backend Zod tip kontrolleri icin defansif primitive coercion.
      // Phone state'i RAW "+905321234567" formatinda — display (boslukli)
      // sadece input value'sunda, body'ye ham gider.
      const body: Record<string, unknown> = {
        name: String(name).trim(),
        phone: String(phone).trim(),
        email: email.trim() || undefined,
        visitDate: String(dateISO),
        startTime: String(selectedSlot.startTime),
        durationMinutes: Number(duration),
        groupSize: Number(groupSize),
        note: note.trim() || undefined,
      };

      // Telegram modunda source + chat_id ekle ki backend onay/red mesajini
      // dogru chat'e gondersin. NOT: WebApp.sendData() SADECE keyboard-button
      // ile acilan Web App'lerde calisir; persistent menu button'dan acilanda
      // sessizce hata verir + Telegram pencereyi yine de kapatir. Bu yuzden
      // Telegram dahil HER durumda HTTP POST kullaniyoruz.
      if (isTelegram && telegramChatId) {
        body.source = "telegram";
        body.telegramChatId = String(telegramChatId);
      }

      // Debug — sadece dev, production'da sessiz
      const DEBUG_DEV = process.env.NODE_ENV !== "production";
      if (DEBUG_DEV) {
        console.log("[rezervasyon] submit", {
          isTelegram,
          telegramChatId,
          bodyPreview: { ...body, phone: "***" },
        });
      }

      let payload: string;
      try {
        payload = JSON.stringify(body);
      } catch (jsonErr) {
        if (DEBUG_DEV) console.error("[rezervasyon] JSON.stringify hata", jsonErr);
        setSubmitErr("Form verisi seri hale getirilemedi.");
        return;
      }

      if (DEBUG_DEV) console.log("[rezervasyon] POST start, bytes:", payload.length);
      const res = await apiFetch<{ id: string }>("/reservations", {
        method: "POST",
        body: payload,
      });
      if (DEBUG_DEV) console.log("[rezervasyon] POST success, id:", res.id);
      setSuccessId(res.id);

      // Telegram: success sonrasi mini-app'i kapat — onay mesaji chat'e dusecek.
      // 1500ms gecikme: kullanici success kartini gorsun + state guvenle commit
      // edilsin. close() KESINLIKLE await sonrasinda, basariliysa cagriliyor.
      if (isTelegram && typeof window !== "undefined") {
        setTimeout(() => {
          try {
            window.Telegram?.WebApp?.close();
          } catch {
            /* sessiz — WebApp.close kritik degil */
          }
        }, 1500);
      }
    } catch (e) {
      // Hatalar her zaman log'lansin (error visibility için).
      console.error("[rezervasyon] submit hata", e);
      if (e instanceof ApiError && e.status === 409) {
        const errBody = e.body as { available_slots?: AvailableSlot[] } | null;
        setAlts(errBody?.available_slots ?? []);
        setSubmitErr(
          "Bu saat artık müsait değil. Aşağıdaki saatlerden birini deneyebilirsiniz.",
        );
      } else if (e instanceof ApiError && e.status === 429) {
        // Spam koruma: ayni numaradan cok bekleyen talep.
        const errBody = e.body as { message?: string } | null;
        setSubmitErr(
          errBody?.message ??
            "Çok fazla bekleyen talebiniz var, lütfen mevcut taleplerinizin onaylanmasını bekleyin.",
        );
      } else if (e instanceof ApiError) {
        // Backend dogrulama/HTTP hatasi — message + status
        setSubmitErr(`Hata: ${e.message} (HTTP ${e.status})`);
      } else {
        setSubmitErr(
          `Beklenmeyen hata: ${(e as Error).message || String(e)}`,
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
        {/* Header — GigaX logo + uppercase etiket + büyük başlık + italic dokunuş */}
        <div
          className="fade-up"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minWidth: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/gigax-logo.png"
              alt="GigaX"
              style={{ height: "26px", width: "auto", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: "10px",
                color: "var(--gx-accent-light)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
                paddingTop: "2px",
              }}
            >
              Rezervasyon
            </span>
          </div>
          {!successId && (
            <div style={{ marginTop: "4px" }}>
              <h1
                className="font-display"
                style={{
                  fontSize: "28px",
                  fontWeight: 600,
                  color: "var(--gx-text)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  margin: 0,
                }}
              >
                Ziyaret{" "}
                <span
                  className="font-serif font-italic"
                  style={{
                    fontWeight: 400,
                    color: "var(--gx-accent-light)",
                    letterSpacing: "0",
                  }}
                >
                  planla
                </span>
              </h1>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--gx-text-muted)",
                  margin: "6px 0 0",
                  lineHeight: 1.5,
                }}
              >
                Tarih ve saati seç, bilgilerini bırak — gerisini biz yapalım.
              </p>
            </div>
          )}
        </div>

        {/* Stepper */}
        {!successId && <Stepper current={step} />}

        {successId ? (
          <SuccessCard id={successId} dateISO={dateISO} slot={selectedSlot} />
        ) : (
          <div
            className="glass fade-up fade-up-1"
            style={{
              padding: "20px 18px",
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
            color: "var(--gx-text-hint)",
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
                width: "30px",
                height: "30px",
                borderRadius: "50%",
                background:
                  active || done ? "var(--gx-gradient)" : "var(--gx-surface)",
                color:
                  active || done ? "#ffffff" : "var(--gx-text-hint)",
                border:
                  active || done
                    ? "none"
                    : "1px solid var(--gx-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                flexShrink: 0,
                transition: "all 0.2s ease",
                boxShadow:
                  active || done
                    ? "0 4px 12px rgba(124,58,237,0.35)"
                    : "none",
              }}
            >
              {done ? "✓" : s.n}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: active ? "var(--gx-text)" : "var(--gx-text-muted)",
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
                    current > s.n
                      ? "var(--gx-accent)"
                      : "var(--gx-border)",
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
        {/* iOS Safari/Telegram WebView date input'unu container icine kilitle:
            wrapper width:100% + overflow:hidden + minWidth:0 + flex zinciri
            input'un intrinsic genislemesini engeller. */}
        <div
          style={{
            display: "flex",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <input
            type="date"
            min={todayISO()}
            value={props.dateISO}
            onChange={(e) => props.setDateISO(e.target.value)}
            style={{ ...fieldInput(), flex: 1 }}
          />
        </div>
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
            color: "var(--gx-text-muted)",
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
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.30)",
              borderRadius: "10px",
              fontSize: "12px",
              color: "var(--gx-danger)",
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
              color: "var(--gx-text-hint)",
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
                    background: active
                      ? "var(--gx-gradient)"
                      : "var(--gx-surface)",
                    color: active ? "#ffffff" : "var(--gx-text-muted)",
                    border: active
                      ? "1px solid var(--gx-accent)"
                      : "1px solid var(--gx-border)",
                    transition: "all 0.15s ease",
                    boxShadow: active
                      ? "0 4px 14px rgba(124,58,237,0.30)"
                      : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.border =
                        "1px solid var(--gx-border-accent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      e.currentTarget.style.border =
                        "1px solid var(--gx-border)";
                  }}
                >
                  {s.startTime} – {s.endTime}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: "22px" }}>
        <button
          type="button"
          className="btn-primary"
          onClick={props.onNext}
          disabled={!props.selectedSlot}
          style={{
            width: "100%",
            justifyContent: "center",
            opacity: props.selectedSlot ? 1 : 0.5,
            cursor: props.selectedSlot ? "pointer" : "not-allowed",
            padding: "13px 20px",
            fontSize: "14px",
          }}
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
        <div style={{ fontSize: "11px", color: "var(--gx-text-hint)", marginTop: "4px" }}>
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
          marginTop: "22px",
          display: "flex",
          gap: "10px",
        }}
      >
        <button
          type="button"
          className="btn-ghost"
          onClick={props.onPrev}
          style={{ flexShrink: 0 }}
        >
          ← Geri
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={props.onNext}
          disabled={!props.canNext}
          style={{
            flex: 1,
            justifyContent: "center",
            opacity: props.canNext ? 1 : 0.5,
            cursor: props.canNext ? "pointer" : "not-allowed",
            padding: "13px 20px",
            fontSize: "14px",
          }}
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
          background: "var(--gx-surface)",
          border: "1px solid var(--gx-border)",
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
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            color: "var(--gx-danger)",
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
                      background: "rgba(124,58,237,0.15)",
                      color: "var(--gx-accent-light)",
                      border: "1px solid var(--gx-border-accent)",
                      borderRadius: "8px",
                      padding: "7px 10px",
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
          marginTop: "22px",
          display: "flex",
          gap: "10px",
        }}
      >
        <button
          type="button"
          className="btn-ghost"
          onClick={props.onPrev}
          style={{ flexShrink: 0 }}
        >
          ← Geri
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={props.onSubmit}
          disabled={props.submitting || !s.slot}
          style={{
            flex: 1,
            justifyContent: "center",
            padding: "13px 20px",
            fontSize: "14px",
          }}
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
          color: "var(--gx-text-muted)",
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
          color: "var(--gx-text)",
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
      className="glass fade-up fade-up-1"
      style={{
        padding: "28px 22px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "76px",
          height: "76px",
          borderRadius: "50%",
          background: "rgba(74,222,128,0.18)",
          color: "var(--gx-success)",
          border: "1px solid rgba(74,222,128,0.35)",
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
        className="gradient-text font-display"
        style={{
          fontSize: "20px",
          fontWeight: 700,
          letterSpacing: "-0.3px",
          margin: 0,
        }}
      >
        Talebiniz alındı
      </h2>
      <p style={{ fontSize: "13px", color: "var(--gx-text)", margin: "8px 0 4px" }}>
        Onay için WhatsApp mesajı bekleyiniz.
      </p>
      <p style={{ fontSize: "11px", color: "var(--gx-text-muted)", margin: "0 0 14px" }}>
        {formatTrLongDate(dateISO)} {slot ? `· ${slot.startTime} – ${slot.endTime}` : ""}
      </p>
      <div
        style={{
          background: "var(--gx-surface)",
          border: "1px solid var(--gx-border)",
          borderRadius: "10px",
          padding: "10px 12px",
          fontSize: "11px",
          color: "var(--gx-text-muted)",
        }}
      >
        Rezervasyon kodu:{" "}
        <span
          style={{
            color: "var(--gx-accent-light)",
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
    minWidth: "44px",
    minHeight: "44px",
    borderRadius: "10px",
    border: "1px solid var(--gx-border-accent)",
    background: "rgba(124,58,237,0.15)",
    color: "var(--gx-accent-light)",
    fontSize: "20px",
    fontWeight: 700,
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
          minHeight: "44px",
          borderRadius: "10px",
          border: "1px solid var(--gx-border)",
          background: "var(--gx-surface)",
          color: "var(--gx-text)",
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

function fieldInput(): React.CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    display: "block",
    padding: "11px 13px",
    borderRadius: "10px",
    border: "1px solid var(--gx-border)",
    background: "var(--gx-surface)",
    color: "var(--gx-text)",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit",
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
  };
}
