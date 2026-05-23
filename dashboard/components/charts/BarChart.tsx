"use client";

import { useEffect, useRef, useState } from "react";

type Hover = { idx: number; x: number; y: number } | null;

export function BarChart({
  data,
  labels,
  height = 220,
}: {
  data: number[];
  labels: string[];
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [width, setWidth] = useState(0);

  // Genişliği responsive ölç
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const PL = 36;
    const PR = 12;
    const PT = 12;
    const PB = 32;
    const W = width - PL - PR;
    const H = height - PT - PB;
    if (W <= 0 || H <= 0) return;
    const max = Math.max(...data, 1);

    // Grid çizgileri (white/5)
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#71717A";
    ctx.font = "10px var(--font-inter), system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const y = PT + (H * i) / 4;
      ctx.beginPath();
      ctx.moveTo(PL, y);
      ctx.lineTo(PL + W, y);
      ctx.stroke();
      const value = Math.round((max * (4 - i)) / 4);
      ctx.fillText(String(value), PL - 6, y);
    }

    // Barlar — mor gradient (#7C3AED → #A78BFA)
    const gap = W / data.length;
    const barW = gap * 0.6;
    data.forEach((v, i) => {
      const x = PL + gap * i + (gap - barW) / 2;
      const h = max === 0 ? 0 : (v / max) * H;
      const y = PT + H - h;
      const isHover = hover?.idx === i;
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, isHover ? "#A78BFA" : "#8B5CF6");
      grad.addColorStop(1, isHover ? "#8B5CF6" : "#7C3AED");
      ctx.fillStyle = grad;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.lineTo(x + barW - r, y);
      ctx.arcTo(x + barW, y, x + barW, y + r, r);
      ctx.lineTo(x + barW, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
    });

    // X label — muted
    ctx.fillStyle = "#A1A1AA";
    ctx.font = "11px var(--font-inter), system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    labels.forEach((label, i) => {
      const cx = PL + gap * i + gap / 2;
      ctx.fillText(label, cx, PT + H + 8);
    });
  }, [data, labels, height, width, hover]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const PL = 36;
    const PR = 12;
    const usable = rect.width - PL - PR;
    if (usable <= 0 || x < PL || x > rect.width - PR) {
      setHover(null);
      return;
    }
    const gap = usable / data.length;
    const idx = Math.floor((x - PL) / gap);
    if (idx >= 0 && idx < data.length) {
      setHover({ idx, x, y });
    } else {
      setHover(null);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${height}px`, display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hover.x + 12, (canvasRef.current?.getBoundingClientRect().width ?? 0) - 120),
            top: hover.y - 38,
            background:
              "linear-gradient(135deg, rgba(124,58,237,0.20), rgba(255,255,255,0.04)), #16161D",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(124,58,237,0.30)",
            color: "#FFFFFF",
            fontSize: "11px",
            padding: "7px 11px",
            borderRadius: "10px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            fontWeight: 500,
          }}
        >
          {labels[hover.idx]}: <b style={{ color: "#8B5CF6" }}>{data[hover.idx]}</b>
        </div>
      )}
    </div>
  );
}
