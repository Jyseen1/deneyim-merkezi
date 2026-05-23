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

    // sendApprovalTimeout kendi icinde notifications kaydi yapiyor.
    const waMessageId = await sendApprovalTimeout(updated);

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
    attemptsMade: job?.attemptsMade,
    err: err.message,
  });
  const attempts = job?.attemptsMade ?? 0;
  const max = job?.opts?.attempts ?? 1;
  if (attempts >= max) {
    void import("../services/error-alert.service").then((m) =>
      m.notifyAdminError("timeout.job", err, {
        reservationId: job?.data?.reservationId,
      }),
    );
  }
});

timeoutWorker.on("ready", () => {
  log("info", "timeout worker hazir");
});

registerWorker(timeoutWorker);
