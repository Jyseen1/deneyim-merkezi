import { getServerSession } from "@/lib/auth";
import { fetchStatsSafe } from "@/components/stats/server-fetch";
import { OverviewClient } from "@/components/overview/OverviewClient";
import { formatTrLongDate, TR_DAYS } from "@/lib/date";

export const dynamic = "force-dynamic";

function firstName(full?: string | null): string {
  if (!full) return "";
  const trimmed = full.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

export default async function DashboardHome() {
  const session = await getServerSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const initial = await fetchStatsSafe(session?.backendToken);

  const now = new Date();
  const dateLong = formatTrLongDate(now);
  const dayName = TR_DAYS[now.getDay()];
  const name = firstName(session?.user?.name);

  return (
    <OverviewClient
      initial={initial}
      staffId={staffId}
      dateLong={dateLong}
      dayName={dayName}
      firstName={name}
    />
  );
}
