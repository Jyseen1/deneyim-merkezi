import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { getAvailableSlots } from "../services/slot.service";
import { verifyJWT } from "../middleware/auth";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD bekleniyor");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM bekleniyor");

const availableQuerySchema = z.object({
  date: isoDate,
  duration: z.coerce.number().int().positive().max(600).optional(),
});

const blockBodySchema = z
  .object({
    date: isoDate,
    startTime: hhmm,
    endTime: hhmm,
    reason: z.string().max(200).optional(),
  })
  .refine((b) => b.endTime > b.startTime, {
    message: "endTime startTime'den sonra olmalı",
    path: ["endTime"],
  });

const slotRoutes: FastifyPluginAsync = async (app) => {
  // PUBLIC: ziyaretci formu buradan musait slotlari ceker
  app.get("/available", async (req, reply) => {
    const parsed = availableQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const duration =
      parsed.data.duration ??
      (Number(process.env.DEFAULT_DURATION_MINUTES) || 120);
    const slots = await getAvailableSlots(parsed.data.date, duration);
    return reply.send({ date: parsed.data.date, durationMinutes: duration, slots });
  });

  // AUTH: yetkili slot kapatma
  app.post(
    "/block",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const parsed = blockBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const { date, startTime, endTime, reason } = parsed.data;
      try {
        const slot = await prisma.slot.create({
          data: {
            slotDate: new Date(`${date}T00:00:00.000Z`),
            startTime,
            endTime,
            isBlocked: true,
            blockReason: reason ?? null,
          },
        });
        return reply.code(201).send(slot);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
          return reply.code(409).send({ error: "slot_already_blocked" });
        }
        req.log.error({ err }, "slot block hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // AUTH: blok kaldirma
  app.delete<{ Params: { id: string } }>(
    "/block/:id",
    { preHandler: verifyJWT },
    async (req, reply) => {
      try {
        await prisma.slot.delete({ where: { id: req.params.id } });
        return reply.code(204).send();
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2025") {
          return reply.code(404).send({ error: "not_found" });
        }
        req.log.error({ err }, "slot unblock hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );
};

export default slotRoutes;
