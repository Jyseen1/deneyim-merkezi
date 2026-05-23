"use client";

export type DonutSegment = {
  value: number;
  color: string;
  label: string;
};

export function Donut({
  segments,
  size = 160,
  thickness = 16,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={thickness}
      />
      {segments.map((s, i) => {
        const segLen = (s.value / total) * c;
        const dasharray = `${segLen} ${c - segLen}`;
        const dashoffset = -acc;
        acc += segLen;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
      })}
      {/* Merkezde ince beyaz rakam (font-weight 300, Space Grotesk) */}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        fontSize="28"
        fontWeight="300"
        fill="#FFFFFF"
        style={{ fontFamily: "var(--font-display), system-ui" }}
      >
        {segments.reduce((s, x) => s + x.value, 0)}
      </text>
      {/* TOPLAM altinda — serif italik mor */}
      <text
        x={size / 2}
        y={size / 2 + 18}
        textAnchor="middle"
        fontSize="11"
        fill="#8B5CF6"
        fontStyle="italic"
        style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
      >
        toplam
      </text>
    </svg>
  );
}
