import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/client";

export type StaffJwtPayload = {
  id: string;
  email: string;
  role: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: StaffJwtPayload;
    user: StaffJwtPayload;
  }
}

// Korumali endpoint'lerde preHandler olarak kullanilir.
// Not: @fastify/jwt server.ts'te root-level register edildigi icin
// app.jwt ve req.jwtVerify her route'da erisilebilir durumda.
//
// Akis:
//   1) Authorization Bearer header var mi? (401)
//   2) JWT imzasi gecerli mi? (401)
//   3) Payload'daki id ile staff DB'de var mi + isActive:true mu? (401)
//      → Silinmis/pasiflestirilmis admin'in mevcut JWT'si bir sonraki istekte
//        anlik gecersiz olur (token expiry beklemez).
//   4) DB'den okunan guncel role'u req.user'a yaz — role degisiklikleri
//      (admin → staff veya tam tersi) anlik yansir; requireAdmin DB-truth okur.
//
// Maliyet: korumali her istekte tek bir indexli staff.findUnique sorgusu.
// Tipik request zaten 5-10 sorgu yapiyor; ekstra overhead ihmal edilebilir.
export async function verifyJWT(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Yetkisiz erişim" });
  }
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Yetkisiz erişim" });
  }

  const userId = req.user?.id;
  if (!userId) {
    return reply.code(401).send({ error: "Yetkisiz erişim" });
  }

  const staff = await prisma.staff.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!staff || !staff.isActive) {
    return reply.code(401).send({ error: "Hesap aktif değil" });
  }

  // Guncel role'u payload'a bas — requireAdmin / route handler'lar bunu okur.
  req.user.role = staff.role;
}
