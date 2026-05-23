import crypto from "node:crypto";
import { prisma } from "../db/client";
import { getAvailableSlots, isSlotAvailable } from "./slot.service";
import { getSettings } from "./settings.service";
import { emitAppEvent } from "./events.service";
import {
  sendApprovalRequest,
  sendConfirmation,
  sendRejection,
  sendVisitorReschedule as sendWAReschedule,
} from "./whatsapp.service";
import {
  editStaffMessage as editTelegramStaffMessage,
  sendStaffApprovalRequest as sendTelegramStaffApproval,
  sendVisitorConfirmation as sendTelegramConfirmation,
  sendVisitorRejection as sendTelegramRejection,
  sendVisitorReschedule as sendTelegramReschedule,
} from "./telegram.service";
import {
  reminderQueue,
  removeJobSafe,
  staffNotifyQueue,
  timeoutQueue,
} from "../jobs/queue";
import { logNotification } from "./notification.service";
import {
  ReservationAlreadyProcessedError,
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
function staffNotifyJobId(id: string, attempt: number) {
  return `staffnotify_${id}_${attempt}`;
}

function logJobError(scope: string, msg: string, ctx: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", scope, msg, ...ctx }));
}

// Yetkili bildirim retry parametreleri: 0=ilk, 1=30sn, 2=2dk, 3=5dk
const STAFF_NOTIFY_DELAYS_MS = [30_000, 120_000, 300_000];
const MAX_STAFF_NOTIFY_ATTEMPTS = STAFF_NOTIFY_DELAYS_MS.length + 1; // 4 toplam

// Tek bildirim girisimi: WA + Telegram paralel, her biri notification log'lar,
// gerekirse sonraki attempt'i kuyruga koyar.
export type StaffNotifyResult = {
  whatsapp: "sent" | "failed" | "skipped";
  telegram: "sent" | "failed" | "skipped";
  anySent: boolean;
  attempted: boolean;
};

async function trySendStaffWA(
  reservation: ReservationWithVisitor,
): Promise<"sent" | "failed" | "skipped"> {
  if (!process.env.WA_ACCESS_TOKEN) return "skipped";
  try {
    const msgId = await sendApprovalRequest(reservation);
    await logNotification({
      reservationId: reservation.id,
      channel: "whatsapp",
      direction: "outbound",
      templateName: "staff_approval",
      waMessageId: msgId ?? undefined,
      status: msgId ? "sent" : "failed",
    });
    return msgId ? "sent" : "failed";
  } catch (err) {
    logJobError("reservation", "staff WA send hata", {
      reservationId: reservation.id,
      err: (err as Error).message,
    });
    await logNotification({
      reservationId: reservation.id,
      channel: "whatsapp",
      direction: "outbound",
      templateName: "staff_approval",
      status: "failed",
    });
    return "failed";
  }
}

async function trySendStaffTelegram(
  reservation: ReservationWithVisitor,
): Promise<"sent" | "failed" | "skipped"> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return "skipped";
  try {
    const refs = await sendTelegramStaffApproval(reservation);
    if (refs) {
      // Mesaj refs'lerini reservation'a yaz: ileride site/telegram/whatsapp
      // hangi kanaldan onay/red gelirse gelsin bu mesaji guncellemek icin.
      try {
        await prisma.reservation.update({
          where: { id: reservation.id },
          data: {
            telegramStaffMessageId: String(refs.messageId),
            telegramStaffChatId: refs.chatId,
          },
        });
      } catch (err) {
        logJobError("reservation", "telegram staff refs persist hata", {
          reservationId: reservation.id,
          err: (err as Error).message,
        });
      }
      await logNotification({
        reservationId: reservation.id,
        channel: "telegram",
        direction: "outbound",
        templateName: "staff_approval",
        status: "sent",
      });
      return "sent";
    }
    await logNotification({
      reservationId: reservation.id,
      channel: "telegram",
      direction: "outbound",
      templateName: "staff_approval",
      status: "failed",
    });
    return "failed";
  } catch (err) {
    logJobError("reservation", "staff Telegram send hata", {
      reservationId: reservation.id,
      err: (err as Error).message,
    });
    await logNotification({
      reservationId: reservation.id,
      channel: "telegram",
      direction: "outbound",
      templateName: "staff_approval",
      status: "failed",
    });
    return "failed";
  }
}

