import { getServerSession } from "@/lib/auth";
import { fetchStatsSafe } from "@/components/stats/server-fetch";
import { HomeStats } from "@/components/stats/HomeStats";
import { TodayTimeline } from "@/components/TodayTimeline";
import { formatTrLongDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const session = await getServerSession();
  const staffId = session?.user?.id || session?.user?.email || "staff";
  const initial = await fetchStatsSafe(session?.backendToken);
  const today = formatTrLongDate(new Date());

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      {/* Topbar: tek satır flex */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            className="gradient-text"
            style={{
              fontSize: "26px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Genel Bakış
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--gx-text-muted)",
              margin: "4px 0 0",
            }}
          >
            Bugün ve bu hafta özeti, bekleyen onaylar.
          </p>
        </div>

        <span
          style={{
            background: "var(--gx-surface)",
            border: "1px solid var(--gx-border-accent)",
            padding: "7px 16px",
            borderRadius: "99px",
            fontSize: "12px",
            color: "var(--gx-accent-light)",
            fontWeight: 600,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {today}
        </span>
      </div>

      <HomeStats initial={initial} staffId={staffId}>
        <TodayTimeline />
      </HomeStats>
    </div>
  );
}
