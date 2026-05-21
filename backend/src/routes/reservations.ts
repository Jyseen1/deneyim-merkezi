import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "../db/client";
import {
  approveReservation,
  cancelReservation,
  createReservation,
  rejectReservation,
} from "../services/reservation.service";
import { SlotUnavailableError } from "../types/reservation";
import { verifyJWT } from "../middleware/auth";

const reservationStatuses = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const satisfies readonly ReservationStatus[];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD bekleniyor");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM bekleniyor");

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(5).max(32),
  email: z.string().email().optional(),
  visitDate: isoDate,
  startTime: hhmm,
  durationMinutes: z.number().int().positive().max(600).optional(),
  groupSize: z.number().int().positive().max(50).optional(),
  note: z.string().max(1000).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(reservationStatuses).optional(),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const statusBodySchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  reason: z.string().max(500).optional(),
  staffId: z.string().min(1).optional(),
});

const reservationRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (req, reply) => {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createReservation(parsed.data);
      return reply.code(201).send({
        id: result.reservation.id,
        status: result.reservation.status,
        visitDate: parsed.data.visitDate,
        startTime: result.reservation.startTime,
        durationMinutes: result.reservation.durationMinutes,
        visitorId: result.visitor.id,
      });
    } catch (err) {
      if (err instanceof SlotUnavailableError) {
        return reply.code(409).send({
          error: "slot_unavailable",
          message: err.message,
          available_slots: err.alternatives,
        });
      }
      req.log.error({ err }, "createReservation hata");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.get("/", { preHandler: verifyJWT }, async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { status, date_from, date_to, page, limit } = parsed.data;

    const where: Prisma.ReservationWhereInput = {};
    if (status) where.status = status;
    if (date_from || date_to) {
      where.visitDate = {};
      if (date_from) where.visitDate.gte = new Date(`${date_from}T00:00:00Z`);
      if (date_to) where.visitDate.lte = new Date(`${date_to}T00:00:00Z`);
    }

    const [items, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: { visitor: true },
        orderBy: [{ visitDate: "desc" }, { startTime: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reservation.count({ where }),
    ]);

    return reply.send({ items, total, page, limit });
  });

  app.get<{ Params: { id: string } }>("/:id", { preHandler: verifyJWT }, async (req, reply) => {
    const r = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      include: { visitor: true, approvalToken: true, notifications: true },
    });
    if (!r) return reply.code(404).send({ error: "not_found" });
    return reply.send(r);
  });

  app.patch<{ Params: { id: string } }>("/:id/status", { preHandler: verifyJWT }, async (req, reply) => {
    const parsed = statusBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { action, reason, staffId } = parsed.data;
    const id = req.params.id;

    try {
      if (action === "approve") {
        if (!staffId) {
          return reply
            .code(400)
            .send({ error: "validation_failed", message: "staffId zorunlu" });
        }
        const updated = await approveReservation(id, staffId);
        return reply.send(updated);
      }
      if (action === "reject") {
        const { reservation, alternatives } = await rejectReservation(
          id,
          reason,
        );
        return reply.send({ reservation, alternatives });
      }
      // cancel
      const cancelled = await cancelReservation(id, reason);
      return reply.send(cancelled);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2025") {
        return reply.code(404).send({ error: "not_found" });
      }
      req.log.error({ err }, "reservation status guncelleme hata");
      return reply.code(500).send({ error: "internal_error" });
    }
  });
};

export default reservationRoutes;
