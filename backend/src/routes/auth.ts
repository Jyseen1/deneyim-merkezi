import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const BCRYPT_COST = 10;

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      req.log.error("ADMIN_PASSWORD tanimli degil");
      return reply.code(500).send({ error: "server_misconfigured" });
    }

    const staff = await prisma.staff.findUnique({ where: { email } });

    if (staff) {
      if (!staff.isActive) {
        return reply.code(403).send({ error: "Hesap pasif" });
      }

      let ok = false;
      if (staff.passwordHash) {
        ok = await bcrypt.compare(password, staff.passwordHash);
      } else {
        // Legacy: passwordHash henuz yok. Sadece ADMIN_PASSWORD ile karsilastir,
        // eslesirse lazy migration ile hash'le ve sakla.
        if (password === adminPassword) {
          const hash = await bcrypt.hash(password, BCRYPT_COST);
          await prisma.staff.update({
            where: { id: staff.id },
            data: { passwordHash: hash },
          });
          ok = true;
        }
      }

      if (!ok) {
        return reply.code(401).send({ error: "Geçersiz e-posta veya şifre" });
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

    // Staff tablosunda yok — ADMIN_EMAIL + ADMIN_PASSWORD fallback (bootstrap).
    const adminEmail = process.env.ADMIN_EMAIL;
    if (
      adminEmail &&
      email.toLowerCase() === adminEmail.toLowerCase() &&
      password === adminPassword
    ) {
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
