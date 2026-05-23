import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "../db/client";
import {
  approveReservation,
  cancelReservation,
  createReservation,
  markNoShow,
  rejectReservation,
  rescheduleReservation,
  sendStaffApprovalNotifications,
} from "../services/reservation.service";
import {
  ReservationAlreadyProcessedError,
  SlotUnavailableError,
} from "../types/reservation";
import { verifyJWT } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";

// Bir rezervasyon icin yetkili bildirim durumu: en son outbound + staff_approval
// notification status'u. "pending" = hic gonderim yapilmamis. "sent"/"failed"
// = son denemenin sonucu.
type StaffNotifyStatus = "sent" | "failed" | "pending";
type WithNotifs = { notifications: { status: string; sentAt: Date }[] };
function staffNotificationStatusOf(r: WithNotifs): StaffNotifyStatus {
  // notifications zaten desc sirali geldi (orderBy sentAt desc) — index 0 son.
  const last = r.notifications[0];
  if (!last) return "pending";
  if (last.status === "sent") return "sent";
  return "failed";
}

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

const createBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "Telefon E.164 formatında olmalı (örn +90...)"),
    email: z.string().email().optional(),
    visitDate: isoDate,
    startTime: hhmm,
    durationMinutes: z.number().int().positive().max(600).optional(),
    groupSize: z.number().int().positive().max(50).optional(),
    note: z.string().max(1000).optional(),
    source: z.enum(["web", "whatsapp", "telegram"]).optional(),
    telegramChatId: z.string().max(64).optional(),
  })
  .refine(
    (b) => {
      // Bugünden önceki tarihler reddedilir (lokal tarih karşılaştırması)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const vd = new Date(`${b.visitDate}T00:00:00`);
      return vd >= today;
    },
    { message: "Geçmiş tarihe rezervasyon yapılamaz", path: ["visitDate"] },
  );

