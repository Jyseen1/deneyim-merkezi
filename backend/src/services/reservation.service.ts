import crypto from "node:crypto";
import { prisma } from "../db/client";
import { getAvailableSlots, isSlotAvailable } from "./slot.service";
import { getSettings } from "./settings.service";
import { emitAppEvent } from "./events.service";
import {
  sendApprovalRequest,
  sendConfirmation,
  sendRejection,
} from "./whatsapp.service";
import {
  sendStaffApprovalRequest as sendTelegramStaffApproval,
  sendVisitorConfirmation as sendTelegramConfirmation,
  sendVisitorRejection as sendTelegramRejection,
} from "./telegram.service";
import {
  reminderQueue,
  removeJobSafe,
  timeoutQueue,
} from "../jobs/queue";
import {
  SlotUnavailableError,
  type CreateReservationInput,
  type ReservationWithVisitor,
} from "../types/reservation";

// .env fallback'leri Settings DB satiri olusana kadar (cold start) kullanilir.
const ENV_DEFAULT_DURATION = Number(process.env.DEFAULT_DURATION_MINUTES) || 120;
const ENV_APPROVAL_TIMEOUT = Number(process.env.APPROVAL_TIMEOUT_HOURS) || 2;
const ENV_REMINDER_HOURS = Number(process.env.REMINDER_HOURS_BEFORE) || 24;
const MAX_ALTERNATIVES = 3;

function timeoutJobId(id: string) {
  return `timeout_${id}`;
}
function reminderJobId(id: string) {
  return `reminder_${id}`;
}

function logJobError(scope: string, msg: string, ctx: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", scope, msg, ...ctx }));
}

