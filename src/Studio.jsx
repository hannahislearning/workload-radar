
import { useEffect, useRef, useState } from 'react'
import { cell, taskDay, taskRemaining, todayISO, startOfWeek, weekDates, round1 } from './lib/store.js'

const profiles = {
  kumar: { team: 'Delivery', role: 'Vendor operations', color: '#c87556', motion: 'Reviews a clipboard' },
  june: { team: 'Delivery', role: 'Project planning', color: '#578777', motion: 'Waves a hand' },
  meiling: { team: 'Product', role: 'Web and design', color: '#817eb9', motion: 'Taps at a workstation' },
  hafiz: { team: 'Product', role: 'Systems engineering', color: '#4d7ea7', motion: 'Bobs with headphones' },
}
const spots = [[-2.3,-1.7],[2,-1.7],[-2.3,1.6],[2,1.6]]
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

function paintOffice(ctx, width, height, angle, time, people, active, state) {
  const scale = Math.min(width / 13.8, height / 8.1)
  const sin = Math.sin(angle), cos = Math.cos(angle)
  const depth = (x,z) => x*sin+z*cos
  const project = ([x,y,z]) => [width*.5 + (x*cos-z*sin)*scale, height*.57+(depth(x,z)*.49-y)*scale]
  const polygon = (points, color) => {
    ctx.beginPath()
    points.map(project).forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y))
    ctx.closePath(); ctx.fillStyle=color; ctx.fill()
  }
  const box = (x,y,z,w,h,d,colors) => {
    const a=[x,y,z], b=[x+w,y,z], c=[x+w,y,z+d], e=[x,y,z+d]
    const top = (p) => [p[0],p[1]+h,p[2]]
    const sides=[[a,b],[b,c],[c,e],[e,a]].map(([p,q],i)=>({p,q,i}))
      .sort((l,r)=>depth(l.p[0]+l.q[0],l.p[2]+l.q[2])-depth(r.p[0]+r.q[0],r.p[2]+r.q[2]))
    sides.slice(2).forEach(({p,q,i}) => polygon([p,q,top(q),top(p)], colors[1+i%2]))
    polygon([a,b,c,e].map(top),colors[0])
  }
  const ellipse = (x,y,rx,ry,color,rotation=0) => {
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()
  }
  ctx.clearRect(0,0,width,height)
  box(-5,-.25,-3.8,10,.25,7.6,['#f5f2e8','#d5d5ca','#e5e1d6'])
  for (let n=-4;n<=4;n+=2) polygon([[n,0,-3.7],[n+.014,0,-3.7],[n+.014,0,3.7],[n,0,3.7]],'#e8e4d8')
  const targets=[]
  const objects=[]
  for (let i=0;i<people.length;i++) {
    const person=people[i], [x,z]=spots[i], profile=profiles[person.id]
    const shade=cellShade(cell(state,person.id,todayISO(),'all'))
    polygon([[x-1.35,.003,z-.9],[x+1.35,.003,z-.9],[x+1.35,.003,z+1.05],[x-1.35,.003,z+1.05]],shade)
    objects.push({depth:depth(x,z-.35),draw:()=>{
      box(x-1.05,.05,z-.73,2.1,.69,.67,['#ece6da','#c9bfb0','#d8cebd'])
      box(x-.36,.74,z-.55,.72,.47,.14,['#738b88','#53706e','#6a8480'])
      box(x-.25,.74,z-.26,.5,.045,.22,['#c0cbc7','#a1b2af','#acbdb9'])
    }})
    objects.push({depth:depth(x,z+.49),draw:()=>{
      const pulse=Math.sin(time*(i+2)+i)
      const lift=person.id==='hafiz' ? Math.max(0,pulse)*.19 : pulse*.065
      const [px,py]=project([x,.68+lift,z+.49]), r=scale*.35
      const [sx,sy]=project([x,.02,z+.49])
      ellipse(sx,sy,r*1.22,r*.32,'#31423b28')
      if (person.id===active) ellipse(sx,sy,r*1.38,r*.49,'#1d675946')
      ellipse(px-r*.42,py+r*1.31,r*.38,r*.25,profile.color)
      ellipse(px+r*.42,py+r*1.31,r*.38,r*.25,profile.color)
      const body=ctx.createRadialGradient(px-r*.35,py-r*.45,1,px,py,r*1.4)
      body.addColorStop(0,'#ffffff');body.addColorStop(.85,profile.color)
      ellipse(px,py+r*.36,r*.91,r*1.13,body)
      const tilt=person.id==='kumar'?pulse*.12:0
      ellipse(px,py-r*.38,r*1.02,r*.83,profile.color,tilt)
      const arm=person.id==='june' ? -.55+pulse*.56 : person.id==='meiling' ? .48+pulse*.18 : .36
      ellipse(px+r*.88,py+r*.2,r*.23,r*.48,profile.color,arm)
      ellipse(px-r*.85,py+r*.2,r*.22,r*.4,profile.color,.35)
      for (const offset of [-.33,.33]) ellipse(px+r*offset,py-r*.42,r*.085,r*.115,'#213a36')
      if (person.id==='kumar') {
        ctx.save();ctx.translate(px+r*.72,py+r*.5);ctx.rotate(pulse*.16)
        ctx.fillStyle='#f7edd9';ctx.fillRect(-r*.28,-r*.33,r*.56,r*.62);ctx.restore()
      }
      if (person.id==='hafiz') for (const side of [-1,1]) ellipse(px+side*r*.92,py-r*.35,r*.17,r*.32,'#294658')
      ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle'
      const labelY=py-r*1.62, labelW=ctx.measureText(person.name).width+19
      ctx.fillStyle=person.id===active?'#244e43':'#fffdf6'
      ctx.beginPath();ctx.roundRect(px-labelW/2,labelY-11,labelW,22,11);ctx.fill()
      ctx.fillStyle=person.id===active?'#fff':'#263b34';ctx.fillText(person.name,px,labelY)
      targets.push({id:person.id,x:px,y:py,r:r*1.7,labelY})
    }})
  }
  for (const [x,z] of [[-4.5,2.9],[4.3,-3]]) objects.push({depth:depth(x,z),draw:()=>{
    box(x-.25,0,z-.25,.5,.32,.5,['#e4ccac','#b7926c','#ceac86'])
    const [px,py]=project([x,.68,z]); ellipse(px,py,scale*.23,scale*.39,'#6b946f',-.27)
    ellipse(px+scale*.18,py-scale*.11,scale*.21,scale*.36,'#91af76',.43)
  }})
  objects.sort((a,b)=>a.depth-b.depth).forEach((item)=>item.draw())
  return targets
}

