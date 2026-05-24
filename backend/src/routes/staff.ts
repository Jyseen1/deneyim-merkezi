import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client";
import { verifyJWT } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";

const BCRYPT_COST = 10;

// Google-only kullanıcılar password/waPhone vermez — ikisi de optional.
// passwordHash null kalırsa şifreyle direkt login (POST /auth/login) yapılamaz,
// sadece /auth/google-login üzerinden Google ile giriş mümkün olur.
const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  waPhone: z.string().min(5).max(32).optional().nullable(),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["admin", "staff"]).default("staff"),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  waPhone: z.string().min(5).max(32).optional().nullable(),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["admin", "staff"]).optional(),
  isActive: z.boolean().optional(),
});

function publicView(s: {
  id: string;
  name: string;
  email: string;
  waPhone: string | null;
  role: string;
  isActive: boolean;
}) {
  return s; // passwordHash select edilmedigi icin zaten dahil degil
}

const staffRoutes: FastifyPluginAsync = async (app) => {
  // Tum staff endpoint'leri JWT gerekir; mutasyonlar (POST/PATCH/DELETE) admin gerektirir.
  app.get(
    "/",
    { preHandler: verifyJWT },
    async (_req, reply) => {
      const list = await prisma.staff.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          waPhone: true,
          role: true,
          isActive: true,
        },
      });
      return reply.send({ items: list.map(publicView) });
    },
  );

  app.post(
    "/",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const { name, email, waPhone, password, role } = parsed.data;
      // password verilmediyse passwordHash null — Google-only kullanıcı
      const passwordHash = password
        ? await bcrypt.hash(password, BCRYPT_COST)
        : null;

      // Reaktivasyon akisi: ayni email zaten varsa
      //   - isActive:true  → 409 (zaten aktif)
      //   - isActive:false → mevcut kaydi update et (isActive:true + yeni
      //     alanlar). DB'de tekrarlanmaz, eski geçmiş korunur.
      const existing = await prisma.staff.findUnique({
        where: { email },
        select: { id: true, isActive: true },
      });
      if (existing) {
        if (existing.isActive) {
          return reply
            .code(409)
            .send({ error: "Bu e-posta zaten aktif olarak kayıtlı" });
        }
        try {
          const reactivated = await prisma.staff.update({
            where: { id: existing.id },
            data: {
              isActive: true,
              name,
              waPhone: waPhone ?? null,
              role,
              // password verilmediyse passwordHash'i degistirme (eski
              // kalmis hash silinmesin diye conditional set).
              ...(passwordHash !== null ? { passwordHash } : {}),
            },
            select: {
              id: true,
              name: true,
              email: true,
              waPhone: true,
              role: true,
              isActive: true,
            },
          });
          return reply
            .code(200)
            .send({ ...publicView(reactivated), reactivated: true });
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === "P2002") {
            return reply
              .code(409)
              .send({ error: "Bu telefon başka bir kullanıcıda kayıtlı" });
          }
          req.log.error({ err }, "staff reactivate hata");
          return reply.code(500).send({ error: "internal_error" });
        }
      }

      try {
        const created = await prisma.staff.create({
          data: {
            name,
            email,
            waPhone: waPhone ?? null,
            role,
            passwordHash,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            waPhone: true,
            role: true,
            isActive: true,
          },
        });
        return reply.code(201).send(publicView(created));
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
          return reply
            .code(409)
            .send({ error: "Bu e-posta veya telefon zaten kayıtlı" });
        }
        req.log.error({ err }, "staff create hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const data: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.password) {
        data.passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
        delete data.password;
      }
      try {
        const updated = await prisma.staff.update({
          where: { id: req.params.id },
          data,
          select: {
            id: true,
            name: true,
            email: true,
            waPhone: true,
            role: true,
            isActive: true,
          },
        });
        return reply.send(publicView(updated));
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2025") return reply.code(404).send({ error: "not_found" });
        if (code === "P2002")
          return reply
            .code(409)
            .send({ error: "Bu e-posta veya telefon zaten kayıtlı" });
        req.log.error({ err }, "staff update hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // Soft delete: isActive=false. Kullanıcı kendini silemez (sistem dışı kalmasın).
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      if (req.user?.id === req.params.id) {
        return reply
          .code(403)
          .send({ error: "Kendi hesabınızı pasif yapamazsınız" });
      }
      try {
        await prisma.staff.update({
          where: { id: req.params.id },
          data: { isActive: false },
        });
        return reply.code(204).send();
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2025") return reply.code(404).send({ error: "not_found" });
        req.log.error({ err }, "staff soft delete hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // Hard delete: DB'den kalıcı kaldırır. Yalnızca ZATEN PASİF kayıtlar için —
  // aktif birini önce pasifleştirmek (soft-delete) gerekir. Bu iki adımlı
  // akış, yanlışlıkla aktif admin'in kalıcı silinmesini engeller.
  // Staff modelinin baska tabloyla iliskisi yok + Reservation.approvedBy duz
  // String (FK degil) → prisma.staff.delete() FK constraint'e takilmaz,
  // gecmis rezervasyonlar approvedBy degerini metin olarak korur.
  app.delete<{ Params: { id: string } }>(
    "/:id/permanent",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      if (req.user?.id === req.params.id) {
        return reply
          .code(403)
          .send({ error: "Kendi hesabınızı kalıcı silemezsiniz" });
      }
      const target = await prisma.staff.findUnique({
        where: { id: req.params.id },
        select: { isActive: true },
      });
      if (!target) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (target.isActive) {
        return reply
          .code(409)
          .send({ error: "Önce pasifleştirin, sonra kalıcı silin" });
      }
      try {
        await prisma.staff.delete({ where: { id: req.params.id } });
        return reply.code(204).send();
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2025") return reply.code(404).send({ error: "not_found" });
        req.log.error({ err }, "staff hard delete hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );
};

export default staffRoutes;
