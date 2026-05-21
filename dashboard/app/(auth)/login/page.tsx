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
      await signIn("google", { callbackUrl: "/" });
    } finally {
      // signIn redirect ediyor ama yine de sigorta
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-100 via-white to-slate-100">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 text-white flex items-center justify-center text-xl font-semibold shadow-md">
            DM
          </div>
          <div className="mt-3 text-sm text-slate-500">Deneyim Merkezi</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <h1 className="text-2xl font-semibold text-slate-900 text-center">
            Yönetim Paneli
          </h1>
          <p className="text-sm text-slate-500 text-center mt-2">
            Devam etmek için Google hesabınızla giriş yapın.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            className="mt-6 w-full inline-flex items-center justify-center gap-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-medium px-4 py-2.5 rounded-lg border border-slate-300 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            <span>{loading ? "Yönlendiriliyor..." : "Google ile devam et"}</span>
          </button>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Yetkilendirme
            </div>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <p className="mt-3 text-xs text-slate-500 text-center leading-relaxed">
            Yalnızca yönetici tarafından listeye eklenen e-postalar giriş
            yapabilir.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Deneyim Merkezi
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Yükleniyor...
        </div>
      }
    >
      <LoginCard />
    </Suspense>
  );
}
