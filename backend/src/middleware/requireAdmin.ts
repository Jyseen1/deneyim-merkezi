import type { FastifyReply, FastifyRequest } from "fastify";

// verifyJWT'den SONRA preHandler zinciri icinde calistirilir.
// request.user `@fastify/jwt` tarafindan doldurulur (StaffJwtPayload).
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const role = req.user?.role;
  if (role !== "admin") {
    return reply.code(403).send({ error: "Yönetici yetkisi gerekli" });
  }
}
