import { prisma } from "../db/client";
import type { Settings } from "@prisma/client";

const SINGLETON_ID = "singleton";
const TTL_MS = 60 * 1000;

let cached: Settings | null = null;
let cachedAt = 0;

export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  const row =
    (await prisma.settings.findUnique({ where: { id: SINGLETON_ID } })) ??
    (await prisma.settings.create({ data: { id: SINGLETON_ID } }));
  cached = row;
  cachedAt = Date.now();
  return row;
}

export function invalidateSettingsCache() {
  cached = null;
  cachedAt = 0;
}

// Slot/calisma saatleri yardimcilari (dakika cinsinden).
export function workMinutesRange(s: Settings): { start: number; end: number } {
  return {
    start: timeToMinutes(s.workStart),
    end: timeToMinutes(s.workEnd),
  };
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Gecersiz saat formati: ${hhmm}`);
  }
  return h * 60 + m;
}
