// กราฟแท่ง (SVG เขียนเอง ไม่ใช้ library) สำหรับหน้าภาพรวม
//   - ข้อมูลชุดเดียว → สีเดียว (สีหลักของเว็บ) · แท่งกว้างไม่เกิน 24px ปลายมน 4px ฐานเหลี่ยม · ระหว่างแท่งเว้นอย่างน้อย 2px
//   - เส้นกริดบาง 1px สีจาง · แกน Y เป็นเลขกลม (0, 500, 1K …) · ป้ายค่าเฉพาะแท่งที่สูงที่สุด (ไม่ใส่ทุกแท่ง)
//   - ชี้/แตะแท่งเพื่อดูค่า (พื้นที่รับเมาส์กว้างเต็มช่อง) · โฟกัสกราฟแล้วกดลูกศรซ้าย/ขวาได้
//   - ทุกค่าดูเป็นตารางได้ (ChartCard) — tooltip เป็นตัวเสริม ไม่ใช่ทางเดียวที่เห็นค่า
import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { card } from './adminUi.jsx';

const PLOT_HEIGHT = 180;
const MARGIN = { top: 22, right: 8, bottom: 26, left: 44 };
const COLORS = { bar: '#3b66f6', barActive: '#93b4ff', grid: '#e2e8f0', baseline: '#cbd5e1', ink: '#64748b', label: '#334155' };

// ขีดบนแกน Y: ระยะห่างเป็น 1, 2, 2.5, 5 × 10ⁿ → ได้เลขกลมอ่านง่าย (เช่น 0 / 500 / 1,000 / 1,500)
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough);
  const ticks = [0];
  while (ticks[ticks.length - 1] < max) ticks.push(Math.round(ticks.length * step * 1e6) / 1e6); // ขีดบนสุด ≥ ค่าสูงสุดเสมอ
  return ticks;
}

// แท่งที่ปลายบนมน ฐานเหลี่ยม (ยืนบนเส้นฐาน)
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// data: [{ key, label (ใต้แกน), title (หัว tooltip), value, detail? (บรรทัดรองใน tooltip) }]
export default function BarChart({ data, formatValue, formatTick, maxValue, ariaLabel, emptyText }) {
  const { tx } = useLanguage();
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState(null);

  const values = data.map((d) => d.value);
  const peak = Math.max(0, ...values);
  const ticks = niceTicks(maxValue ?? peak);
  const top = ticks[ticks.length - 1] || 1;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const band = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(1, Math.min(24, band - 2, band * 0.7));
  const y = (value) => MARGIN.top + PLOT_HEIGHT - (Math.min(value, top) / top) * PLOT_HEIGHT;
  const centerX = (i) => MARGIN.left + band * i + band / 2;
  // ป้ายวันที่ใต้แกน: เว้นช่วงให้ไม่ชนกัน (ประมาณ 1 ป้าย ต่อ 56px) นับถอยจากวันล่าสุด
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotWidth / 56))));
  const peakIndex = peak > 0 ? values.lastIndexOf(peak) : -1;
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;
  const current = active === null ? null : data[active];

  const onKeyDown = (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (!(event.key in moves) || !data.length) return;
    event.preventDefault();
    const start = active ?? data.length - 1;
    setActive(Math.min(data.length - 1, Math.max(0, start + moves[event.key])));
  };

  return (
    <div
      ref={wrapRef}
      className="relative outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-brand-500"
      tabIndex={0}
      role="group"
      aria-label={`${ariaLabel} — ${tx('กดลูกศรซ้าย/ขวาเพื่อดูค่าแต่ละวัน', 'use left/right arrows to read each day')}`}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((value) => value ?? data.length - 1)}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block select-none" aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? COLORS.baseline : COLORS.grid} strokeWidth="1" shapeRendering="crispEdges" />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="11" fill={COLORS.ink} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const barHeight = MARGIN.top + PLOT_HEIGHT - y(d.value);
            const x = centerX(i) - barWidth / 2;
            const showLabel = (data.length - 1 - i) % labelEvery === 0;
            const cx = centerX(i);
            const anchor = cx < MARGIN.left + 22 ? 'start' : cx > width - 22 ? 'end' : 'middle';
            const labelX = anchor === 'start' ? x : anchor === 'end' ? x + barWidth : cx;
            return (
              <g key={d.key}>
                {barHeight > 0 && (
                  <path d={barPath(x, y(d.value), barWidth, barHeight, 4)} fill={active === i ? COLORS.barActive : COLORS.bar} />
                )}
                {showLabel && (
                  <text x={labelX} y={height - 8} textAnchor={anchor} fontSize="11" fill={COLORS.ink}>
                    {d.label}
                  </text>
                )}
                {i === peakIndex && (
                  <text x={labelX} y={y(d.value) - 6} textAnchor={anchor} fontSize="11" fontWeight="700" fill={COLORS.label}>
                    {formatTick(d.value)}
                  </text>
                )}
                {/* พื้นที่รับเมาส์ = ทั้งช่องสูงเต็มกราฟ (ใหญ่กว่าแท่ง เล็งง่าย) */}
                <rect x={MARGIN.left + band * i} y={MARGIN.top} width={band} height={PLOT_HEIGHT} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
              </g>
            );
          })}
        </svg>
      )}

      {peak === 0 && emptyText && (
        <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-sm text-slate-400">{emptyText}</p>
      )}

      {current && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: Math.min(Math.max(centerX(active), 70), width - 70),
            top: y(current.value) - 10,
          }}
        >
          <p className="text-sm font-bold">{formatValue(current.value)}</p>
          <p className="text-slate-300">{current.title}</p>
          {current.detail && <p className="text-slate-300">{current.detail}</p>}
        </div>
      )}
    </div>
  );
}

// กรอบกราฟ: หัวข้อ + ปุ่มสลับ "กราฟ / ตาราง" (ตาราง = ทางเลือกที่อ่านค่าได้ครบโดยไม่ต้องชี้เมาส์)
export function ChartCard({ title, subtitle, rows, valueLabel, children, className = '' }) {
  const { tx } = useLanguage();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`${card} p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Icon name={asTable ? 'chart' : 'table'} className="h-3.5 w-3.5" />
          {asTable ? tx('กราฟ', 'Chart') : tx('ตาราง', 'Table')}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-[226px] overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold text-slate-500">
              <tr>
                <th className="px-3 py-2">{tx('วันที่', 'Date')}</th>
                <th className="px-3 py-2 text-right">{valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-1.5 text-slate-600">{row.title}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}
