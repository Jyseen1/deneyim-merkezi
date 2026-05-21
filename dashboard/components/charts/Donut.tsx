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
        stroke="#ede9fe"
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
      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill="#1e1b4b"
      >
        {segments.reduce((s, x) => s + x.value, 0)}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 16}
        textAnchor="middle"
        fontSize="10"
        fill="#818cf8"
        letterSpacing="0.05em"
      >
        TOPLAM
      </text>
    </svg>
  );
}
