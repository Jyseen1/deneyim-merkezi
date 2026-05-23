import { Worker, type Job } from "bullmq";
import {
  STAFF_NOTIFY_QUEUE,
  createRedisConnection,
  registerWorker,
} from "./queue";
import { prisma } from "../db/client";
import { sendStaffApprovalNotifications } from "../services/reservation.service";

export type StaffNotifyJobData = { reservationId: string; attempt: number };

function log(
  level: "info" | "warn" | "error",
  msg: string,
  ctx: Record<string, unknown> = {},
) {
  (level === "error" ? console.error : console.log)(
    JSON.stringify({ level, scope: "staff-notify", msg, ...ctx }),
  );
}

// Yetkili bildirimi retry worker'i. createReservation ilk denemede basarisizsa
// burayi tetikler; basarili olunca zincir kesilir, basarisizsa bir sonraki
// attempt'i tetikler. status PENDING_APPROVAL degilse atlar.
export const staffNotifyWorker = new Worker<StaffNotifyJobData>(
  STAFF_NOTIFY_QUEUE,
  async (job: Job<StaffNotifyJobData>) => {
    const { reservationId, attempt } = job.data;
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { visitor: true },
    });
    if (!reservation) {
      log("warn", "rezervasyon bulunamadi", { reservationId, attempt });
      return { skipped: "not_found" };
    }
    if (reservation.status !== "PENDING_APPROVAL") {
      log("info", "PENDING degil - retry iptal", {
        reservationId,
        attempt,
        status: reservation.status,
      });
      return { skipped: reservation.status };
    }

    const result = await sendStaffApprovalNotifications(reservation, attempt);
    log("info", "retry attempt sonucu", {
      reservationId,
      attempt,
      result,
    });
    return result;
  },
  { connection: createRedisConnection() },
);

staffNotifyWorker.on("failed", (job, err) => {
  log("error", "staff-notify worker failed", {
    jobId: job?.id,
    reservationId: job?.data?.reservationId,
    attempt: job?.data?.attempt,
    err: err.message,
  });
});

staffNotifyWorker.on("ready", () => {
  log("info", "staff-notify worker hazir");
});

registerWorker(staffNotifyWorker);
