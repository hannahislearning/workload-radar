import { useState } from 'react'
import { useAppStore } from './lib/store.js'
import { useDigestDelivery } from './lib/digests.js'
import { initials } from './lib/format.js'
import Studio from './Studio.jsx'
import Banner from './components/Banner.jsx'
import HeatmapTab from './screens/HeatmapScreen.jsx'
import DashboardTab from './screens/Dashboard.jsx'
import HistoryTab from './screens/History.jsx'
import ProjectPlan from './screens/Plan.jsx'
import TodayTab from './screens/TaskBoard.jsx'
import Inbox from './screens/Inbox.jsx'
import RequestsTab from './screens/Requests.jsx'
import { DigestInbox } from './Digests.jsx'

export default function App() {
  const [state, update, reset] = useAppStore()
  const [selectedTab, setTab] = useState(null)
  const [studioDay, setStudioDay] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  useDigestDelivery(update)
  const me = state.users.find((u) => u.id === state.currentUserId)
  const isManager = me.role === 'manager'
  const tab = selectedTab || (isManager ? 'heatmap' : 'today')
  const pending = state.moveRequests.some((r) => r.toUserId === me.id && r.state === 'pending')

  const [dashboardView, setDashboardView] = useState('results')
  const [heatFocus, setHeatFocus] = useState(null)
  const tabs = isManager
    ? [['heatmap', 'Heatmap'], ['dashboard', 'Dashboard'], ['channels', 'Inbox'], ['plan', 'Plan'], ['studio', 'Studio']]
    : [['today', 'Task board'], ['heatmap', 'Heatmap'], ['channels', 'Inbox'], ['requests', 'Requests'], ['studio', 'Studio']]


  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => { setStudioDay(null); setTab('studio') }}>
          <span className="brand-mark" aria-hidden="true"><i /></span><span>WorkLoad <strong>Radar</strong></span>
        </button>
        <div className="switcher">
          <span className="member-avatar" aria-hidden="true">{initials(me.name)}</span><label htmlFor="user" className="visually-hidden">Demo user</label>
          <select id="user" value={state.currentUserId}
            onChange={(e) => {
              const userId = e.target.value
              setTab(null)
              setStudioDay(null)
              setHeatFocus(null)
              setDashboardView('results')
              update((s) => ({ ...s, currentUserId: userId, movePicker: null }))
            }}>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>

        </div>
      <nav className="tabs"  aria-label="Main navigation">
        {tabs.map(([key, label]) => (
          <button key={key} className={'tab' + (tab === key ? ' active' : '')}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => { setStudioDay(null); setHeatFocus(null); setTab(key) }}>{label}{key === 'requests' && pending && <span className="notification-dot" aria-label="Pending requests" />}</button>
        ))}
      </nav>
      </header>

      <main>
        {tab !== 'today' && tab !== 'studio' && <Banner state={state} />}
        {tab === 'studio' && <Studio state={state} isManager={isManager}
          openChannels={() => setTab('channels')} openDigest={() => { setDashboardView('digests'); setTab('dashboard') }}
          onDay={(user, date) => { setStudioDay({ user, date }); setTab('heatmap') }} />}
        {tab === 'heatmap' && <HeatmapTab state={state} update={update} me={me} initialDay={studioDay} focus={heatFocus} />}
        {tab === 'channels' && <Inbox state={state} update={update} me={me} />}
        {tab === 'dashboard' && isManager && <>
          <nav className="tabs" aria-label="Dashboard sections">{[['results','Results'],['history','Change history'],['digests','Admin digests']].map(([key,label]) =>
            <button className={'tab' + (dashboardView === key ? ' active' : '')} key={key} aria-pressed={dashboardView === key} onClick={()=>setDashboardView(key)}>{label}</button>)}</nav>
          {dashboardView === 'results' && <DashboardTab state={state} onInspect={(focus) => { setStudioDay(null);setHeatFocus(focus);setTab('heatmap') }} />}
          {dashboardView === 'history' && <HistoryTab state={state} />}
          {dashboardView === 'digests' && <DigestInbox state={state} update={update} />}
        </>}
        {tab === 'plan' && isManager && <ProjectPlan users={state.users} onFinish={() => setTab('heatmap')} />}
        {tab === 'today' && !isManager && <TodayTab state={state} update={update} me={me} />}
        {tab === 'requests' && !isManager && <RequestsTab state={state} update={update} me={me} />}
      </main>
      <footer className="workspace-footer"><span>WorkLoad Radar · Demo workspace</span>
        <div>{confirmReset && <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>}
          <button type="button" onClick={() => {
            if (!confirmReset) { setConfirmReset(true); return }
            reset(); setTab(null); setStudioDay(null); setConfirmReset(false)
          }}>{confirmReset ? 'Confirm reset' : 'Reset demo'}</button></div>
      </footer>
    </div>
  )
}