function Office({ people, state, active, select }) {
  const canvas=useRef(null), hits=useRef([]), gesture=useRef(null)
  const [angle,setAngle]=useState(.6)
  const [animate,setAnimate]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(()=>{
    const el=canvas.current, ctx=el.getContext('2d')
    let frame
    const draw=(ms)=>{
      const ratio=Math.min(window.devicePixelRatio||1,2), width=el.clientWidth, height=el.clientHeight
      if(el.width!==Math.round(width*ratio)||el.height!==Math.round(height*ratio)){
        el.width=Math.round(width*ratio);el.height=Math.round(height*ratio)
      }
      ctx.setTransform(ratio,0,0,ratio,0,0)
      hits.current=paintOffice(ctx,width,height,angle,animate?ms/1000:0,people,active,state)
      if(animate) frame=requestAnimationFrame(draw)
    }
    const observer=new ResizeObserver(()=>{if(!animate)draw(0)})
    observer.observe(el);frame=requestAnimationFrame(draw)
    return ()=>{observer.disconnect();cancelAnimationFrame(frame)}
  },[people,state,active,angle,animate])
  return <div className="studio-stage">
    <canvas ref={canvas} aria-label="Interactive 3D office. Use the teammate buttons to select a person."
      onPointerDown={e=>{gesture.current={x:e.clientX, angle};e.currentTarget.setPointerCapture(e.pointerId)}}
      onPointerMove={e=>{if(gesture.current && Math.abs(e.clientX-gesture.current.x)>4) setAngle(gesture.current.angle+(e.clientX-gesture.current.x)*.008)}}
      onPointerCancel={()=>{gesture.current=null}}
      onPointerUp={e=>{
        if(gesture.current&&Math.abs(e.clientX-gesture.current.x)<=4){
          const rect=e.currentTarget.getBoundingClientRect(), x=e.clientX-rect.left, y=e.clientY-rect.top
          const hit=[...hits.current].reverse().find(h=>Math.hypot(x-h.x,y-h.y)<h.r||Math.abs(x-h.x)<34&&Math.abs(y-h.labelY)<12)
          if(hit) select(hit.id)
        }
        gesture.current=null
      }} />
    <div className="studio-orbit"><button className="btn ghost" onClick={()=>setAngle(a=>a-.45)} aria-label="Rotate office left">↶</button><button className="btn ghost" onClick={()=>setAngle(a=>a+.45)} aria-label="Rotate office right">↷</button><button className="btn ghost" onClick={()=>setAnimate(a=>!a)}>{animate?'Pause motion':'Play motion'}</button></div>
  </div>
}

