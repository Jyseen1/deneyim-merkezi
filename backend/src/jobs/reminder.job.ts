import { Worker, type Job } from "bullmq";
import {
  REMINDER_QUEUE,
  createRedisConnection,
  registerWorker,
} from "./queue";
import { prisma } from "../db/client";
import { sendReminder } from "../services/whatsapp.service";

export type ReminderJobData = { reservationId: string };

function log(level: "info" | "warn" | "error", msg: string, ctx: Record<string, unknown> = {}) {
  (level === "error" ? console.error : console.log)(
    JSON.stringify({ level, scope: "reminder", msg, ...ctx }),
  );
}

export const reminderWorker = new Worker<ReminderJobData>(
  REMINDER_QUEUE,
  async (job: Job<ReminderJobData>) => {
    const { reservationId } = job.data;
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { visitor: true },
    });
    if (!reservation) {
      log("warn", "rezervasyon bulunamadi", { reservationId });
      return { skipped: "not_found" };
    }
    if (reservation.status !== "APPROVED") {
      log("info", "APPROVED degil - atlandi", {
        reservationId,
        status: reservation.status,
      });
      return { skipped: reservation.status };
    }

    const waMessageId = await sendReminder(reservation);

    await prisma.notification.create({
      data: {
        reservationId,
        channel: "whatsapp",
        direction: "outbound",
        templateName: "reservation_reminder",
        waMessageId: waMessageId ?? undefined,
        status: waMessageId ? "sent" : "failed",
      },
    });

    log("info", "reminder islendi", { reservationId, waMessageId });
    return { sent: Boolean(waMessageId) };
  },
  { connection: createRedisConnection() },
);

reminderWorker.on("failed", (job, err) => {
  log("error", "reminder worker failed", {
    jobId: job?.id,
    reservationId: job?.data?.reservationId,
    err: err.message,
  });
});

reminderWorker.on("ready", () => {
  log("info", "reminder worker hazir");
});

registerWorker(reminderWorker);
