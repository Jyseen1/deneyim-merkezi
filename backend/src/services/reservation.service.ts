import crypto from "node:crypto";
import { prisma } from "../db/client";
import { getAvailableSlots, isSlotAvailable } from "./slot.service";
import {
  sendApprovalRequest,
  sendConfirmation,
  sendRejection,
} from "./whatsapp.service";
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

const DEFAULT_DURATION_MIN = Number(process.env.DEFAULT_DURATION_MINUTES) || 120;
const APPROVAL_TIMEOUT_HOURS = Number(process.env.APPROVAL_TIMEOUT_HOURS) || 2;
const REMINDER_HOURS_BEFORE = Number(process.env.REMINDER_HOURS_BEFORE) || 24;
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
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MIN;
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
      },
    });

    const expiresAt = new Date(
      Date.now() + APPROVAL_TIMEOUT_HOURS * 60 * 60 * 1000,
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
        delay: APPROVAL_TIMEOUT_HOURS * 60 * 60 * 1000,
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

  // Transaction disinda WA bildirim (HTTP cagrisi tx'i kilitlemesin).
  // Hata firlatmiyoruz: rezervasyon olusturulmus, bildirim ayri retry'a tabi olmali.
  try {
    await sendApprovalRequest({
      ...result.reservation,
      visitor: result.visitor,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "reservation",
        msg: "sendApprovalRequest hata - rezervasyon yine de olusturuldu",
        reservationId: result.reservation.id,
        err: (err as Error).message,
      }),
    );
  }

  return result;
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

  try {
    await sendConfirmation(updated);
  } catch (err) {
    logJobError("reservation", "sendConfirmation hata", {
      reservationId,
      err: (err as Error).message,
    });
  }

  // Approve edildigine gore timeout job'u artik gereksiz - kuyrukta beklemesin.
  await removeJobSafe(timeoutQueue, timeoutJobId(reservationId));

  // Reminder job'unu ekle. Ziyaret saatinden REMINDER_HOURS_BEFORE saat once tetiklenir.
  // visitDate UTC midnight olarak saklaniyor; startTime'i UTC dakika olarak ekliyoruz.
  // NOT: Yerel saat dilimi (TR=UTC+3) icin daha kesin hesap istenirse dayjs/timezone eklenmeli.
  const visitMs = updated.visitDate.getTime() + timeToMinutes(updated.startTime) * 60 * 1000;
  const reminderMs = visitMs - REMINDER_HOURS_BEFORE * 60 * 60 * 1000;
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

  try {
    await sendRejection(result.reservation, result.alternatives);
  } catch (err) {
    logJobError("reservation", "sendRejection hata", {
      reservationId,
      err: (err as Error).message,
    });
  }

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

  return updated;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
