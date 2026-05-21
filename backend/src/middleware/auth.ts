import type { FastifyReply, FastifyRequest } from "fastify";

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
}
