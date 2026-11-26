import { SAMPLE_MESSAGES } from '../data/samples.js'

const tokens = (name) => new Set(name.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').match(/[\p{L}\p{N}]+/gu) || [])

export function findDuplicate(state, owner, item) {
  const name = tokens(item.name)
  const date = Date.parse(item.deadline)
  if (!name.size || !Number.isFinite(date)) return null
  const candidates = [
    ...state.tasks.filter(t => t.owner === owner && t.status === 'approved').map(t => ({ ...t, kind: 'task', date: t.deadline })),
    ...state.meetings.filter(m => m.owner === owner || m.owner === 'everyone').map(m => ({ ...m, kind: 'meeting' })),
  ]
  let match = null
  for (const candidate of candidates) {
    const distance = Math.abs(date - Date.parse(candidate.date)) / 86400000
    if (!(distance <= 2)) continue
    const other = tokens(candidate.name)
    const similarity = [...name].filter(word => other.has(word)).length / new Set([...name, ...other]).size
    if (similarity < .6 || (match && (match.similarity > similarity ||
      (match.similarity === similarity && match.distance <= distance)))) continue
    match = { similarity, distance, kind: candidate.kind, id: candidate.id, name: candidate.name }
  }
  return match && { kind: match.kind, id: match.id, name: match.name }
}

export function findingsFor(sample, state, owner) {
  return sample.result.map(item => {
    const duplicateOf = state ? findDuplicate(state, owner, item) : null
    return { ...item, source: sample.source, from: sample.from, ...(duplicateOf && { duplicate: true, duplicateOf }) }
  })
}

export function reviewErrors(item) {
  if (item.duplicate && !item.keepDuplicate) return {}
  const hours = Number(item.hours)
  return {
    ...(!item.name.trim() && { name: 'Enter a name.' }),
    ...(!(hours > 0 && hours <= 24 && Number.isInteger(hours * 2)) && { hours: 'Enter 0.5–24h in half-hour steps.' }),
    ...(!/^\d{4}-\d{2}-\d{2}$/.test(item.deadline || '') && { deadline: 'Choose a date.' }),
  }
}

// Simulates the ILMU AI task-extraction API. In the real version this module
// would POST the message text to a server route that calls the AI with the
// API key kept in an environment variable; here the "results" are canned in
// samples.js and this module just adds realistic latency, failure modes and
// the privacy rule (the caller discards the raw text after extraction).
//
// fault modes (for testing the failure paths):
//   'none'        - everything works
//   'timeout'     - one message hangs -> "couldn't read this message"
//   'badjson'     - one message returns garbage -> retry once, then manual entry
//   'down'        - whole service unavailable -> fall back to cached demo results
export async function extractTasks(messages, faultMode = 'none', onProgress = () => {}, state, owner) {
  const results = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    onProgress(i + 1, messages.length, msg.id)
    await sleep(120 + Math.random() * 180) // simulated network latency
    const sample = SAMPLE_MESSAGES.find((s) => s.id === msg.id)
    if (!sample) {
      results.push({ messageId: msg.id, tasks: [], error: 'Unknown message' })
      continue
    }
    if (faultMode === 'timeout' && msg.id === 'm3') {
      results.push({ messageId: msg.id, tasks: [], error: 'The AI took too long to read this message.' })
      continue
    }
    if (faultMode === 'badjson' && msg.id === 'm3') {
      // retry once, still garbage -> surfaced as an error so the member can add the task by hand
      await sleep(200)
      results.push({ messageId: msg.id, tasks: [], error: 'The AI returned an unreadable answer. Retry failed.' })
      continue
    }
    results.push({ messageId: msg.id, tasks: findingsFor(sample, state, owner) })
  }
  return results
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function approveFindings(state, user, results, timestamp) {
  const reviewed = new Set(state.uploads[user.id]?.messageIds || [])
  const fresh = results.filter(result => !reviewed.has(result.messageId))
  const kept = fresh.flatMap(result => result.finalTasks ?? result.tasks)
    .filter(item => !item.duplicate || item.keepDuplicate)
  if (!fresh.length || kept.some(item => Object.keys(reviewErrors(item)).length)) return state
  const tasks = [], meetings = []
  for (const item of kept) {
    const details = { id: crypto.randomUUID(), name: item.name.trim(), hours: Number(item.hours), owner: user.id, source: item.source || 'chat' }
    if (item.isMeeting || item.duplicateOf?.kind === 'meeting') meetings.push({ ...details, date: item.deadline })
    else tasks.push({ ...details, deadline: item.deadline, progress: 0, status: 'approved', confidence: item.confidence || 'low' })
  }
  const previous = state.uploads[user.id]
  const extracted = new Map((previous?.extracted || []).map(entry => [entry.messageId, entry]))
  for (const result of fresh) extracted.set(result.messageId, { messageId: result.messageId, tasks: result.tasks, error: result.error || null })
  return {
    ...state, tasks: [...state.tasks, ...tasks], meetings: [...state.meetings, ...meetings],
    uploads: { ...state.uploads, [user.id]: {
      messageIds: [...reviewed, ...fresh.filter(result => !result.error || result.finalTasks?.length).map(result => result.messageId)],
      extracted: [...extracted.values()],
    } },
    history: [...state.history, { id: crypto.randomUUID(), when: timestamp, actor: user.name,
      action: 'Approved extracted findings', detail: tasks.length + ' tasks and ' + meetings.length + ' meetings added' }],
  }
}
