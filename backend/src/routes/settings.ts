import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { verifyJWT } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import { invalidateSettingsCache } from "../services/settings.service";

const SINGLETON_ID = "singleton";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM bekleniyor");

const upsertSchema = z.object({
  staffWaPhone: z.string().nullable().optional(),
  approvalEnabled: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  defaultDuration: z.number().int().positive().max(600).optional(),
  approvalTimeout: z.number().int().positive().max(72).optional(),
  workStart: hhmm.optional(),
  workEnd: hhmm.optional(),
  reminderHours: z.number().int().positive().max(168).optional(),
});

async function getOrCreateSettings() {
  const existing = await prisma.settings.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: SINGLETON_ID } });
}

const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: verifyJWT }, async (_req, reply) => {
    const s = await getOrCreateSettings();
    return reply.send(s);
  });

  app.put(
    "/",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const updated = await prisma.settings.upsert({
        where: { id: SINGLETON_ID },
        update: parsed.data,
        create: { id: SINGLETON_ID, ...parsed.data },
      });
      invalidateSettingsCache();
      return reply.send(updated);
    },
  );
};

export default settingsRoutes;
