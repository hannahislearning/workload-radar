export const WORKLOAD_SHADES = [
  '#f4f6f4', '#edf3ed', '#e5efe4', '#ddebdc', '#d4e6d4',
  '#eeddb5', '#ebd29f', '#e7bf85', '#e3ae77',
  '#e7a598', '#df968b', '#d88780', '#cf7874',
]
export const LEAVE_SHADE = '#e9e8ee'
export const LEAVE_PATTERN = 'repeating-linear-gradient(135deg,#e9e8ee 0 7px,#dcdbe4 7px 9px)'

export function cellShade(summary) {
  if (summary.onLeave) return summary.work ? WORKLOAD_SHADES[9] : LEAVE_SHADE
  const { total } = summary
  const step = total > 7 && total < 8 ? 7 : Math.ceil(total)
  return WORKLOAD_SHADES[Math.min(12, step)]
}
