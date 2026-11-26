

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
