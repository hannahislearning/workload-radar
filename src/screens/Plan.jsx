import { useState } from 'react'
import { PLAN_TASKS, PLAN_MEETINGS } from '../data/samples.js'
import { shortDate } from '../lib/format.js'

export default function ProjectPlan({ users, onFinish }) {
  const [opened, setOpened] = useState(false)
  return <section>
    <div className="section-heading"><h1>Project plan</h1><p>Review the demo plan’s assignments, due dates and calendar commitments.</p></div>
    {!opened ? <button className="btn primary" onClick={() => setOpened(true)}>Load demo plan</button> : <>
      <div className="heatmap-scroll"><table className="plan-review">
        <thead><tr><th>Task</th><th>Assignee</th><th>Deadline</th><th>Estimate</th></tr></thead>
        <tbody>{PLAN_TASKS.map((task) => <tr key={task.id}><td>{task.name}</td>
          <td>{users.find((user) => user.id === task.owner)?.name}</td>
          <td>{shortDate(task.deadline)}</td><td>{task.hours}h</td></tr>)}</tbody>
      </table></div>
      <h3>Meetings</h3>
      <ul>{PLAN_MEETINGS.map((meeting) => <li key={meeting.id}>{meeting.name} · {shortDate(meeting.date)} · {meeting.hours}h</li>)}</ul>
      <button className="btn primary" onClick={onFinish}>View plan on heatmap</button>
    </>}
  </section>
}