export async function createReservation(input: CreateReservationInput) {
  const settings = await getSettings();
  const durationMinutes =
    input.durationMinutes ?? settings.defaultDuration ?? ENV_DEFAULT_DURATION;
  const approvalTimeoutHours = settings.approvalTimeout ?? ENV_APPROVAL_TIMEOUT;
  const groupSize = input.groupSize ?? 1;
  const visitDate = new Date(`${input.visitDate}T00:00:00.000Z`);

  const result = await prisma.$transaction(async (tx) => {
    const available = await isSlotAvailable(
      input.visitDate,
      input.startTime,
      durationMinutes,
      tx,
    );
    if (!available) {
      const alternatives = await getAvailableSlots(
        input.visitDate,
        durationMinutes,
        tx,
      );
      throw new SlotUnavailableError(
        "Secilen saat artik musait degil",
        alternatives.slice(0, MAX_ALTERNATIVES),
      );
    }

    const visitor = await tx.visitor.upsert({
      where: { phone: input.phone },
      update: { name: input.name, email: input.email ?? undefined },
      create: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? undefined,
      },
    });

    const reservation = await tx.reservation.create({
      data: {
        visitorId: visitor.id,
        visitDate,
        startTime: input.startTime,
        durationMinutes,
        groupSize,
        note: input.note ?? undefined,
        status: "PENDING_APPROVAL",
        source: input.source ?? "web",
        telegramChatId: input.telegramChatId ?? null,
      },
    });

    const expiresAt = new Date(
      Date.now() + approvalTimeoutHours * 60 * 60 * 1000,
    );
    const token = crypto.randomUUID();
    await tx.approvalToken.create({
      data: {
        reservationId: reservation.id,
        token,
        expiresAt,
      },
    });

    return { reservation, visitor, approvalToken: { token, expiresAt } };
  });

  // Onay timeout job'unu queue'ya ekle (transaction commit sonrasi - rollback'te kirletme).
  try {
    await timeoutQueue.add(
      "check-approval-timeout",
      { reservationId: result.reservation.id },
      {
        jobId: timeoutJobId(result.reservation.id),
        delay: approvalTimeoutHours * 60 * 60 * 1000,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  } catch (err) {
    logJobError("reservation", "timeout job ekleme hata", {
      reservationId: result.reservation.id,
      err: (err as Error).message,
    });
  }

  // Real-time event: dashboard'a "yeni rezervasyon" bildirimi
  emitAppEvent({
    type: "new_reservation",
    reservationId: result.reservation.id,
    visitorName: result.visitor.name,
    status: result.reservation.status,
  });

  // Yetkiliye bildirim — hangi kanal env'de yapilandirilmissa o
  // (her ikisi de doluysa paralel gonderilir; biri hata verirse digeri devam eder).
  const reservationWithVisitor: ReservationWithVisitor = {
    ...result.reservation,
    visitor: result.visitor,
  };
  await Promise.allSettled([
    process.env.WA_ACCESS_TOKEN
      ? sendApprovalRequest(reservationWithVisitor).catch((err) =>
          logJobError("reservation", "sendApprovalRequest hata", {
            reservationId: result.reservation.id,
            err: (err as Error).message,
          }),
        )
      : Promise.resolve(),
    process.env.TELEGRAM_BOT_TOKEN
      ? sendTelegramStaffApproval(reservationWithVisitor).catch((err) =>
          logJobError("reservation", "telegram staff approval hata", {
            reservationId: result.reservation.id,
            err: (err as Error).message,
          }),
        )
      : Promise.resolve(),
  ]);

  return result;
}

// Ziyaretciye onay bildirimi (kanal secimi: source/telegramChatId).
async function notifyVisitorApproved(
  reservation: ReservationWithVisitor,
): Promise<void> {
  if (reservation.source === "telegram" && reservation.telegramChatId) {
    try {
      await sendTelegramConfirmation(reservation.telegramChatId, reservation);
    } catch (err) {
      logJobError("reservation", "telegram visitor confirm hata", {
        reservationId: reservation.id,
        err: (err as Error).message,
      });
    }
    return;
  }
  try {
    await sendConfirmation(reservation);
  } catch (err) {
    logJobError("reservation", "sendConfirmation hata", {
      reservationId: reservation.id,
      err: (err as Error).message,
    });
  }
}

async function notifyVisitorRejected(
  reservation: ReservationWithVisitor,
  alternatives: { startTime: string; endTime: string }[],
): Promise<void> {
  if (reservation.source === "telegram" && reservation.telegramChatId) {
    try {
      await sendTelegramRejection(
        reservation.telegramChatId,
        reservation,
        alternatives,
      );
    } catch (err) {
      logJobError("reservation", "telegram visitor reject hata", {
        reservationId: reservation.id,
        err: (err as Error).message,
      });
    }
    return;
  }
  try {
    await sendRejection(reservation, alternatives);
  } catch (err) {
    logJobError("reservation", "sendRejection hata", {
      reservationId: reservation.id,
      err: (err as Error).message,
    });
  }
}

export async function approveReservation(
  reservationId: string,
  staffId: string,
) {
  const updated: ReservationWithVisitor = await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedBy: staffId,
    },
    include: { visitor: true },
  });

  emitAppEvent({
    type: "reservation_updated",
    reservationId: updated.id,
    status: updated.status,
    visitorName: updated.visitor.name,
  });

  await notifyVisitorApproved(updated);

  // Approve edildigine gore timeout job'u artik gereksiz - kuyrukta beklemesin.
  await removeJobSafe(timeoutQueue, timeoutJobId(reservationId));

  // Reminder job'unu ekle. Ziyaret saatinden settings.reminderHours saat once tetiklenir.
  // visitDate UTC midnight olarak saklaniyor; startTime'i UTC dakika olarak ekliyoruz.
  // NOT: Yerel saat dilimi (TR=UTC+3) icin daha kesin hesap istenirse dayjs/timezone eklenmeli.
  const settings = await getSettings();
  const reminderHours = settings.reminderHours ?? ENV_REMINDER_HOURS;
  const visitMs = updated.visitDate.getTime() + timeToMinutes(updated.startTime) * 60 * 1000;
  const reminderMs = visitMs - reminderHours * 60 * 60 * 1000;
  const delay = Math.max(0, reminderMs - Date.now());

  try {
    await reminderQueue.add(
      "send-reminder",
      { reservationId },
      {
        jobId: reminderJobId(reservationId),
        delay,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  } catch (err) {
    logJobError("reservation", "reminder job ekleme hata", {
      reservationId,
      err: (err as Error).message,
    });
  }

  return updated;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function rejectReservation(
  reservationId: string,
  reason?: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { visitDate: true, durationMinutes: true },
    });
    if (!existing) {
      throw new Error("Rezervasyon bulunamadi");
    }

    const updated: ReservationWithVisitor = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: "REJECTED",
        cancelledAt: new Date(),
        cancelReason: reason ?? undefined,
      },
      include: { visitor: true },
    });

    const isoDate = toIsoDate(existing.visitDate);
    const alternatives = (
      await getAvailableSlots(isoDate, existing.durationMinutes, tx)
    ).slice(0, MAX_ALTERNATIVES);

    return { reservation: updated, alternatives };
  });

  emitAppEvent({
    type: "reservation_updated",
    reservationId: result.reservation.id,
    status: result.reservation.status,
    visitorName: result.reservation.visitor.name,
  });

  await notifyVisitorRejected(result.reservation, result.alternatives);

  await Promise.all([
    removeJobSafe(timeoutQueue, timeoutJobId(reservationId)),
    removeJobSafe(reminderQueue, reminderJobId(reservationId)),
  ]);

  return result;
}

export async function cancelReservation(
  reservationId: string,
  reason?: string,
) {
  const updated = await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason ?? undefined,
    },
  });

  await Promise.all([
    removeJobSafe(timeoutQueue, timeoutJobId(reservationId)),
    removeJobSafe(reminderQueue, reminderJobId(reservationId)),
  ]);

  emitAppEvent({
    type: "reservation_updated",
    reservationId,
    status: updated.status,
  });

  return updated;
}

export async function markNoShow(reservationId: string) {
  const existing = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { status: true, visitDate: true, startTime: true },
  });
  if (!existing) throw new Error("Rezervasyon bulunamadi");
  if (existing.status !== "APPROVED") {
    throw new Error("Sadece APPROVED rezervasyonlar NO_SHOW yapilabilir");
  }
  // Yalnizca gecmis tarihli ziyaretlerde NO_SHOW isaretlenebilir
  const visitMs =
    existing.visitDate.getTime() + timeToMinutes(existing.startTime) * 60 * 1000;
  if (visitMs > Date.now()) {
    throw new Error("Gelecekteki rezervasyon NO_SHOW yapilamaz");
  }

  const updated = await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "NO_SHOW" },
  });

  // Reminder ve timeout job'lari varsa anlam yok — temizle
  await Promise.all([
    removeJobSafe(timeoutQueue, timeoutJobId(reservationId)),
    removeJobSafe(reminderQueue, reminderJobId(reservationId)),
  ]);

  emitAppEvent({
    type: "reservation_updated",
    reservationId,
    status: updated.status,
  });

  return updated;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