const listQuerySchema = z.object({
  status: z.enum(reservationStatuses).optional(),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  // Aktif + gelecek olanlari goster: COMPLETED/CANCELLED/REJECTED/NO_SHOW
  // gizlenir, visitDate >= bugun filtresi eklenir. Sadece gorunum filtresi.
  hide_past: z
    .union([z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0")])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  page: z.coerce.number().int().positive().default(1),
  // max 500: takvim ay gorunumu icin tek istekte tum dönemi cekmek gerekiyor.
  // List sayfasi default 20 ile gelir; takvim/raporlar explicit yuksek deger gonderir.
  limit: z.coerce.number().int().positive().max(500).default(20),
});

const statusBodySchema = z.object({
  action: z.enum(["approve", "reject", "cancel", "no_show"]),
  reason: z.string().max(500).optional(),
  staffId: z.string().min(1).optional(),
});

const rescheduleBodySchema = z.object({
  visitDate: isoDate,
  startTime: hhmm,
  durationMinutes: z.number().int().positive().max(600).optional(),
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
    const { status, date_from, date_to, hide_past, page, limit } = parsed.data;

    const where: Prisma.ReservationWhereInput = {};
    if (status) {
      where.status = status;
    } else if (hide_past) {
      // Explicit status yoksa biten durumlari gizle.
      where.status = {
        notIn: ["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"],
      };
    }

    if (date_from || date_to) {
      where.visitDate = {};
      if (date_from) where.visitDate.gte = new Date(`${date_from}T00:00:00Z`);
      if (date_to) where.visitDate.lte = new Date(`${date_to}T00:00:00Z`);
    }

    if (hide_past) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      // where.visitDate'in Prisma type'i Date|Filter union; biz sadece
      // { gte?, lte? } seklinde set ediyoruz, narrow cast guvenli.
      const cur = where.visitDate as { gte?: Date; lte?: Date } | undefined;
      const existingGte = cur?.gte;
      where.visitDate = {
        ...(cur ?? {}),
        gte: existingGte && existingGte > todayStart ? existingGte : todayStart,
      };
    }

    const [rawItems, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          visitor: true,
          // Yetkili (outbound + staff_approval) son notification kayitlari
          // istemciye gonderilmiyor; sadece status hesabi icin cekilir.
          notifications: {
            where: {
              direction: "outbound",
              templateName: "staff_approval",
            },
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { status: true, sentAt: true },
          },
        },
        // En yeni gelen talep en ustte — pagination + canli SSE ile uyumlu.
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reservation.count({ where }),
    ]);

    // notifications array'ini payload'dan cikar, computed field ekle.
    const items = rawItems.map(({ notifications, ...rest }) => ({
      ...rest,
      staffNotificationStatus: staffNotificationStatusOf({ notifications }),
    }));

    return reply.send({ items, total, page, limit });
  });

  app.get<{ Params: { id: string } }>("/:id", { preHandler: verifyJWT }, async (req, reply) => {
    const r = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      include: {
        visitor: true,
        approvalToken: true,
        notifications: { orderBy: { sentAt: "desc" } },
      },
    });
    if (!r) return reply.code(404).send({ error: "not_found" });
    // staffNotificationStatus: en son outbound + staff_approval kaydina bak.
    const staffNotif = r.notifications.find(
      (n) => n.direction === "outbound" && n.templateName === "staff_approval",
    );
    const staffNotificationStatus: StaffNotifyStatus = !staffNotif
      ? "pending"
      : staffNotif.status === "sent"
        ? "sent"
        : "failed";
    return reply.send({ ...r, staffNotificationStatus });
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
      if (action === "no_show") {
        try {
          const updated = await markNoShow(id);
          return reply.send(updated);
        } catch (e) {
          return reply
            .code(400)
            .send({ error: (e as Error).message || "no_show_invalid" });
        }
      }
      // cancel
      const cancelled = await cancelReservation(id, reason);
      return reply.send(cancelled);
    } catch (err) {
      if (err instanceof ReservationAlreadyProcessedError) {
        return reply.code(409).send({
          error: "already_processed",
          message: err.message,
          current_status: err.currentStatus,
        });
      }
      const code = (err as { code?: string }).code;
      if (code === "P2025") {
        return reply.code(404).send({ error: "not_found" });
      }
      req.log.error({ err }, "reservation status guncelleme hata");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  // Yetkili tarafindan tarih/saat degisikligi. Slot cakisma kontrolu yapilir,
  // status korunur, ziyaretciye bildirim gider.
  app.patch<{ Params: { id: string } }>(
    "/:id/reschedule",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const parsed = rescheduleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      try {
        const updated = await rescheduleReservation(
          req.params.id,
          parsed.data.visitDate,
          parsed.data.startTime,
          parsed.data.durationMinutes,
        );
        return reply.send(updated);
      } catch (err) {
        if (err instanceof SlotUnavailableError) {
          return reply.code(409).send({
            error: "slot_unavailable",
            message: err.message,
            available_slots: err.alternatives,
          });
        }
        if (err instanceof ReservationAlreadyProcessedError) {
          return reply.code(409).send({
            error: "already_processed",
            message: err.message,
            current_status: err.currentStatus,
          });
        }
        const code = (err as { code?: string }).code;
        if (code === "P2025") {
          return reply.code(404).send({ error: "not_found" });
        }
        req.log.error({ err }, "reschedule hata");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // Yetkili bildirimini tekrar dene. PENDING_APPROVAL disindaki statuslarda
  // anlam yok (zaten islenmis). requireAdmin korur — sadece adminler retry.
  app.post<{ Params: { id: string } }>(
    "/:id/resend-notification",
    { preHandler: [verifyJWT, requireAdmin] },
    async (req, reply) => {
      const r = await prisma.reservation.findUnique({
        where: { id: req.params.id },
        include: { visitor: true },
      });
      if (!r) return reply.code(404).send({ error: "not_found" });
      if (r.status !== "PENDING_APPROVAL") {
        return reply.code(400).send({
          error: "not_pending",
          message: `Rezervasyon zaten ${r.status} durumunda; bildirim gönderilmez.`,
        });
      }
      const result = await sendStaffApprovalNotifications(r, 0);
      return reply.send({
        ok: result.anySent,
        result,
        staffNotificationStatus: result.anySent ? "sent" : "failed",
      });
    },
  );
};

export default reservationRoutes;
