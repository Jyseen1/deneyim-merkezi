import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { verifyJWT } from "../middleware/auth";
import { getSettings, workMinutesRange } from "../services/settings.service";

const ENV_DEFAULT_DURATION = Number(process.env.DEFAULT_DURATION_MINUTES) || 120;
const WORK_DAYS_PER_WEEK = 7;

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
  const settings = await getSettings();
  const { start: workStartMin, end: workEndMin } = workMinutesRange(settings);
  const slotStepMin = settings.defaultDuration || ENV_DEFAULT_DURATION;

  const [reservations, blockedSlots, recurringRules] = await Promise.all([
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
    prisma.recurringBlock.findMany({
      where: { dayOfWeek: visitDate.getUTCDay(), isActive: true },
    }),
  ]);

  const result: DaySlot[] = [];
  for (let m = workStartMin; m + slotStepMin <= workEndMin; m += slotStepMin) {
    const startTime = toHHMM(m);
    const endTime = toHHMM(m + slotStepMin);

    const block = blockedSlots.find((b) =>
      overlaps(m, m + slotStepMin, timeToMinutes(b.startTime), timeToMinutes(b.endTime)),
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

    // Recurring (haftalik) kural overlap
    const recurringBlock = recurringRules.find((r) =>
      overlaps(m, m + slotStepMin, timeToMinutes(r.startTime), timeToMinutes(r.endTime)),
    );
    if (recurringBlock) {
      result.push({
        startTime,
        endTime,
        status: "closed",
        label: recurringBlock.reason ?? "Düzenli kapalı",
      });
      continue;
    }

    const reservation = reservations.find((r) => {
      const rs = timeToMinutes(r.startTime);
      return overlaps(m, m + slotStepMin, rs, rs + r.durationMinutes);
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
    // Ay başlangıcı/sonu (UTC) — Genel Bakış "Bu Ay" stat kartı için
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const settings = await getSettings();
    const { start: wStartMin, end: wEndMin } = workMinutesRange(settings);
    const weekCapacityMin = (wEndMin - wStartMin) * WORK_DAYS_PER_WEEK;

    const [
      todayCount,
      pendingCount,
      weekRows,
      monthCount,
      pendingPreview,
    ] = await Promise.all([
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
      prisma.reservation.count({
        where: {
          visitDate: { gte: monthStart, lt: monthEnd },
          status: { in: ["APPROVED", "PENDING_APPROVAL"] },
        },
      }),
      prisma.reservation.findMany({
        where: { status: "PENDING_APPROVAL" },
        include: {
          visitor: true,
          // Yetkili (outbound + staff_approval) son notification durumu:
          // failed ise dashboard'da "⚠ Bildirim gönderilemedi" rozeti gosterilir.
          notifications: {
            where: {
              direction: "outbound",
              templateName: "staff_approval",
            },
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { status: true, sentAt: true },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
    ]);

    const bookedMinutes = weekRows.reduce(
      (sum, r) =>
        sum + (r.durationMinutes || settings.defaultDuration || ENV_DEFAULT_DURATION),
      0,
    );
    const utilizationPct = Math.min(
      100,
      Math.round((bookedMinutes / weekCapacityMin) * 100),
    );

    // pendingPreview'a staffNotificationStatus ekle, notifications array'ini
    // payload'dan cikar (routes/reservations.ts ile ayni format).
    const pendingPreviewEnriched = pendingPreview.map(
      ({ notifications, ...rest }) => {
        const last = notifications[0];
        const staffNotificationStatus: "sent" | "failed" | "pending" = !last
          ? "pending"
          : last.status === "sent"
            ? "sent"
            : "failed";
        return { ...rest, staffNotificationStatus };
      },
    );

    return {
      today: todayCount,
      pending: pendingCount,
      thisWeek: weekRows.length,
      thisMonth: monthCount,
      utilizationPct,
      pendingPreview: pendingPreviewEnriched,
      // Genel Bakış hero sağ üst status chip'leri için sistem durumu.
      // Backend bu cevabı verebildiyse "online" demektir; telegram bot
      // token'ı varsa "bağlı" kabul edilir (gerçek bot ping yapılmaz —
      // env presence yeterli pratik sinyal).
      system: {
        backendOnline: true,
        telegramConnected: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      },
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

  // Donem filtreli istatistik: KPI + bar + saat + status dagilimi.
  app.get<{ Querystring: { range?: string } }>("/stats/period", async (req, reply) => {
    const range = (req.query.range || "month") as "week" | "month" | "3m";
    if (!["week", "month", "3m"].includes(range)) {
      return reply.code(400).send({ error: "invalid_range" });
    }

    const now = new Date();
    let start: Date;
    let buckets: { label: string; from: Date; to: Date }[] = [];

    if (range === "week") {
      start = startOfWeek(now);
      const labels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
      buckets = labels.map((label, i) => ({
        label,
        from: addDays(start, i),
        to: addDays(start, i + 1),
      }));
    } else if (range === "month") {
      // Bu ayın ilk gününden bugüne 4 haftalık dağılım
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      buckets = ["H1", "H2", "H3", "H4"].map((label, i) => ({
        label,
        from: addDays(start, i * 7),
        to: addDays(start, (i + 1) * 7),
      }));
    } else {
      // Son 3 ay
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
      const MONTHS_TR = [
        "Oca", "Şub", "Mar", "Nis", "May", "Haz",
        "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
      ];
      buckets = [0, 1, 2].map((i) => {
        const from = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
        );
        const to = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1),
        );
        return { label: MONTHS_TR[from.getUTCMonth()], from, to };
      });
    }

    const end = buckets[buckets.length - 1].to;

    const rows = await prisma.reservation.findMany({
      where: { visitDate: { gte: start, lt: end } },
      select: {
        visitDate: true,
        startTime: true,
        status: true,
        createdAt: true,
        approvedAt: true,
      },
    });

    // KPI
    const total = rows.length;
    const approved = rows.filter((r) => r.status === "APPROVED").length;
    const pending = rows.filter((r) => r.status === "PENDING_APPROVAL").length;
    const rejected = rows.filter((r) => r.status === "REJECTED").length;
    const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const noShow = rows.filter((r) => r.status === "NO_SHOW").length;

    const decided = approved + rejected;
    const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0;
    const cancelRate =
      total > 0
        ? Math.round(((cancelled + rejected) / total) * 100)
        : 0;
    const noShowRate =
      approved + noShow > 0
        ? Math.round((noShow / (approved + noShow)) * 100)
        : 0;

    const respMinutes = rows
      .filter((r) => r.approvedAt && r.createdAt)
      .map(
        (r) =>
          (new Date(r.approvedAt!).getTime() - new Date(r.createdAt).getTime()) /
          60000,
      );
    const avgResponseMinutes =
      respMinutes.length > 0
        ? Math.round(respMinutes.reduce((a, b) => a + b, 0) / respMinutes.length)
        : 0;

    // Weekly/period distribution
    const weeklyDistribution = buckets.map((b) => ({
      label: b.label,
      count: rows.filter(
        (r) => new Date(r.visitDate) >= b.from && new Date(r.visitDate) < b.to,
      ).length,
    }));

    // Saat dagilimi (calisma saatleri icinde)
    const settings = await getSettings();
    const slotStep = settings.defaultDuration || ENV_DEFAULT_DURATION;
    const { start: wStart, end: wEnd } = workMinutesRange(settings);
    const hourBuckets: { time: string; count: number }[] = [];
    for (let m = wStart; m + slotStep <= wEnd; m += slotStep) {
      const startTime = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const count = rows.filter((r) => r.startTime === startTime).length;
      hourBuckets.push({ time: startTime, count });
    }

    return reply.send({
      range,
      kpi: {
        total,
        approvalRate,
        avgResponseMinutes,
        cancelRate,
        noShowRate,
      },
      weeklyDistribution,
      hourDistribution: hourBuckets,
      statusDistribution: {
        approved,
        pending,
        rejected,
        cancelled,
        completed,
        noShow,
      },
    });
  });
};

export default dashboardRoutes;
