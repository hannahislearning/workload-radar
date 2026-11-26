// Sample data for the demo. No real inboxes — everything is fake company data.
// The "AI" extractor returns canned results keyed by message id (simulating a
// cached API call). Raw message text is never stored in the app state: it is
// processed and discarded, matching the privacy rule in the brief.

export const USERS = [
  { id: 'aina', name: 'Ms Aina', role: 'manager' },
  { id: 'kumar', name: 'Kumar', role: 'member' },
  { id: 'meiling', name: 'Mei Ling', role: 'member' },
  { id: 'hafiz', name: 'Hafiz', role: 'member' },
  { id: 'june', name: 'June', role: 'member' },
]

// The demo is anchored to this week so the heatmap is always populated.
// "Today" in the demo = the Monday of this anchor week.
export const DEMO_TODAY = '2026-11-23' // Monday

// Project plan Ms Aina uploads. Tasks are pre-approved by her (manager approval).
export const PLAN_TASKS = [
  { id: 'plan-1', name: 'Vendor report', owner: 'kumar', hours: 3, deadline: '2026-11-25', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
  { id: 'plan-2', name: 'Tender docs', owner: 'kumar', hours: 2, deadline: '2026-11-27', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
  { id: 'plan-3', name: 'Client website fixes', owner: 'meiling', hours: 4, scheduledDate: '2026-11-25', deadline: '2026-11-26', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
  { id: 'plan-4', name: 'Database migration', owner: 'hafiz', hours: 5, deadline: '2026-11-27', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
  { id: 'plan-5', name: 'Sprint planning deck', owner: 'june', hours: 2, deadline: '2026-11-26', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
  // due TODAY so the demo can exercise progress logging on the Today tab
  { id: 'plan-6', name: 'Weekly status report', owner: 'kumar', hours: 1, deadline: '2026-11-23', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
  { id: 'plan-7', name: 'Inventory checklist', owner: 'hafiz', hours: 1, deadline: '2026-11-23', source: 'plan', status: 'approved', progress: 0, confidence: 'high' },
]

export const APPROVED_DEMO_TASKS = [
  { id: 'demo-tender', name: 'Tender brief', owner: 'kumar', hours: 6, deadline: DEMO_TODAY, source: 'email', status: 'approved', progress: 0, skill: 'vendor' },
  { id: 'demo-vendor', name: 'Vendor handover', owner: 'meiling', hours: 2, deadline: '2026-11-20', source: 'plan', status: 'approved', progress: 100, skill: 'vendor' },
]

export const PLAN_MEETINGS = [
  { id: 'mtg-kickoff', name: 'Supplier kickoff', owner: 'kumar', date: DEMO_TODAY, hours: 2 },
  { id: 'mtg-1', name: 'Client demo call', owner: 'kumar', date: '2026-11-25', hours: 2 },
  { id: 'mtg-2', name: 'Team standup', owner: 'everyone', date: '2026-11-24', hours: 1 },
]

export const LEAVE = [
  { id: 'leave-1', owner: 'june', start: '2026-11-26', end: '2026-11-27', name: 'Annual leave' },
]

// 20 sample messages. Each carries a canned "AI result" (what the extractor
// returns) plus a `truth` field used by the accuracy check in the dashboard.
// confidence 'low' => flagged for review. needsDate => vague date, goes to
// "needs confirmation" instead of the heatmap.
export const SAMPLE_MESSAGES = [
  {
    id: 'm1', source: 'whatsapp', from: 'Manager (Puan Lim)',
    text: 'Kumar, can you send the vendor report by Wed? It should take you about 3 hours.',
    result: [{ name: 'Vendor report (chat request)', hours: 3, deadline: '2026-11-25', confidence: 'high' }],
    truth: { name: 'Vendor report (chat request)', hours: 3, deadline: '2026-11-25' },
  },
  {
    id: 'm2', source: 'email', from: 'Client (Siti, Apex Sdn Bhd)',
    text: 'Please fix the contact form and the pricing page on our website by Thursday. Estimate 4 hours.',
    result: [{ name: 'Client website fixes (email)', hours: 4, deadline: '2026-11-26', confidence: 'high' }],
    truth: { name: 'Client website fixes (email)', hours: 4, deadline: '2026-11-26' },
  },
  {
    id: 'm3', source: 'email', from: 'Client legal',
    text: 'We need the contract amendments reviewed before Friday, around 2 hours of work.',
    result: [{ name: 'Review contract amendments', hours: 2, deadline: '2026-11-27', confidence: 'high' }],
    truth: { name: 'Review contract amendments', hours: 2, deadline: '2026-11-27' },
  },
  {
    id: 'm4', source: 'whatsapp', from: 'Colleague (Mei Ling)',
    text: 'Kumar can you check the invoice with the vendor? Due Friday I think, maybe 1 hour?',
    result: [{ name: 'Check vendor invoice', hours: 1, deadline: '2026-11-27', confidence: 'low' }],
    truth: { name: 'Check vendor invoice', hours: 1, deadline: '2026-11-27' },
  },
  {
    id: 'm5', source: 'whatsapp', from: 'Manager (Puan Lim)',
    text: 'The tender docs — can you have them ready by next Friday?',
    // Deliberate AI mistake: "next Friday" misread as THIS Friday. Kumar fixes it in review.
    result: [{ name: 'Tender docs (chat request)', hours: 2, deadline: '2026-11-27', confidence: 'medium' }],
    truth: { name: 'Tender docs (chat request)', hours: 2, deadline: '2026-12-04' },
  },
  {
    id: 'm6', source: 'email', from: 'HR',
    text: 'Reminder: office closed for Deepavali cleanup this Saturday. No tasks needed, FYI only.',
    result: [],
    truth: null, // no task — correct behaviour is to extract nothing
  },
  {
    id: 'm7', source: 'whatsapp', from: 'Colleague (Hafiz)',
    text: 'Bro, help me look at the migration script esok? Around 2 hours lah.',
    // "esok" (tomorrow in Malay) is vague/mixed language -> needs confirmation
    result: [{ name: 'Review migration script', hours: 2, deadline: null, confidence: 'low', needsDate: true }],
    truth: { name: 'Review migration script', hours: 2, deadline: 'confirm' },
  },
  {
    id: 'm8', source: 'email', from: 'Newsletter',
    text: 'Tech Weekly: 10 JavaScript tips you should know. Unsubscribe here.',
    result: [],
    truth: null,
  },
  {
    id: 'm9', source: 'whatsapp', from: 'Manager (Puan Lim)',
    text: 'Mei Ling, the client wants the website mockups updated by Wednesday, about 2 hours.',
    result: [{ name: 'Update website mockups', hours: 2, deadline: '2026-11-25', confidence: 'high' }],
    truth: { name: 'Update website mockups', hours: 2, deadline: '2026-11-25' },
  },
  {
    id: 'm10', source: 'email', from: 'Vendor (MegaTech)',
    text: 'Quotation attached for the new laptops. No action required unless you wish to proceed.',
    result: [],
    truth: null,
  },
  {
    id: 'm11', source: 'whatsapp', from: 'Manager (Puan Lim)',
    text: 'Hafiz, prepare the server backup plan by Friday. Should be 3 hours of work.',
    result: [{ name: 'Server backup plan', hours: 3, deadline: '2026-11-27', confidence: 'high' }],
    truth: { name: 'Server backup plan', hours: 3, deadline: '2026-11-27' },
  },
  {
    id: 'm12', source: 'whatsapp', from: 'Colleague (June)',
    text: 'Kumar, we are having a client demo call this Wednesday 2pm, please join. Roughly 2 hours including prep.',
    result: [{ name: 'Client demo call (chat)', hours: 2, deadline: '2026-11-25', confidence: 'medium' }],
    truth: { name: 'Client demo call (chat)', hours: 2, deadline: '2026-11-25' },
  },
  {
    id: 'm13', source: 'email', from: 'Client (Siti, Apex Sdn Bhd)',
    text: 'One more thing: send us the updated sitemap by next week. Around 1 hour.',
    // "next week" vague -> needs confirmation
    result: [{ name: 'Send updated sitemap', hours: 1, deadline: null, confidence: 'low', needsDate: true }],
    truth: { name: 'Send updated sitemap', hours: 1, deadline: 'confirm' },
  },
  {
    id: 'm14', source: 'whatsapp', from: 'Manager (Puan Lim)',
    text: 'June, the sprint planning deck needs your final pass by Thursday, 1.5 hours.',
    result: [{ name: 'Sprint deck final pass', hours: 1.5, deadline: '2026-11-26', confidence: 'high' }],
    truth: { name: 'Sprint deck final pass', hours: 1.5, deadline: '2026-11-26' },
  },
  {
    id: 'm15', source: 'email', from: 'Accounts',
    text: 'Please submit your November expense claims by end of month. Takes about 30 minutes.',
    result: [{ name: 'Submit expense claims', hours: 0.5, deadline: '2026-11-30', confidence: 'high' }],
    truth: { name: 'Submit expense claims', hours: 0.5, deadline: '2026-11-30' },
  },
  {
    id: 'm16', source: 'whatsapp', from: 'Unknown number',
    text: 'Congratulations! You have won a free holiday. Click here to claim.',
    result: [],
    truth: null,
  },
  {
    id: 'm17', source: 'email', from: 'Client legal',
    text: 'Urgent: the signed NDA must reach us by Wednesday morning. Allow 1 hour to prepare.',
    result: [{ name: 'Prepare signed NDA', hours: 1, deadline: '2026-11-25', confidence: 'high' }],
    truth: { name: 'Prepare signed NDA', hours: 1, deadline: '2026-11-25' },
  },
  {
    id: 'm18', source: 'whatsapp', from: 'Manager (Puan Lim)',
    text: 'Mei Ling, please draft the monthly client newsletter by Thursday, about 1.5 hours.',
    result: [{ name: 'Draft client newsletter', hours: 1.5, deadline: '2026-11-26', confidence: 'high' }],
    truth: { name: 'Draft client newsletter', hours: 1.5, deadline: '2026-11-26' },
  },
  {
    id: 'm19', source: 'whatsapp', from: 'Colleague (Hafiz)',
    text: 'The vendor report and tender docs both need the latest numbers from Kumar before Friday.',
    // Duplicate risk: mentions tasks already in the plan. Extractor matches and
    // returns an empty diff with a "possible duplicate" note instead of a new task.
    result: [{ name: 'POSSIBLE_DUPLICATE: Vendor report / Tender docs already in the plan', duplicate: true }],
    truth: { duplicate: true },
  },
  {
    id: 'm20', source: 'email', from: 'Director office',
    text: 'All staff: quarterly town hall next Tuesday 10am, 1 hour. Attendance required.',
    result: [{ name: 'Quarterly town hall (meeting)', hours: 1, deadline: '2026-12-01', confidence: 'high', isMeeting: true }],
    truth: { name: 'Quarterly town hall (meeting)', hours: 1, deadline: '2026-12-01', isMeeting: true },
  },
]

// Per-person upload bundles for the demo: Kumar uploads his own messages,
// Mei Ling and Hafiz upload theirs. Members only ever see their own bundle.
export const MEMBER_UPLOADS = {
  kumar: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm12', 'm13', 'm16', 'm19'],
  meiling: ['m9', 'm10', 'm13', 'm15', 'm18'],
  hafiz: ['m11', 'm7', 'm16'],
  june: ['m14', 'm8', 'm6'],
}
