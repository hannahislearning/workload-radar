
import { cell, workloadBreakdown, todayISO } from '../lib/store.js'

import { workLabel } from '../lib/format.js'

const profiles = {
  kumar: { role: 'Supplier support', shirt: '#647ddd', hair: '#3e2930', skin: '#dfa57a' },
  june: { role: 'Team planning', shirt: '#d98471', hair: '#733f31', skin: '#f0bc90' },
  meiling: { role: 'Website support', shirt: '#9684e6', hair: '#342c43', skin: '#f0bb91' },
  hafiz: { role: 'IT support', shirt: '#5da8a0', hair: '#352a28', skin: '#b77a54' },
}
const managerProfile = { shirt: '#61765d', hair: '#272e32', skin: '#d79e76' }

function Desk() {
  return <span className="employee-desk" aria-hidden="true">
    <i className="desk-screen"/><i className="desk-keyboard"/><i className="desk-mug"/><i className="desk-notes"/>
  </span>
}

function Character({ working = false, frustrated = false }) {
  return <span className={`pixel-person${working ? ' is-working' : ''}${frustrated ? ' is-frustrated' : ''}`} aria-hidden="true">
    <i className="pixel-hair"/><i className="pixel-face"/><i className="pixel-eyes"/><i className="pixel-shirt"/><i className="pixel-feet"/>
    {frustrated && <><i className="pixel-frown"/><i className="pixel-stress"/></>}
  </span>
}

export function CharacterAvatar({ userId, frustrated = false }) {
  const profile = profiles[userId] ?? managerProfile
  return <span className="character-avatar" aria-hidden="true"
    style={{ '--shirt':profile.shirt, '--hair':profile.hair, '--skin':profile.skin }}>
    <Character frustrated={frustrated}/>
  </span>
}

function Station({ state, user, date, mode, meeting, selected, onSelect, bubble }) {
  const profile = profiles[user.id]
  const summary = cell(state, user.id, date, mode)
  const percent = summary.onLeave ? null : Math.round(summary.total / summary.limit * 100)
  const running = date === todayISO() && state.officeTimers?.[user.id]
  const activity = running && workLabel(state.tasks.find(task => task.id === running.taskId)?.name)
  const line = percent === null ? 'On leave' : summary.label + ' workload · ' + percent + '%'
  return <div className={'office-station' + (meeting ? ' meeting-station' : '') + ' zone-' + (summary.key === 'free' ? 'light' : summary.key)}>
    {bubble?.owner === user.id && <button type="button" className="office-speech" onClick={bubble.onClick}>{bubble.label}</button>}
    <button type="button" className={'employee-unit' + (selected === user.id ? ' selected' : '')}
      style={{ '--shirt':profile.shirt, '--hair':profile.hair, '--skin':profile.skin }}
      aria-label={user.name + ', ' + line + (meeting ? ', in meeting: ' + workLabel(meeting.name) : activity ? ', working on ' + activity : '')}
      onClick={() => onSelect(user)}>
      <span className="employee-tooltip"><strong>{user.name}</strong><small>{profile.role}</small><b>{line}</b>
        <span>{workloadBreakdown(state, user.id, date, mode)}</span>
        {meeting && <span>In meeting · {workLabel(meeting.name)} · {meeting.hours}h</span>}
        {activity && <span>Working on {activity}</span>}</span>
      {!meeting && <Desk />}
      <Character working={Boolean(activity)} frustrated={summary.key === 'over'}/>
      <span className="employee-name">{user.name}<i className={activity ? 'active-dot' : ''}/></span>
      <span className="employee-load">{percent === null ? 'Leave' : percent + '%'}</span>
      {meeting && <span className="employee-meeting-badge">In meeting · {meeting.hours}h</span>}
    </button>
  </div>
}

export default function OfficeFloor({ state, date, mode, selected, onSelect, bubble }) {
  const manager = state.users.find(user => user.id === 'aina')
  const staff = state.users.filter(user => profiles[user.id])
  const meetingFor = user => state.meetings.find(meeting => meeting.owner === user.id &&
    meeting.date === date && meeting.officeRoom === 'meeting')
  const attendees = staff.filter(user => meetingFor(user))
  const stationProps = { state, date, mode, selected, onSelect, bubble }
  return <div className="office-floor" aria-label="2D department floor plan">
    <div className="floor-windows" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="office-room operations-room" role="group" aria-label="Operations department">
      <div className="room-title"><span/>Operations department</div>
      <div className="room-fixtures" aria-hidden="true"><i className="office-shelf"/><i className="office-wall-print"/></div>
      <div className="room-desks">
        {staff.map(user => meetingFor(user)
          ? <div className="vacant-station" key={user.id}><Desk/><span>{user.name}’s desk</span></div>
          : <Station key={user.id} user={user} {...stationProps}/>)}
      </div>
    </div>
    <div className="office-hall" aria-hidden="true"><span className="floor-plant">✿</span><span className="floor-rug"/><span className="floor-plant">✿</span></div>
    <div className="office-shared">
      <div className="office-meeting-room" role="group" aria-label="Meeting room">
        <div className="room-title"><span/>Meeting room</div>
        <div className="meeting-layout"><div className="meeting-furniture" aria-hidden="true">
          <i className="meeting-chair"/><i className="meeting-chair"/><i className="meeting-table"/><i className="meeting-chair"/><i className="meeting-chair"/>
        </div><div className="meeting-seats">
          {attendees.map(user => <Station key={user.id} user={user} meeting={meetingFor(user)} {...stationProps}/>)}
        </div></div>
      </div>
      <div className="office-manager-room" role="group" aria-label="Manager’s office">
        <div className="room-title"><span/>Manager’s office</div>
        <div className="manager-workstation">
          <i className="office-shelf" aria-hidden="true"/>
          <div className="manager-seat" style={{ '--shirt':managerProfile.shirt, '--hair':managerProfile.hair, '--skin':managerProfile.skin }}>
            <Desk/><Character/><span className="employee-name">{manager?.name}</span>
          </div>
          <span className="floor-plant" aria-hidden="true">✿</span>
        </div>
      </div>
    </div>
  </div>
}
