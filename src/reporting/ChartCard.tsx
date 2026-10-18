import clsx from 'clsx';
import { useId, useState, type ReactNode } from 'react';
import { useCountUp } from '@/motion/useCountUp';

export type TableSpec = { columns: string[]; rows: (string | number)[][] };

/**
 * A chart with its accessible twin. The SVG is aria-hidden; the same data is always available as a
 * table — visually hidden while the chart shows (screen readers still get it), visible on toggle.
 */
export function ChartCard({
  title,
  summary,
  table,
  legend,
  children,
  className,
  empty,
}: {
  title: string;
  /** One-sentence text alternative, also shown under the title. */
  summary?: string;
  table: TableSpec;
  legend?: { label: string; color: string }[];
  children: ReactNode;
  className?: string;
  empty?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  return (
    <figure aria-labelledby={titleId} className={clsx('rounded-xl border border-gray-200 bg-white p-4', className)}>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold text-gray-900">
            {title}
          </h3>
          {summary && <p className="text-xs text-gray-500">{summary}</p>}
        </div>
        {!empty && (
          <button
            type="button"
            aria-pressed={asTable}
            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
            onClick={() => setAsTable((t) => !t)}
          >
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </div>
      {empty ? (
        <p className="py-8 text-center text-sm text-gray-500">No data yet.</p>
      ) : (
        <>
          {legend && legend.length > 1 && !asTable && (
            <ul className="mb-2 flex flex-wrap gap-3 text-xs text-gray-600" aria-hidden>
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
          {!asTable && <div aria-hidden="true">{children}</div>}
          <div className={clsx(!asTable && 'sr-only', 'overflow-x-auto')}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="text-xs text-gray-500">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={clsx('border-b border-gray-200 px-2 py-1.5 font-medium', i > 0 && 'text-right')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-gray-100 last:border-0">
                    {r.map((cell, ci) =>
                      ci === 0 ? (
                        <th key={ci} scope="row" className="px-2 py-1.5 font-normal">
                          {cell}
                        </th>
                      ) : (
                        <td key={ci} className="px-2 py-1.5 text-right">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </figure>
  );
}

/** Stat tile (e2e: role=group named exactly by its label, containing the number). */
function CountUp({ value }: { value: number }) {
  // Counts up only when the value changes (first render shows the final number; reduced motion
  // jumps straight to it), so the tile's text is always exactly one number at rest.
  const shown = useCountUp(value);
  return <span>{Math.round(shown).toLocaleString()}</span>;
}

export function KpiTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'bad' }) {
  return (
    <div role="group" aria-label={label} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={clsx('mt-1 text-2xl font-semibold', tone === 'bad' ? 'text-red-700' : 'text-gray-900')}>
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}
