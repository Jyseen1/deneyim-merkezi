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

    // sendReminder kendi icinde notifications kaydi yapiyor.
    const waMessageId = await sendReminder(reservation);

    log("info", "reminder islendi", { reservationId, waMessageId });
    return { sent: Boolean(waMessageId) };
  },
  { connection: createRedisConnection() },
);

reminderWorker.on("failed", (job, err) => {
  log("error", "reminder worker failed", {
    jobId: job?.id,
    reservationId: job?.data?.reservationId,
    attemptsMade: job?.attemptsMade,
    err: err.message,
  });
  // BullMQ default attempt sayisini astiysa terminal failure — alarm at
  const attempts = job?.attemptsMade ?? 0;
  const max = job?.opts?.attempts ?? 1;
  if (attempts >= max) {
    void import("../services/error-alert.service").then((m) =>
      m.notifyAdminError("reminder.job", err, {
        reservationId: job?.data?.reservationId,
      }),
    );
  }
});

reminderWorker.on("ready", () => {
  log("info", "reminder worker hazir");
});

registerWorker(reminderWorker);
