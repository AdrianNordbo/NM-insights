"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { InfoIkon } from "@/components/InfoIkon";
import { formatDayMonth, formatNumber } from "@/lib/format";
import { KILDER } from "@/lib/kilder";
import { fromPlain } from "@/lib/oversikt/aktivitet";
import {
  type ChartDay,
  chartData,
  type ChartPost,
  DEFAULT_RANGE,
  type Peak,
  placeablePeaks,
  type Range,
  RANGES,
  type UtviklingSerie,
} from "@/lib/oversikt/graf";

const RANGE_LABEL: Record<Range, string> = { "7": "7d", "30": "30d", "90": "90d", alt: "Alt" };
const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const SYNC_ID = "utvikling";

function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

/** «03.07–30.09», med år når intervallet går over et årsskifte. */
function rangeText(start: string, end: string): string {
  if (start.slice(0, 4) === end.slice(0, 4)) return `${formatDayMonth(start)}–${formatDayMonth(end)}`;
  return `${formatDayMonth(start)}.${start.slice(2, 4)}–${formatDayMonth(end)}.${end.slice(2, 4)}`;
}

const compact = new Intl.NumberFormat("nb-NO", { notation: "compact", maximumFractionDigits: 1 });

/** Bredden på elementet, oppdatert når vinduet endres. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function Tips({ active, payload, peaks, takeover }: TooltipContentProps & { peaks: Peak[]; takeover: string | null }) {
  const day = payload?.[0]?.payload as ChartDay | undefined;
  if (!active || !day) return null;
  const peak = peaks.find((p) => p.date === day.date);
  return (
    <div className="chart-tip">
      <table>
        <thead>
          <tr>
            <th />
            <th>Visninger</th>
            <th>Interaksjoner</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{longDate(day.date)}</td>
            <td>{formatNumber(day.views)}</td>
            <td>{formatNumber(day.interactions)}</td>
          </tr>
          {day.prevDate && (
            <tr className="prev">
              <td>{longDate(day.prevDate)}</td>
              <td>{formatNumber(day.prevViews)}</td>
              <td>{formatNumber(day.prevInteractions)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {day.date === takeover && <p>Nordbø Marketing starter</p>}
      {peak && <p>Mulig årsak: {peak.title}</p>}
    </div>
  );
}

type LabelProps = { viewBox?: { x?: number; y?: number; width?: number; height?: number } };

/** Tekst ved siden av en topp: til høyre for punktet, eller til venstre når den ellers går utenfor. */
function SideLabel({ viewBox, text, chartWidth, top }: LabelProps & { text: string; chartWidth: number; top?: boolean }) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const left = x > chartWidth - 230;
  return (
    <text
      x={left ? x - 8 : x + 8}
      y={top ? 12 : Math.max(14, y - 8)}
      textAnchor={left ? "end" : "start"}
      className={top ? "chart-marker-label" : "chart-peak-label"}
    >
      {text}
    </text>
  );
}

