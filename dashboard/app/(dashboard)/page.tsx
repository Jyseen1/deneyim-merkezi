import { getServerSession } from "@/lib/auth";
import { fetchStatsSafe, EMPTY_STATS } from "@/components/stats/server-fetch";
import { HomeStats } from "@/components/stats/HomeStats";
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
  const stats = initial.ok ? initial.stats : EMPTY_STATS;

  const now = new Date();
  const dateLong = formatTrLongDate(now);
  const dayName = TR_DAYS[now.getDay()];
  const name = firstName(session?.user?.name);

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", textAlign: "center" }}>
      {/* Tarih chip */}
      <div
        className="fade-up"
        style={{
          fontSize: "10px",
          color: "var(--gx-accent-light)",
          letterSpacing: "0.20em",
          textTransform: "uppercase",
          fontWeight: 700,
          marginTop: "12px",
        }}
      >
        {dateLong} · {dayName}
      </div>

      {/* Buyuk karsilama — isim serif italik mor */}
      <h1
        className="fade-up fade-up-1 font-display"
        style={{
          fontSize: "44px",
          fontWeight: 400,
          color: "var(--gx-text)",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          margin: "16px 0 14px",
        }}
      >
        Hoş geldin
        {name && (
          <>
            ,{" "}
            <span
              className="font-serif font-italic"
              style={{
                fontWeight: 400,
                color: "var(--gx-accent-light)",
                letterSpacing: "0",
              }}
            >
              {name}
            </span>
          </>
        )}
      </h1>

      {/* Alt cumle — sayilar vurgu */}
      <p
        className="fade-up fade-up-2"
        style={{
          fontSize: "14px",
          color: "var(--gx-text-muted)",
          margin: "0 auto 32px",
          lineHeight: 1.6,
          maxWidth: "440px",
        }}
      >
        Bugün{" "}
        <span style={{ color: "var(--gx-text)", fontWeight: 600 }}>
          {stats.today}
        </span>{" "}
        <span className="font-serif font-italic" style={{ color: "var(--gx-text-muted)" }}>
          ziyaret
        </span>{" "}
        planlı,{" "}
        <span style={{ color: "var(--gx-accent-light)", fontWeight: 600 }}>
          {stats.pending}
        </span>{" "}
        <span className="font-serif font-italic" style={{ color: "var(--gx-accent-light)" }}>
          onay
        </span>{" "}
        seni bekliyor.
      </p>

      <HomeStats initial={initial} staffId={staffId} />
    </div>
  );
}
