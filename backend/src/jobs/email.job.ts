import { Worker, type Job } from "bullmq";
import {
  EMAIL_QUEUE,
  createRedisConnection,
  registerWorker,
} from "./queue";
import {
  sendAdminNewReservation,
  sendCustomerApproved,
  sendCustomerRejected,
  sendCustomerRescheduled,
  type RejectAlternative,
} from "../services/email.service";
import { notifyAdminError } from "../services/error-alert.service";

// Email job verisi — discriminated union. Worker switch ile dogru senaryoya
// yonlendirir. Reschedule icin eski tarih/saat de gerekli (compose'da kullanilir).
export type EmailJobData =
  | { type: "admin_new_reservation"; reservationId: string }
  | { type: "customer_approved"; reservationId: string }
  | {
      type: "customer_rejected";
      reservationId: string;
      alternatives: RejectAlternative[];
    }
  | {
      type: "customer_rescheduled";
      reservationId: string;
      diff: { oldDateISO: string; oldStartTime: string };
    };

function log(
  level: "info" | "warn" | "error",
  msg: string,
  ctx: Record<string, unknown> = {},
) {
  (level === "error" ? console.error : console.log)(
    JSON.stringify({ level, scope: "email-job", msg, ...ctx }),
  );
}

function reservationIdOf(d: EmailJobData): string {
  return d.reservationId;
}

// BullMQ worker — Resend SDK Promise reddederse BullMQ retry mantigi devreye
// girer (queue.add()'de attempts:3 + exponential backoff verilecek). Son
// attempt'te de basarisizsa "failed" event'inde notifyAdminError tetiklenir.
export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE,
  async (job: Job<EmailJobData>) => {
    const data = job.data;
    switch (data.type) {
      case "admin_new_reservation":
        await sendAdminNewReservation(data.reservationId);
        break;
      case "customer_approved":
        await sendCustomerApproved(data.reservationId);
        break;
      case "customer_rejected":
        await sendCustomerRejected(data.reservationId, data.alternatives);
        break;
      case "customer_rescheduled":
        await sendCustomerRescheduled(data.reservationId, {
          oldDate: new Date(data.diff.oldDateISO),
          oldStartTime: data.diff.oldStartTime,
        });
        break;
    }
    log("info", "email gonderildi", {
      type: data.type,
      reservationId: reservationIdOf(data),
    });
    return { ok: true };
  },
  { connection: createRedisConnection() },
);

emailWorker.on("failed", (job, err) => {
  log("error", "email worker failed", {
    jobId: job?.id,
    type: job?.data?.type,
    reservationId: job?.data ? reservationIdOf(job.data) : undefined,
    attemptsMade: job?.attemptsMade,
    err: err.message,
  });
  const attempts = job?.attemptsMade ?? 0;
  const max = job?.opts?.attempts ?? 1;
  if (attempts >= max) {
    void notifyAdminError("email.job", err, {
      type: job?.data?.type,
      reservationId: job?.data ? reservationIdOf(job.data) : undefined,
    });
  }
});

emailWorker.on("ready", () => {
  log("info", "email worker hazir");
});

registerWorker(emailWorker);
