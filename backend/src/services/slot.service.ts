import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import type { AvailableSlot } from "../types/reservation";
import { getSettings, workMinutesRange } from "./settings.service";

// Settings tablosundan calisma saatleri okunur; .env override etmez.
// Eski sabitler fallback olarak slot.service icinde tutulmaz — getSettings
// her cagrida cache'li olarak doner.
type Tx = Prisma.TransactionClient | PrismaClient;

export async function getAvailableSlots(
  date: string,
  durationMinutes: number,
  db: Tx = prisma,
): Promise<AvailableSlot[]> {
  const visitDate = parseDate(date);
  const settings = await getSettings();
  const { start: workStartMin, end: workEndMin } = workMinutesRange(settings);

  const dayOfWeek = visitDate.getUTCDay();
  const [blocked, busy, recurring] = await Promise.all([
    db.slot.findMany({
      where: { slotDate: visitDate, isBlocked: true },
      select: { startTime: true, endTime: true },
    }),
    db.reservation.findMany({
      where: {
        visitDate,
        status: { in: ["PENDING_APPROVAL", "APPROVED"] },
      },
      select: { startTime: true, durationMinutes: true },
    }),
    db.recurringBlock.findMany({
      where: { dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const blockedRanges = [
    ...blocked.map((s) => ({
      start: timeToMinutes(s.startTime),
      end: timeToMinutes(s.endTime),
    })),
    ...recurring.map((r) => ({
      start: timeToMinutes(r.startTime),
      end: timeToMinutes(r.endTime),
    })),
  ];
  const busyRanges = busy.map((r) => ({
    start: timeToMinutes(r.startTime),
    end: timeToMinutes(r.startTime) + r.durationMinutes,
  }));

  const candidates: AvailableSlot[] = [];
  for (
    let start = workStartMin;
    start + durationMinutes <= workEndMin;
    start += durationMinutes
  ) {
    const end = start + durationMinutes;
    const overlaps = (r: { start: number; end: number }) =>
      start < r.end && r.start < end;
    if (blockedRanges.some(overlaps) || busyRanges.some(overlaps)) continue;
    candidates.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
    });
  }

  return candidates;
}

// Race condition'i onlemek icin (date, startTime) bazli transactional advisory lock kullaniyoruz.
// `slots` tablosunda BLOK olmayan musait satir tutmadigimiz icin gercek bir SELECT FOR UPDATE'i
// kilitlenecek satir olmadigindan ise yaramaz. pg_advisory_xact_lock transaction sonunda
// otomatik birakildigi icin guvenli.
export async function isSlotAvailable(
  date: string,
  startTime: string,
  durationMinutes: number,
  db: Tx = prisma,
): Promise<boolean> {
  const visitDate = parseDate(date);
  const startMin = timeToMinutes(startTime);
  const endMin = startMin + durationMinutes;

  const settings = await getSettings();
  const { start: workStartMin, end: workEndMin } = workMinutesRange(settings);
  if (startMin < workStartMin || endMin > workEndMin) return false;

  const lockKey = advisoryLockKey(date, startTime);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  const conflictingBlock = await db.slot.findFirst({
    where: { slotDate: visitDate, isBlocked: true },
    select: { startTime: true, endTime: true },
  });
  if (
    conflictingBlock &&
    overlaps(
      startMin,
      endMin,
      timeToMinutes(conflictingBlock.startTime),
      timeToMinutes(conflictingBlock.endTime),
    )
  ) {
    return false;
  }

  // Recurring (haftalik) kurallar
  const dayOfWeek = visitDate.getUTCDay();
  const recurring = await db.recurringBlock.findMany({
    where: { dayOfWeek, isActive: true },
    select: { startTime: true, endTime: true },
  });
  for (const r of recurring) {
    if (overlaps(startMin, endMin, timeToMinutes(r.startTime), timeToMinutes(r.endTime))) {
      return false;
    }
  }

  const sameDayReservations = await db.reservation.findMany({
    where: {
      visitDate,
      status: { in: ["PENDING_APPROVAL", "APPROVED"] },
    },
    select: { startTime: true, durationMinutes: true },
  });

  for (const r of sameDayReservations) {
    const rStart = timeToMinutes(r.startTime);
    if (overlaps(startMin, endMin, rStart, rStart + r.durationMinutes)) {
      return false;
    }
  }

  return true;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Gecersiz saat formati: ${hhmm}`);
  }
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function parseDate(date: string): Date {
  // "YYYY-MM-DD" -> UTC midnight (Prisma @db.Date karsiligi)
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Gecersiz tarih formati: ${date}`);
  }
  return d;
}

// pg_advisory_xact_lock bigint alir; date+time'i deterministik bir int64'e indirgeyelim.
function advisoryLockKey(date: string, startTime: string): bigint {
  const s = `${date}T${startTime}`;
  let hash = 0xcbf29ce484222325n; // FNV-1a 64-bit offset
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    hash ^= BigInt(s.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  // pg bigint signed; asIntN ile signed int64'e cevirelim
  return BigInt.asIntN(64, hash);
}
