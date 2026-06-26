import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { getAvailableSlots } from "../services/slot.service";
import { getSettings, workMinutesRange } from "../services/settings.service";
import { verifyJWT } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD bekleniyor");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM bekleniyor");

const availableQuerySchema = z.object({
  date: isoDate,
  duration: z.coerce.number().int().positive().max(600).optional(),
});

const nextAvailableQuerySchema = z.object({
  from: isoDate.optional(),
  duration: z.coerce.number().int().positive().max(600).optional(),
  horizon: z.coerce.number().int().positive().max(180).optional(),
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

const blockDayBodySchema = z.object({
  date: isoDate,
  reason: z.string().max(200).optional(),
});

const blockRangeBodySchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().max(200).optional(),
  })
  .refine((b) => b.endDate >= b.startDate, {
    message: "endDate startDate'den sonra olmalı",
    path: ["endDate"],
  });

const recurringRuleBodySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: hhmm,
    endTime: hhmm,
    reason: z.string().max(200).optional(),
  })
  .refine((b) => b.endTime > b.startTime, {
    message: "endTime startTime'den sonra olmalı",
    path: ["endTime"],
  });

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function isoPlusDays(startISO: string, n: number): string {
  const d = new Date(`${startISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const blocksQuerySchema = z.object({
  date_from: isoDate,
  date_to: isoDate,
});

const slotRoutes: FastifyPluginAsync = async (app) => {
  // AUTH: belirli aralikta kapatilmis slotlari listele (takvim kapali gun
  // gosterimi icin). isBlocked=true olan Slot satirlari.
  app.get(
    "/blocks",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const parsed = blocksQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const { date_from, date_to } = parsed.data;
      const items = await prisma.slot.findMany({
        where: {
          isBlocked: true,
          slotDate: {
            gte: new Date(`${date_from}T00:00:00.000Z`),
            lte: new Date(`${date_to}T00:00:00.000Z`),
          },
        },
        orderBy: [{ slotDate: "asc" }, { startTime: "asc" }],
      });
      return reply.send({ items });
    },
  );

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

  // PUBLIC: en yakin musait gun + ilk saat (bos gun mesaji icin). from'dan
  // baslayarak horizon gun ileriye tarar, ilk musait gunu doner.
  app.get("/next-available", async (req, reply) => {
    const parsed = nextAvailableQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const duration =
      parsed.data.duration ??
      (Number(process.env.DEFAULT_DURATION_MINUTES) || 120);
    const horizon = parsed.data.horizon ?? 120;
    const start = parsed.data.from ?? new Date().toISOString().slice(0, 10);
    for (let i = 0; i < horizon; i++) {
      const d = isoPlusDays(start, i);
      const slots = await getAvailableSlots(d, duration);
      if (slots.length > 0) {
        return reply.send({
          found: true,
          date: d,
          durationMinutes: duration,
          slot: slots[0],
        });
      }
    }
    return reply.send({ found: false, durationMinutes: duration });
  });

  // AUTH: tek slot kapatma
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

  // Slot blok satirini sil. Hem /block/:id (geriye doniik) hem /blocks/:id
  // (yeni spec) ayni handler.
  async function deleteSlotBlock(
    id: string,
    reply: import("fastify").FastifyReply,
    log: import("fastify").FastifyRequest["log"],
  ) {
    try {
      await prisma.slot.delete({ where: { id } });
      return reply.code(204).send();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2025") {
        return reply.code(404).send({ error: "not_found" });
      }
      log.error({ err }, "slot unblock hata");
      return reply.code(500).send({ error: "internal_error" });
    }
  }
  app.delete<{ Params: { id: string } }>(
    "/block/:id",
    { preHandler: verifyJWT },
    async (req, reply) => deleteSlotBlock(req.params.id, reply, req.log),
  );
  app.delete<{ Params: { id: string } }>(
    "/blocks/:id",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => deleteSlotBlock(req.params.id, reply, req.log),
  );

  // AUTH (admin): tum gunu kapat — calisma saatleri icinde tek bir blok satiri
  app.post(
    "/block-day",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = blockDayBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const settings = await getSettings();
      const { start, end } = workMinutesRange(settings);
      const startTime = fromMinutes(start);
      const endTime = fromMinutes(end);
      try {
        const slot = await prisma.slot.create({
          data: {
            slotDate: new Date(`${parsed.data.date}T00:00:00.000Z`),
            startTime,
            endTime,
            isBlocked: true,
            blockReason: parsed.data.reason ?? "Gün kapalı",
          },
        });
        return reply.code(201).send({ blocked: 1, slot });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002")
          return reply.code(409).send({ error: "already_blocked" });
        req.log.error({ err }, "block-day hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // AUTH (admin): tarih araligi (tatil)
  app.post(
    "/block-range",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = blockRangeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const settings = await getSettings();
      const { start, end } = workMinutesRange(settings);
      const startTime = fromMinutes(start);
      const endTime = fromMinutes(end);
      const { startDate, endDate, reason } = parsed.data;

      const days: string[] = [];
      let cursor = startDate;
      while (cursor <= endDate) {
        days.push(cursor);
        cursor = isoPlusDays(cursor, 1);
        if (days.length > 366) break; // güvenlik kapağı
      }

      let blocked = 0;
      for (const d of days) {
        try {
          await prisma.slot.create({
            data: {
              slotDate: new Date(`${d}T00:00:00.000Z`),
              startTime,
              endTime,
              isBlocked: true,
              blockReason: reason ?? "Tatil",
            },
          });
          blocked++;
        } catch (err) {
          // P2002: aynı gün için zaten kayıt var → atla
          const code = (err as { code?: string }).code;
          if (code !== "P2002") {
            req.log.warn({ err, date: d }, "block-range bir gun atlandi");
          }
        }
      }
      return reply.code(201).send({ blocked, days });
    },
  );

  // AUTH (admin): tekrarlayan kural
  app.post(
    "/recurring-rule",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = recurringRuleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const created = await prisma.recurringBlock.create({
        data: {
          dayOfWeek: parsed.data.dayOfWeek,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          reason: parsed.data.reason ?? null,
          isActive: true,
        },
      });
      return reply.code(201).send(created);
    },
  );

  async function listActiveRecurring(reply: import("fastify").FastifyReply) {
    const rules = await prisma.recurringBlock.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return reply.send({ items: rules });
  }
  async function softDeleteRecurring(
    id: string,
    reply: import("fastify").FastifyReply,
    log: import("fastify").FastifyRequest["log"],
  ) {
    try {
      await prisma.recurringBlock.update({
        where: { id },
        data: { isActive: false },
      });
      return reply.code(204).send();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2025") return reply.code(404).send({ error: "not_found" });
      log.error({ err }, "recurring rule delete hata");
      return reply.code(500).send({ error: "internal_error" });
    }
  }

  app.get(
    "/recurring-rules",
    { preHandler: verifyJWT },
    async (_req, reply) => listActiveRecurring(reply),
  );
  // Spec alias: /recurring (cogul ihtilafi yok)
  app.get(
    "/recurring",
    { preHandler: verifyJWT },
    async (_req, reply) => listActiveRecurring(reply),
  );

  app.delete<{ Params: { id: string } }>(
    "/recurring-rules/:id",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => softDeleteRecurring(req.params.id, reply, req.log),
  );
  app.delete<{ Params: { id: string } }>(
    "/recurring/:id",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => softDeleteRecurring(req.params.id, reply, req.log),
  );
};

// Lint için: toMinutes kullanılmıyorsa silinebilir. Recurring kural buildDaySlots'ta
// dashboard.ts içinde dakika hesabıyla kullanılıyor.
void toMinutes;

export default slotRoutes;
