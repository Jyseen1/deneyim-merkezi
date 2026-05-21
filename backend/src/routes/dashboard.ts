import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/client";
import { verifyJWT } from "../middleware/auth";

const DEFAULT_DURATION_MIN = Number(process.env.DEFAULT_DURATION_MINUTES) || 120;
const WORK_MINUTES_PER_DAY = 10 * 60; // 09:00 - 19:00
const WORK_DAYS_PER_WEEK = 7;
const WEEK_CAPACITY_MIN = WORK_MINUTES_PER_DAY * WORK_DAYS_PER_WEEK;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const day = c.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  c.setUTCDate(c.getUTCDate() + diff);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  // Tum dashboard endpoint'leri auth gerektirir
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
};

export default dashboardRoutes;