export default function Studio({ state, onDay, openChannels, openDigest, isManager }) {
  const [team,setTeam]=useState('All departments'),[chosen,select]=useState('kumar')
  const people=state.users.filter(u=>profiles[u.id]&&(team==='All departments'||profiles[u.id].team===team))
    .sort((a,b)=>profiles[a.id].team.localeCompare(profiles[b.id].team))
  const person=people.find(u=>u.id===chosen)||people[0]
  const profile=profiles[person.id], day=todayISO()
  const tasks=state.tasks.filter(t=>t.owner===person.id&&t.status==='approved'&&taskRemaining(t)>0)
    .sort((a,b)=>a.deadline.localeCompare(b.deadline))
  const format=(date)=>new Date(date+'T12:00').toLocaleDateString('en-GB',{weekday:'short'})
  return <section className="studio-shell">
    <div className="studio-heading"><div><h1>Department studio</h1><p>Explore the team’s workload by person and day.</p></div>
      <label>Department <select value={team} onChange={e=>setTeam(e.target.value)}>
        {['All departments','Delivery','Product'].map(t=><option key={t}>{t}</option>)}
      </select></label></div>
    <div className="studio-layout"><div>
      <Office people={people} state={state} active={person.id} select={select}/>
      <div className="studio-roster">{people.map(u=><button key={u.id} className="btn ghost" aria-pressed={person.id===u.id} onClick={()=>select(u.id)}><i style={{background:profiles[u.id].color}}/>{u.name}</button>)}</div>
      <div className="studio-heat">{weekDates(startOfWeek(day)).slice(0,5).map(date=>{
        const workload=cell(state,person.id,date,'all')
        return <button key={date} style={{background:workload.key==='leave'?LEAVE_PATTERN:cellShade(workload)}} onClick={()=>onDay(person,date)}><span>{format(date)}</span><strong>{workload.total}h</strong><small>{workload.label}</small></button>
      })}</div>
    </div><aside className="studio-profile">
      <small>{profile.team} · {profile.role}</small><h2>{person.name}</h2>
      <p>{cell(state,person.id,day,'all').total}h committed on the demo day</p>
      <h3>Open work</h3>
      {tasks.length?<ul>{tasks.slice(0,5).map(t=><li key={t.id}><button onClick={()=>onDay(person,taskDay(t))}>{t.name}<span>{round1(taskRemaining(t))}h left</span></button></li>)}</ul>:<p>No open work.</p>}
      <div className="studio-links"><button className="btn" onClick={openChannels}>Connected inbox</button>{isManager&&<button className="btn" onClick={openDigest}>Admin digests</button>}</div>
    </aside></div>
  </section>
}
