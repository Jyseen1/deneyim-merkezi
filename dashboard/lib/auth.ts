import type { NextAuthOptions } from "next-auth";
import { getServerSession as nextAuthGetServerSession } from "next-auth/next";
import GoogleProvider from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  if (allowedEmails.length === 0) return false;
  return allowedEmails.includes(email.toLowerCase());
}

function backendInternalUrl(): string {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:3001"
  );
}

async function fetchBackendToken(email: string): Promise<string | undefined> {
  const password = process.env.ADMIN_PASSWORD;
  const url = backendInternalUrl();
  // Tanı için kritik: env eksikliği veya yanlış URL Vercel function log'unda
  // net görünsün — bu tek başına token zincirinin koptuğu en sık sebep.
  if (!password) {
    console.error(
      "[auth] ADMIN_PASSWORD env tanimli degil — backendToken alinamiyor",
    );
    return undefined;
  }
  try {
    const res = await fetch(`${url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(
        `[auth] Backend /auth/login basarisiz status=${res.status} url=${url} email=${email} body=${bodyText.slice(0, 200)}`,
      );
      return undefined;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      console.error(
        `[auth] Backend /auth/login 200 ama token yok url=${url} email=${email}`,
      );
      return undefined;
    }
    return data.token;
  } catch (err) {
    console.error(
      `[auth] Backend /auth/login network hatasi url=${url} email=${email}:`,
      (err as Error).message,
    );
    return undefined;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowed(user.email);
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      // backendToken eksikse HER seferinde tekrar dene — `user` parametresi
      // sadece signIn akışından hemen sonraki ilk callback'te dolar, sonra
      // hep undefined gelir. Önceki sürümde `if (user && ...)` koşulu ilk
      // denemede backend cevap vermediğinde session ömrü boyunca token'sız
      // kalmaya neden oluyordu (Railway cold-start, ADMIN_PASSWORD eksik vs.
      // tek bir geçici hata kullanıcıyı sonsuz login döngüsüne kilitliyordu).
      if (token.email && !token.backendToken) {
        token.backendToken = await fetchBackendToken(token.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? token.sub ?? "";
      }
      session.backendToken = token.backendToken;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function getServerSession() {
  return nextAuthGetServerSession(authOptions);
}
