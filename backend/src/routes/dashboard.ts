import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { verifyJWT } from "../middleware/auth";

const DEFAULT_DURATION_MIN = Number(process.env.DEFAULT_DURATION_MINUTES) || 120;
const WORK_MINUTES_PER_DAY = 10 * 60; // 09:00 - 19:00
const WORK_DAYS_PER_WEEK = 7;
const WEEK_CAPACITY_MIN = WORK_MINUTES_PER_DAY * WORK_DAYS_PER_WEEK;

const SLOT_STEP_MIN = 120; // 2 saatlik standart slotlar
const WORK_START_MIN = 9 * 60;
const WORK_END_MIN = 19 * 60;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const day = c.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  c.setUTCDate(c.getUTCDate() + diff);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function toHHMM(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// "YYYY-MM-DD" -> UTC midnight Date (slots/reservations icin)
function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoToday(): string {
  const d = startOfDay(new Date());
  return d.toISOString().slice(0, 10);
}

type DaySlot = {
  startTime: string;
  endTime: string;
  status: "available" | "booked" | "pending" | "closed";
  label?: string;
  reservationId?: string;
  blockId?: string;
};

async function buildDaySlots(dateISO: string): Promise<DaySlot[]> {
  const visitDate = parseIsoDate(dateISO);

  const [reservations, blockedSlots] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        visitDate,
        status: { in: ["PENDING_APPROVAL", "APPROVED"] },
      },
      include: { visitor: true },
    }),
    prisma.slot.findMany({
      where: { slotDate: visitDate, isBlocked: true },
    }),
  ]);

  const result: DaySlot[] = [];
  for (let m = WORK_START_MIN; m + SLOT_STEP_MIN <= WORK_END_MIN; m += SLOT_STEP_MIN) {
    const startTime = toHHMM(m);
    const endTime = toHHMM(m + SLOT_STEP_MIN);

    const block = blockedSlots.find((b) =>
      overlaps(m, m + SLOT_STEP_MIN, timeToMinutes(b.startTime), timeToMinutes(b.endTime)),
    );
    if (block) {
      result.push({
        startTime,
        endTime,
        status: "closed",
        label: block.blockReason ?? "Kapalı",
        blockId: block.id,
      });
      continue;
    }

    const reservation = reservations.find((r) => {
      const rs = timeToMinutes(r.startTime);
      return overlaps(m, m + SLOT_STEP_MIN, rs, rs + r.durationMinutes);
    });
    if (reservation) {
      result.push({
        startTime,
        endTime,
        status: reservation.status === "APPROVED" ? "booked" : "pending",
        label: reservation.visitor?.name ?? "Ziyaretçi",
        reservationId: reservation.id,
      });
      continue;
    }

    result.push({ startTime, endTime, status: "available" });
  }
  return result;
}

const dateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD bekleniyor"),
});

const weekQuery = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD bekleniyor"),
});

function isoPlusDays(startISO: string, n: number): string {
  const d = new Date(`${startISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", verifyJWT);

  app.get("/stats", async () => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);

    const [todayCount, pendingCount, weekRows, pendingPreview] =
      await Promise.all([
        prisma.reservation.count({
          where: {
            visitDate: { gte: today, lt: tomorrow },
            status: { in: ["APPROVED", "PENDING_APPROVAL"] },
          },
        }),
        prisma.reservation.count({
          where: { status: "PENDING_APPROVAL" },
        }),
        prisma.reservation.findMany({
          where: {
            visitDate: { gte: weekStart, lt: weekEnd },
            status: "APPROVED",
          },
          select: { durationMinutes: true },
        }),
        prisma.reservation.findMany({
          where: { status: "PENDING_APPROVAL" },
          include: { visitor: true },
          orderBy: { createdAt: "asc" },
          take: 5,
        }),
      ]);

    const bookedMinutes = weekRows.reduce(
      (sum, r) => sum + (r.durationMinutes || DEFAULT_DURATION_MIN),
      0,
    );
    const utilizationPct = Math.min(
      100,
      Math.round((bookedMinutes / WEEK_CAPACITY_MIN) * 100),
    );

    return {
      today: todayCount,
      pending: pendingCount,
      thisWeek: weekRows.length,
      utilizationPct,
      pendingPreview,
    };
  });

  app.get("/today-slots", async () => {
    const slots = await buildDaySlots(isoToday());
    return { date: isoToday(), slots };
  });

  app.get("/slots", async (req, reply) => {
    const parsed = dateQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const slots = await buildDaySlots(parsed.data.date);
    return reply.send({ date: parsed.data.date, slots });
  });

  app.get("/week-slots", async (req, reply) => {
    const parsed = weekQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { startDate } = parsed.data;
    const dates = Array.from({ length: 7 }, (_, i) => isoPlusDays(startDate, i));
    const slotsPerDay = await Promise.all(dates.map((d) => buildDaySlots(d)));
    const days: Record<string, DaySlot[]> = {};
    dates.forEach((d, i) => {
      days[d] = slotsPerDay[i];
    });
    return reply.send({ startDate, days });
  });
};

export default dashboardRoutes;
