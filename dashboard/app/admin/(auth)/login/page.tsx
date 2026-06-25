"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.614z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function LoginCard() {
  const params = useSearchParams();
  const errorParam = params.get("error");
  const [loading, setLoading] = useState(false);

  const errorMessage = errorParam
    ? errorParam === "AccessDenied"
      ? "Bu e-posta yetkili değil. Yönetici ile iletişime geçin."
      : "Giriş yapılamadı. Lütfen tekrar deneyin."
    : null;

  async function handleSignIn() {
    setLoading(true);
    try {
      await signIn("google", { callbackUrl: "/admin" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        // Solid zemin (KATMAN 0) body'nin background'undan gelir; burada
        // opak bg VERMIYORUZ ki negatif z-index'li fixed spotlight katmanlari
        // (body bg uzerinde paint olan) gorunebilsin. Container opak bg
        // verseydi block-level paint sirasi spotlight'i orterdi.
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      {/* Spotlight arka plan — KATMAN 0 (solid) root'un background'unda.
          Negatif z-index'li fixed katmanlar root'un solid bg'sinin USTUNDE,
          kart (zIndex:1) ALTINDA paint edilir. */}

      {/* KATMAN 1 — nokta izgara (sabit) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -2,
          pointerEvents: "none",
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* KATMAN 2 — merkez spotlight isik (statik) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.30), transparent 55%)",
        }}
      />

      {/* Dekoratif serif kelime — kose */}
      <div
        aria-hidden
        className="font-serif font-italic"
        style={{
          position: "absolute",
          bottom: "32px",
          left: "32px",
          fontSize: "84px",
          fontWeight: 400,
          color: "var(--gx-accent-light)",
          opacity: 0.12,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        Giriş.
      </div>

      <div
        className="fade-up"
        style={{ width: "100%", maxWidth: "400px", position: "relative", zIndex: 1 }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gigax-logo.png"
            alt="GigaX"
            style={{ height: "36px", width: "auto" }}
          />
        </div>

        {/* Card */}
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(255,255,255,0.02))",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "20px",
            padding: "32px 28px",
          }}
        >
          <h1
            className="font-display"
            style={{
              fontSize: "26px",
              fontWeight: 500,
              color: "var(--gx-text)",
              textAlign: "center",
              letterSpacing: "-0.02em",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Yönetim Paneli
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--gx-text-muted)",
              textAlign: "center",
              margin: "10px 0 0",
              lineHeight: 1.5,
            }}
          >
            Devam etmek için Google{" "}
            <span
              className="font-serif font-italic"
              style={{ color: "var(--gx-accent-light)" }}
            >
              hesabınızla
            </span>{" "}
            giriş yapın.
          </p>

          {errorMessage && (
            <div
              role="alert"
              style={{
                marginTop: "18px",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                color: "var(--gx-danger)",
                fontSize: "13px",
                padding: "10px 12px",
                borderRadius: "10px",
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            style={{
              marginTop: "22px",
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "12px 18px",
              color: "var(--gx-text)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.18s ease",
            }}
            onMouseOver={(e) => {
              if (loading) return;
              e.currentTarget.style.borderColor = "rgba(124,58,237,0.45)";
              e.currentTarget.style.boxShadow =
                "0 0 0 4px rgba(124,58,237,0.10)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <GoogleIcon />
            <span>{loading ? "Yönlendiriliyor..." : "Google ile devam et"}</span>
          </button>

          <div
            style={{
              marginTop: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                fontWeight: 700,
                color: "var(--gx-accent-light)",
              }}
            >
              Yetkilendirme
            </div>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
          </div>

          <p
            style={{
              marginTop: "14px",
              fontSize: "11px",
              color: "var(--gx-text-hint)",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            Yalnızca yönetici tarafından listeye eklenen e-postalar giriş
            yapabilir.
          </p>
        </div>

        <p
          style={{
            marginTop: "20px",
            textAlign: "center",
            fontSize: "11px",
            color: "var(--gx-text-hint)",
            letterSpacing: "0.05em",
          }}
        >
          © {new Date().getFullYear()} GigaX
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "var(--gx-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            color: "var(--gx-text-hint)",
          }}
        >
          Yükleniyor...
        </div>
      }
    >
      <LoginCard />
    </Suspense>
  );
}
