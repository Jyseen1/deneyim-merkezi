import { apiFetch, ApiError } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";

export type StatsResult =
  | { ok: true; stats: DashboardStats }
  | { ok: false; error: string };

const EMPTY_STATS: DashboardStats = {
  today: 0,
  pending: 0,
  thisWeek: 0,
  thisMonth: 0,
  utilizationPct: 0,
  pendingPreview: [],
};

export async function fetchStatsSafe(token?: string): Promise<StatsResult> {
  try {
    const stats = await apiFetch<DashboardStats>("/dashboard/stats", {}, token);
    return { ok: true, stats };
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.status === 0
          ? "Backend bağlantısı kurulamadı"
          : `Backend hatası: ${err.status} ${err.message}`
        : (err as Error).message;
    return { ok: false, error: message };
  }
}

export { EMPTY_STATS };
