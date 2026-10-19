"use client";

import { useRef, useState } from "react";
import { formatDayMonth, formatNumber } from "@/lib/format";
import type { ChartDay } from "@/lib/oversikt/periodemodell";

const W = 600;
const HT = 190;
const HB = 100;

/** Visninger øverst, interaksjoner under, felles tidsakse og felles markør. Forrige periode stiplet. */
export function Borsgraf({ days, prevLabel }: { days: ChartDay[]; prevLabel: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; px: number; width: number } | null>(null);
  const n = days.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const maxV = Math.max(1, ...days.map((d) => Math.max(d.views, d.prevViews ?? 0)));
  const maxI = Math.max(1, ...days.map((d) => Math.max(d.interactions, d.prevInteractions ?? 0)));
  const path = (get: (d: ChartDay) => number | null, max: number, H: number) =>
    days
      .map((d, i) => {
        const v = get(d);
        if (v == null) return "";
        const prev = i > 0 ? get(days[i - 1]) : null;
        return `${i === 0 || prev == null ? "M" : "L"}${x(i).toFixed(1)},${(H - 4 - (Math.max(0, v) / max) * (H - 12)).toFixed(1)}`;
      })
      .join("");
  const area = (get: (d: ChartDay) => number | null, max: number, H: number) => `${path(get, max, H)}L${x(n - 1)},${H}L${x(0)},${H}Z`;
  const grid = (H: number) =>
    [0.33, 0.66].map((g) => {
      const y = (H - 4 - g * (H - 12)).toFixed(1);
      return <line key={g} x1={0} x2={W} y1={y} y2={y} stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />;
    });
  const hasPrev = days.some((d) => d.prevViews != null);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !n) return;
    const i = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (n - 1));
    setHover({ i, px: n === 1 ? r.width / 2 : (i / (n - 1)) * r.width, width: r.width });
  };
  const d = hover ? days[hover.i] : null;
  const mid = days[Math.floor((n - 1) / 2)];

  return (
    <>
      <div
        className="stock"
        ref={box}
        onPointerMove={(e) => move(e.clientX)}
        onPointerDown={(e) => move(e.clientX)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      >
        <div className="pane-label">
          <span>Visninger</span>
          <span>maks {formatNumber(maxV)}</span>
        </div>
        <svg className="top-svg" viewBox={`0 0 ${W} ${HT}`} preserveAspectRatio="none" role="img" aria-label="Visninger per døgn">
          {grid(HT)}
          {hasPrev && <path d={path((x) => x.prevViews, maxV, HT)} fill="none" stroke="var(--chart-prev)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          <path d={area((x) => x.views, maxV, HT)} fill="var(--chart-fill)" />
          <path d={path((x) => x.views, maxV, HT)} fill="none" stroke="var(--chart-line)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="pane-label">
          <span>Interaksjoner</span>
          <span>maks {formatNumber(maxI)}</span>
        </div>
        <svg className="bot-svg" viewBox={`0 0 ${W} ${HB}`} preserveAspectRatio="none" role="img" aria-label="Interaksjoner per døgn">
          {grid(HB)}
          {hasPrev && <path d={path((x) => x.prevInteractions, maxI, HB)} fill="none" stroke="var(--chart-prev)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          <path d={area((x) => x.interactions, maxI, HB)} fill="var(--chart-fill)" />
          <path d={path((x) => x.interactions, maxI, HB)} fill="none" stroke="var(--chart-line)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="xaxis">
          <span>{formatDayMonth(days[0].date)}</span>
          <span>{formatDayMonth(mid.date)}</span>
          <span>{formatDayMonth(days[n - 1].date)}</span>
        </div>
        {hover && d && (
          <>
            <div className="cursor" style={{ left: hover.px }} />
            <div className="tip" style={{ left: Math.min(hover.width - 170, Math.max(0, hover.px + 10)) }}>
              <b>{formatDayMonth(d.date)}</b>
              <span>
                Visninger <b style={{ display: "inline" }}>{formatNumber(d.views)}</b>
              </span>
              <span>
                Interaksjoner <b style={{ display: "inline" }}>{formatNumber(d.interactions)}</b>
              </span>
              {d.prevViews != null && (
                <span className="muted">
                  Forrige: {formatNumber(d.prevViews)} / {formatNumber(d.prevInteractions)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      <div className="legend">
        <span>
          <i />
          Valgt periode
        </span>
        {hasPrev && prevLabel && (
          <span>
            <i className="prev" />
            {prevLabel}
          </span>
        )}
      </div>
    </>
  );
}
