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

    // Grid çizgileri
    ctx.strokeStyle = "rgba(165,180,252,0.25)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#a5b4fc";
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

    // Barlar
    const gap = W / data.length;
    const barW = gap * 0.6;
    data.forEach((v, i) => {
      const x = PL + gap * i + (gap - barW) / 2;
      const h = max === 0 ? 0 : (v / max) * H;
      const y = PT + H - h;
      ctx.fillStyle = hover?.idx === i ? "#6366f1" : "#4338ca";
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

    // X label
    ctx.fillStyle = "#818cf8";
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
            top: hover.y - 36,
            background: "#1e1b4b",
            color: "#ffffff",
            fontSize: "11px",
            padding: "6px 10px",
            borderRadius: "8px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(30,27,75,0.3)",
            fontWeight: 500,
          }}
        >
          {labels[hover.idx]}: <b>{data[hover.idx]}</b>
        </div>
      )}
    </div>
  );
}
