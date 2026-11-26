

export function shortDate(iso) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'))
}

export function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

export function candidateDetail(candidate) {
  return [
    candidate.free + 'h free on work date',
    candidate.skillMatch ? candidate.skill + ' skill match' : null,
    candidate.experience ? candidate.experience + ' similar past tasks' : null,
    candidate.recentOverload + ' overload days in the prior week',
  ].filter(Boolean).join(' · ')
}

const workLabels = new Map([
  ['Vendor report', 'Supplier report'],
  ['Tender docs', 'Supplier quote paperwork'],
  ['Tender brief', 'Prepare a supplier quote'],
  ['Database migration', 'Move records to the new system'],
  ['Sprint planning deck', 'Prepare slides for team planning'],
  ['Vendor handover', 'Hand over supplier work'],
  ['Supplier kickoff', 'First meeting with the supplier'],
  ['Client demo call', 'Show the work to the client'],
  ['Team standup', 'Team check-in'],
  ['Delivery planning', 'Team planning meeting'],
  ['Review contract amendments', 'Review changes to the contract'],
  ['Check vendor invoice', 'Check the supplier invoice'],
])

export function workLabel(name) {
  return workLabels.get(name) ?? name
}
