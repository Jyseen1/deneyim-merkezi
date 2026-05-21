import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const admin = process.env.ADMIN_PASSWORD;
    if (!admin) {
      req.log.error("ADMIN_PASSWORD tanimli degil");
      return reply.code(500).send({ error: "server_misconfigured" });
    }

    // TODO: Production'da bcrypt + Staff tablosunda hash'lenmis sifreye gec.
    if (password !== admin) {
      return reply.code(401).send({ error: "Geçersiz e-posta veya şifre" });
    }

    const staff = await prisma.staff.findUnique({ where: { email } });

    if (staff) {
      if (!staff.isActive) {
        return reply.code(403).send({ error: "Hesap pasif" });
      }
      const token = app.jwt.sign({
        id: staff.id,
        email: staff.email,
        role: staff.role,
      });
      return reply.send({
        token,
        user: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
        },
      });
    }

    // Staff tablosunda yok — ADMIN_EMAIL ile sabit fallback (henuz seed
    // edilmemis kurulumlarda dashboard'un bootstrap olabilmesi icin).
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
      const token = app.jwt.sign({
        id: "admin",
        email: adminEmail,
        role: "admin",
      });
      return reply.send({
        token,
        user: {
          id: "admin",
          name: "Yönetici",
          email: adminEmail,
          role: "admin",
        },
      });
    }

    return reply.code(401).send({ error: "Geçersiz e-posta veya şifre" });
  });
};

export default authRoutes;