// Tek attempt'lik gonderim — basariliysa retry zinciri durur, basarisiz +
// attempt < MAX ise sonraki attempt kuyruga eklenir.
export async function sendStaffApprovalNotifications(
  reservation: ReservationWithVisitor,
  attempt = 0,
): Promise<StaffNotifyResult> {
  const [whatsapp, telegram] = await Promise.all([
    trySendStaffWA(reservation),
    trySendStaffTelegram(reservation),
  ]);
  const attempted =
    whatsapp !== "skipped" || telegram !== "skipped";
  const anySent = whatsapp === "sent" || telegram === "sent";

  // Hicbir kanal denenmediyse retry'a gerek yok (yapilandirma yok).
  if (attempted && !anySent && attempt + 1 < MAX_STAFF_NOTIFY_ATTEMPTS) {
    const nextAttempt = attempt + 1;
    const delay =
      STAFF_NOTIFY_DELAYS_MS[nextAttempt - 1] ??
      STAFF_NOTIFY_DELAYS_MS[STAFF_NOTIFY_DELAYS_MS.length - 1];
    try {
      await staffNotifyQueue.add(
        "retry-staff-notify",
        { reservationId: reservation.id, attempt: nextAttempt },
        {
          jobId: staffNotifyJobId(reservation.id, nextAttempt),
          delay,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      console.log(
        JSON.stringify({
          level: "info",
          scope: "reservation",
          msg: "staff notify retry kuyruğa eklendi",
          reservationId: reservation.id,
          nextAttempt,
          delay,
        }),
      );
    } catch (err) {
      logJobError("reservation", "staff notify retry enqueue hata", {
        reservationId: reservation.id,
        err: (err as Error).message,
      });
    }
  }

  return { whatsapp, telegram, anySent, attempted };
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

  // Yetkiliye bildirim — yeni helper notification log + retry yapiyor.
  // Basarisiz ise dashboard'da gorunur olur ve staffNotifyQueue 30sn/2dk/5dk
  // sonra tekrar dener.
  const reservationWithVisitor: ReservationWithVisitor = {
    ...result.reservation,
    visitor: result.visitor,
  };
  await sendStaffApprovalNotifications(reservationWithVisitor, 0);

  return result;
}

// Yetkili Telegram mesajini guncel duruma getir + butonlari kaldir.
// reservation icindeki telegramStaffMessageId/ChatId varsa calisir; yoksa no-op.
// Site/Telegram/WhatsApp hangi kanal status degistirdiyse otomatik senkron.
async function syncStaffApprovalMessage(
  reservation: ReservationWithVisitor,
): Promise<void> {
  if (!reservation.telegramStaffMessageId || !reservation.telegramStaffChatId) {
    return;
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const msgId = Number(reservation.telegramStaffMessageId);
    if (!Number.isFinite(msgId)) return;
    await editTelegramStaffMessage(
      reservation.telegramStaffChatId,
      msgId,
      reservation,
    );
  } catch (err) {
    logJobError("reservation", "telegram staff message sync hata", {
      reservationId: reservation.id,
      err: (err as Error).message,
    });
  }
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
  const updated: ReservationWithVisitor = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { status: true },
      });
      if (!existing) throw new Error("Rezervasyon bulunamadi");
      if (existing.status !== "PENDING_APPROVAL") {
        throw new ReservationAlreadyProcessedError(existing.status);
      }
      return tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: staffId,
        },
        include: { visitor: true },
      });
    },
  );

  emitAppEvent({
    type: "reservation_updated",
    reservationId: updated.id,
    status: updated.status,
    visitorName: updated.visitor.name,
  });

  await notifyVisitorApproved(updated);

  // Yetkili Telegram mesajini guncelle (kaynak kanal ne olursa olsun).
  await syncStaffApprovalMessage(updated);

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
      select: { status: true, visitDate: true, durationMinutes: true },
    });
    if (!existing) {
      throw new Error("Rezervasyon bulunamadi");
    }
    if (existing.status !== "PENDING_APPROVAL") {
      throw new ReservationAlreadyProcessedError(existing.status);
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

  // Yetkili Telegram mesajini guncelle.
  await syncStaffApprovalMessage(result.reservation);

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

// Yetkili tarafindan rezervasyon tarih/saat degisikligi. Slot cakisma
// kontrolu yapilir (kendi mevcut slotunu disar tutarak). Status korunur
// (PENDING_APPROVAL -> PENDING_APPROVAL, APPROVED -> APPROVED). Eski reminder
// job iptal edilir, gerekirse yeni job kurulur. Ziyaretciye kanaldan bildirim.
export async function rescheduleReservation(
  reservationId: string,
  newDate: string,
  newStartTime: string,
  newDurationMinutes: number | undefined,
): Promise<ReservationWithVisitor> {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: {
        status: true,
        durationMinutes: true,
        visitDate: true,
        startTime: true,
      },
    });
    if (!existing) throw new Error("Rezervasyon bulunamadi");
    // Sadece aktif rezervasyonlar reschedule edilebilir.
    if (!["PENDING_APPROVAL", "APPROVED"].includes(existing.status)) {
      throw new ReservationAlreadyProcessedError(existing.status);
    }

    const duration = newDurationMinutes ?? existing.durationMinutes;
    const available = await isSlotAvailable(
      newDate,
      newStartTime,
      duration,
      tx,
      reservationId, // kendi mevcut slotunu cakisma sayma
    );
    if (!available) {
      const alternatives = await getAvailableSlots(newDate, duration, tx);
      throw new SlotUnavailableError(
        "Yeni slot artik musait degil",
        alternatives.slice(0, MAX_ALTERNATIVES),
      );
    }

    return tx.reservation.update({
      where: { id: reservationId },
      data: {
        visitDate: new Date(`${newDate}T00:00:00.000Z`),
        startTime: newStartTime,
        durationMinutes: duration,
      },
      include: { visitor: true },
    });
  });

  // Real-time event
  emitAppEvent({
    type: "reservation_updated",
    reservationId: updated.id,
    status: updated.status,
    visitorName: updated.visitor.name,
  });

  // Telegram staff approval mesajini guncelle (tarih/saat icerigi degisti).
  await syncStaffApprovalMessage(updated);

  // Reminder/timeout job'larini sifirla, APPROVED ise yeniden planla.
  await Promise.all([
    removeJobSafe(reminderQueue, reminderJobId(reservationId)),
  ]);
  if (updated.status === "APPROVED") {
    const settings = await getSettings();
    const reminderHours = settings.reminderHours ?? ENV_REMINDER_HOURS;
    const visitMs =
      updated.visitDate.getTime() +
      timeToMinutes(updated.startTime) * 60 * 1000;
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
      logJobError("reservation", "reschedule reminder ekleme hata", {
        reservationId,
        err: (err as Error).message,
      });
    }
  }

  // Ziyaretciye yeni tarih/saat bildirimi (kaynak kanaldan).
  if (updated.source === "telegram" && updated.telegramChatId) {
    try {
      await sendTelegramReschedule(updated.telegramChatId, updated);
    } catch (err) {
      logJobError("reservation", "telegram reschedule notify hata", {
        reservationId,
        err: (err as Error).message,
      });
    }
  } else if (process.env.WA_ACCESS_TOKEN) {
    try {
      await sendWAReschedule(updated);
    } catch (err) {
      logJobError("reservation", "wa reschedule notify hata", {
        reservationId,
        err: (err as Error).message,
      });
    }
  }

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
