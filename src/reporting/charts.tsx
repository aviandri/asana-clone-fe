// Recharts building blocks following the dataviz mark specs: thin bars with 4px rounded data-ends,
// 2px surface gaps between stacked fills, 2px lines with ≥8px markers, solid hairline grid, one
// y-axis, and a tooltip on every mark. Colour is identity only; text uses ink colours.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART } from './palette';

const axisProps = { stroke: CHART.axis, tick: { fill: CHART.ink, fontSize: 12 }, tickLine: false } as const;
const tooltipProps = {
  cursor: { fill: 'rgba(11,11,11,0.04)' },
  contentStyle: { borderRadius: 8, borderColor: '#e5e7eb', fontSize: 12 },
} as const;

export type SeriesSpec<K extends string> = { key: K; label: string; color: string };

/** Horizontal stacked bars — one row per category (sections, people). */
export function HBarStack<K extends string>({
  data,
  categoryKey,
  series,
}: {
  data: (Record<K, number> & Record<string, string | number>)[];
  categoryKey: string;
  series: SeriesSpec<K>[];
}) {
  const height = Math.max(120, data.length * 32 + 40);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis type="category" dataKey={categoryKey} width={120} {...axisProps} axisLine={false} />
          <Tooltip {...tooltipProps} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
              stroke="#ffffff"
              strokeWidth={2}
              barSize={14}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical single-series bars (one colour for every bar — nominal/ordinal categories). */
export function VBarSingle({ data, categoryKey, valueKey, label, color }: { data: Record<string, string | number>[]; categoryKey: string; valueKey: string; label: string; color: string }) {
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey={categoryKey} {...axisProps} />
          <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey={valueKey} name={label} fill={color} barSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Multi-line trend on one shared count axis (never dual-axis). */
export function TrendLines<K extends string>({ data, xKey, series, formatX }: { data: Record<string, string | number>[]; xKey: string; series: SeriesSpec<K>[]; formatX?: (v: string) => string }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={formatX} minTickGap={16} />
          <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
          <Tooltip contentStyle={tooltipProps.contentStyle} labelFormatter={(v) => (formatX ? formatX(String(v)) : String(v))} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: '#ffffff', fill: s.color }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
