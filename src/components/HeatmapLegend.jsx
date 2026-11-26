import { WORKLOAD_SHADES, LEAVE_PATTERN } from '../lib/shades.js'

export default function HeatmapLegend() {
  const bands = [
    ['Free · 0h', WORKLOAD_SHADES.slice(0, 1)], ['Light · 1–4h', WORKLOAD_SHADES.slice(1, 5)],
    ['Busy · 5–7h', WORKLOAD_SHADES.slice(5, 8)], ['Full · at capacity', WORKLOAD_SHADES.slice(8, 9)],
    ['Over · above capacity', WORKLOAD_SHADES.slice(9)], ['Leave', [LEAVE_PATTERN]],
  ]
  return <div className="legend" aria-label="Workload colors">
    {bands.map(([name, shades]) => <span key={name} className="legend-band"
      style={{ background: shades.length === 1 ? shades[0] : 'linear-gradient(90deg,' + shades.join(',') + ')' }}>{name}</span>)}
    <span className="legend-pending">Dashed outline · transfer pending</span>
  </div>
}
