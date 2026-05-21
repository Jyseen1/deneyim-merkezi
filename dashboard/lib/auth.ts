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
  if (!password) {
    console.warn("ADMIN_PASSWORD tanimli degil; backendToken alinamadi");
    return undefined;
  }
  try {
    const res = await fetch(`${backendInternalUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      // Sunucudan sunucuya istek; cache disable
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `Backend auth/login basarisiz (${res.status}); backendToken alinamadi`,
      );
      return undefined;
    }
    const data = (await res.json()) as { token?: string };
    return data.token;
  } catch (err) {
    console.warn("Backend auth/login network hatasi:", (err as Error).message);
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
      // Ilk giriste backend'den uzun-omurlu token al
      if (user && token.email && !token.backendToken) {
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