export function Utvikling({ series, posts }: { series: UtviklingSerie[]; posts: ChartPost[] }) {
  const [selected, setSelected] = useState(series[0]?.id);
  const [range, setRange] = useState<Range>(DEFAULT_RANGE);
  const [chartRef, width] = useWidth<HTMLDivElement>();
  const narrow = useNarrow();
  const current = series.find((s) => s.id === selected) ?? series[0];
  const s = useMemo(() => (current ? fromPlain(current.plain) : null), [current]);
  const maxPeaks = narrow ? 1 : range === "7" || range === "30" ? 2 : 3;
  const data = useMemo(() => (s ? chartData(s, range, posts, maxPeaks) : null), [s, range, posts, maxPeaks]);
  if (!current || !s || !data) return null;
  // Plottbredden er grafens bredde minus y-aksen (44 px) og høyremargen (8 px).
  const labelled = placeablePeaks(data, Math.max(0, width - 52));

  const tickDate = (d: string) => (range === "alt" ? `${formatDayMonth(d)}.${d.slice(2, 4)}` : formatDayMonth(d));
  const tooltip = (props: TooltipContentProps) => <Tips {...props} peaks={data.peaks} takeover={data.takeover} />;
  // Y-aksen starter alltid på 0. Plattformene rapporterer nettotall per døgn, så et døgn kan være
  // svakt negativt (f.eks. −1 like når noen angrer); det klippes ved nullinjen i stedet for å flytte aksen.
  const yAxis = (
    <YAxis width={44} domain={[0, "auto"]} allowDataOverflow tickFormatter={(v: number) => compact.format(v)} tickLine={false} axisLine={false} allowDecimals={false} />
  );

  return (
    <section className="block" aria-labelledby="utvikling">
      <div className="block-head">
        <h2 id="utvikling">
          Utvikling per dag <span className="range-chip">{rangeText(data.start, data.end)}</span>{" "}
          <InfoIkon id="utvikling" text={KILDER.utvikling} />
        </h2>
        <div className="chart-controls">
          <div className="lseg" role="group" aria-label="Plattform og format">
            {series.map((x) => (
              <button
                key={x.id}
                type="button"
                className={x.platform}
                aria-pressed={x.id === current.id}
                onClick={() => setSelected(x.id)}
              >
                {x.name}
              </button>
            ))}
          </div>
          <div className="lseg" role="group" aria-label="Intervall">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`card utvikling ${current.platform}`}>
        <div className="chart-legend">
          <span>
            <i className="swatch" aria-hidden="true" />
            {range === "alt" ? "Hele perioden" : "Valgt periode"} ({rangeText(data.start, data.end)})
          </span>
          {data.prevRange && (
            <span>
              <i className="swatch dashed" aria-hidden="true" />
              Forrige periode ({rangeText(data.prevRange.start, data.prevRange.end)})
            </span>
          )}
        </div>

        <div className="chart-title">
          Visninger <InfoIkon id="utvikling-visninger" text={KILDER.utviklingVisninger} />
        </div>
        <div
          className="chart"
          role="img"
          aria-label={`Visninger per døgn for ${current.name}, ${rangeText(data.start, data.end)}`}
          ref={chartRef}
        >
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={data.days} syncId={SYNC_ID} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="utvikling-fyll" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="currentColor" stopOpacity={0.3} />
                  <stop offset="1" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} className="chart-grid" />
              <XAxis dataKey="date" hide />
              {yAxis}
              <Tooltip content={tooltip} cursor={{ className: "chart-cursor" }} isAnimationActive={false} />
              {data.takeover && (
                <ReferenceLine
                  x={data.takeover}
                  className="chart-marker"
                  label={(p: LabelProps) => <SideLabel {...p} text="Nordbø Marketing starter" chartWidth={width} top />}
                />
              )}
              {data.prevRange && (
                <Line dataKey="prevViews" className="prev-line" dot={false} activeDot={false} isAnimationActive={false} strokeDasharray="4 4" />
              )}
              <Area
                dataKey="views"
                stroke="currentColor"
                strokeWidth={2}
                fill="url(#utvikling-fyll)"
                dot={false}
                activeDot={{ r: 4, fill: "currentColor", stroke: "none" }}
                isAnimationActive={false}
              />
              {labelled.map((p) => (
                <ReferenceDot
                  key={p.date}
                  x={p.date}
                  y={p.views}
                  r={4}
                  fill="currentColor"
                  className="chart-peak"
                  label={(lp: LabelProps) => <SideLabel {...lp} text={`Mulig årsak: ${p.title}`} chartWidth={width} />}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-title">
          Interaksjoner <InfoIkon id="utvikling-interaksjoner" text={KILDER.interaksjoner} />
        </div>
        <div className="chart" role="img" aria-label={`Interaksjoner per døgn for ${current.name}, ${rangeText(data.start, data.end)}`}>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={data.days} syncId={SYNC_ID} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="utvikling-fyll-2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="currentColor" stopOpacity={0.3} />
                  <stop offset="1" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} className="chart-grid" />
              <XAxis dataKey="date" tickFormatter={tickDate} tickLine={false} axisLine={false} minTickGap={36} interval="preserveStartEnd" />
              {yAxis}
              <Tooltip content={() => null} cursor={{ className: "chart-cursor" }} isAnimationActive={false} />
              {data.takeover && <ReferenceLine x={data.takeover} className="chart-marker" />}
              {data.prevRange && (
                <Line dataKey="prevInteractions" className="prev-line" dot={false} activeDot={false} isAnimationActive={false} strokeDasharray="4 4" />
              )}
              <Area
                dataKey="interactions"
                stroke="currentColor"
                strokeWidth={2}
                fill="url(#utvikling-fyll-2)"
                dot={false}
                activeDot={{ r: 4, fill: "currentColor", stroke: "none" }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
