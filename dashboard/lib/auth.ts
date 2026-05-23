import type { NextAuthOptions } from "next-auth";
import { getServerSession as nextAuthGetServerSession } from "next-auth/next";
import GoogleProvider from "next-auth/providers/google";

function backendInternalUrl(): string {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:3001"
  );
}

// Google ile login: backend'in /api/v1/auth/google-login endpoint'ine shared
// secret + email gönderir. Backend Staff tablosunda email arar, isActive
// kontrolü yapar, JWT döndürür. Şifre kontrolü YOK — Google OAuth zaten
// email sahipliğini kanıtlamış. Yetki tek doğruluk kaynağı: Staff tablosu.
//
// Önceki sürüm /auth/login + ADMIN_PASSWORD kullanıyordu; bu tüm staff'ı
// ortak şifreye kilitliyordu. Yeni mimaride staff eklemek tek bir DB INSERT,
// re-deploy gerekmez.
async function fetchBackendToken(email: string): Promise<string | undefined> {
  const sharedSecret = process.env.NEXTAUTH_BACKEND_SECRET;
  const url = backendInternalUrl();
  if (!sharedSecret) {
    console.error(
      "[auth] NEXTAUTH_BACKEND_SECRET env tanimli degil — backendToken alinamiyor",
    );
    return undefined;
  }
  try {
    const res = await fetch(`${url}/api/v1/auth/google-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sharedSecret }),
      cache: "no-store",
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(
        `[auth] Backend /auth/google-login basarisiz status=${res.status} url=${url} email=${email} body=${bodyText.slice(0, 200)}`,
      );
      return undefined;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      console.error(
        `[auth] Backend /auth/google-login 200 ama token yok url=${url} email=${email}`,
      );
      return undefined;
    }
    return data.token;
  } catch (err) {
    console.error(
      `[auth] Backend /auth/google-login network hatasi url=${url} email=${email}:`,
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
    // signIn callback artık ALLOWED_EMAILS env'ine bakmıyor. Tek doğruluk
    // kaynağı backend Staff tablosu. Burada backend'e ön-kontrol HTTP isteği
    // atarak yetkili olmayanı login sayfasında "AccessDenied" ile reddediyoruz
    // (jwt callback'te token alamamış olarak loop'a girmesin diye).
    async signIn({ user }) {
      if (!user.email) return false;
      const token = await fetchBackendToken(user.email);
      return Boolean(token);
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      // backendToken eksikse her seferinde tekrar dene — bir önceki turdaki
      // race condition için defansif kalsın.
      if (token.email && !token.backendToken) {
        token.backendToken = await fetchBackendToken(token.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          (token.userId as string | undefined) ?? token.sub ?? "";
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
