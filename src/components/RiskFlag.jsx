import { shortDate } from '../lib/format.js'

export default function RiskFlag({ risk, deadline }) {
  if (!risk?.atRisk) return null
  return <span className="risk-flag">{risk.overdue ? 'Overdue · ' + risk.remaining + 'h left'
    : 'At risk · ' + risk.remaining + 'h left, ' + risk.free + 'h available by ' + shortDate(deadline)}</span>
}
