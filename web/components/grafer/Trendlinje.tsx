"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, type TooltipContentProps, YAxis } from "recharts";
import { formatNumber } from "@/lib/format";

export type TrendlinjePunkt = { key: string; label: string; value: number | null };

function Tips({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as TrendlinjePunkt | undefined;
  if (!active || !point) return null;
  return (
    <div className="trend-tip">
      <span className="muted">{point.label}</span>
      <b>{point.value == null ? "ingen data" : formatNumber(point.value)}</b>
    </div>
  );
}

/**
 * Liten trendlinje for de siste periodene. Fargen arves fra CSS (`color`), så den følger
 * plattformens farge og lys/mørk modus. Perioder uten data (null) tegnes ikke.
 */
export function Trendlinje({
  points,
  height,
  fill = false,
  ariaLabel,
}: {
  points: TrendlinjePunkt[];
  height: number;
  fill?: boolean;
  ariaLabel: string;
}) {
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className="trendlinje" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity={fill ? 0.35 : 0} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip content={Tips} cursor={{ stroke: "currentColor", strokeOpacity: 0.35 }} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, fill: "currentColor", stroke: "none" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
