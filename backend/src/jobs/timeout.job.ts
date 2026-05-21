import { Worker, type Job } from "bullmq";
import {
  TIMEOUT_QUEUE,
  createRedisConnection,
  registerWorker,
} from "./queue";
import { prisma } from "../db/client";
import { sendApprovalTimeout } from "../services/whatsapp.service";
import type { ReservationWithVisitor } from "../types/reservation";

export type TimeoutJobData = { reservationId: string };

function log(level: "info" | "warn" | "error", msg: string, ctx: Record<string, unknown> = {}) {
  (level === "error" ? console.error : console.log)(
    JSON.stringify({ level, scope: "timeout", msg, ...ctx }),
  );
}

export const timeoutWorker = new Worker<TimeoutJobData>(
  TIMEOUT_QUEUE,
  async (job: Job<TimeoutJobData>) => {
    const { reservationId } = job.data;
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { visitor: true },
    });
    if (!reservation) {
      log("warn", "rezervasyon bulunamadi", { reservationId });
      return { skipped: "not_found" };
    }
    if (reservation.status !== "PENDING_APPROVAL") {
      log("info", "PENDING_APPROVAL degil - atlandi", {
        reservationId,
        status: reservation.status,
      });
      return { skipped: reservation.status };
    }

    // Slot CANCELLED status'unde sayilmadigi icin slot.service otomatik serbest birakir.
    const updated: ReservationWithVisitor = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: "Onay suresi doldu",
      },
      include: { visitor: true },
    });

    const waMessageId = await sendApprovalTimeout(updated);

    await prisma.notification.create({
      data: {
        reservationId,
        channel: "whatsapp",
        direction: "outbound",
        templateName: "reservation_timeout",
        waMessageId: waMessageId ?? undefined,
        status: waMessageId ? "sent" : "failed",
      },
    });

    log("info", "timeout islendi - rezervasyon iptal edildi", {
      reservationId,
      waMessageId,
    });
    return { cancelled: true, waMessageId };
  },
  { connection: createRedisConnection() },
);

timeoutWorker.on("failed", (job, err) => {
  log("error", "timeout worker failed", {
    jobId: job?.id,
    reservationId: job?.data?.reservationId,
    err: err.message,
  });
});

timeoutWorker.on("ready", () => {
  log("info", "timeout worker hazir");
});

registerWorker(timeoutWorker);
