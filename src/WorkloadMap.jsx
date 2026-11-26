
import { useEffect, useMemo, useRef } from 'react'
import { cell, workloadBreakdown, allocatedHours } from './lib/store.js'
import { cellShade, LEAVE_PATTERN } from './lib/shades.js'

const rank={over:5,full:4,busy:3,light:2,free:1,leave:0}
const positions = [[50,48],[23,34],[78,33],[65,76],[25,73],[86,69]]
const statusColors = { over:'#c94d45', full:'#d77b42', busy:'#d7a044', free:'#93ac9f', light:'#629568', leave:'#878296' }

function landscape(ctx,w,h,markers) {
  ctx.clearRect(0,0,w,h)
  const paper=ctx.createLinearGradient(0,0,w,h)
  paper.addColorStop(0,'#f5f1df');paper.addColorStop(.65,'#e8eee0');paper.addColorStop(1,'#cfdfda')
  ctx.fillStyle=paper;ctx.fillRect(0,0,w,h)
  const blob=(x,y,rx,ry,seed,color,outline)=>{
    ctx.beginPath()
    for(let i=0;i<=100;i++){
      const a=i/100*Math.PI*2
      const k=1+.10*Math.sin(a*3+seed)+.047*Math.cos(a*5-seed)
      const x1=x+Math.cos(a)*rx*k, y1=y+Math.sin(a)*ry*k
      if(i===0)ctx.moveTo(x1,y1);else ctx.lineTo(x1,y1)
    }
    ctx.closePath()
    if(color){ctx.fillStyle=color;ctx.fill()}
    if(outline){ctx.strokeStyle=outline;ctx.lineWidth=1;ctx.stroke()}
  }
  for(let i=0;i<12;i++)blob(w*.15,h*.79,w*(.17+i*.043),h*(.13+i*.046),.6,null,'#829d8c39')
  for(let i=0;i<10;i++)blob(w*.85,h*.13,w*(.12+i*.041),h*(.11+i*.045),2.7,null,'#72948730')
  ctx.strokeStyle='#fff9';ctx.lineWidth=2
  for (let i=0;i<7;i++) {
    ctx.beginPath();ctx.moveTo(-10,h*(.13+i*.14))
    ctx.bezierCurveTo(w*.31,h*(.1+i*.13-0.12),w*.57,h*(.45+i*.11),w+10,h*(.15+i*.16));ctx.stroke()
  }
  for(const {x,y,summary,index} of [...markers].reverse()){
    const hot=summary.key==='over', tint=statusColors[summary.key]
    const radius=Math.min(w,h)*(hot?.50:index===0?.34:.26)
    for(let ring=0;ring<5;ring++){
      const ratio=1-ring*.16
      ctx.globalAlpha=(hot?.14:.11)+ring*.046
      blob(w*x/100,h*y/100,radius*ratio*1.18,radius*ratio*.86,index+1,tint,tint)
    }
    ctx.globalAlpha=1
  }
}

export default function WorkloadMap({state,members,date,mode,onSelect,highlight}) {
  const canvas=useRef(null)
  const markers=useMemo(() => members.map(user=>({user,summary:cell(state,user.id,date,mode)}))
    .sort((a,b)=>rank[b.summary.key]-rank[a.summary.key]||b.summary.total-a.summary.total)
    .map((marker,index)=>({...marker,index,x:positions[index%positions.length][0],y:positions[index%positions.length][1]})), [state,members,date,mode])
  useEffect(()=>{
    const el=canvas.current
    const draw=()=>{
      const {width,height}=el.getBoundingClientRect(), ratio=Math.min(devicePixelRatio||1,2)
      if(!width||!height)return
      el.width=Math.round(width*ratio);el.height=Math.round(height*ratio)
      const ctx=el.getContext('2d')
      if(ctx){ctx.setTransform(ratio,0,0,ratio,0,0);landscape(ctx,width,height,markers)}
    }
    const observer=new ResizeObserver(draw)
    observer.observe(el);draw()
    return ()=>observer.disconnect()
  },[markers])
  const count=markers.filter(m=>m.summary.key==='over').length
  return <><div className="workload-map" aria-label="Department workload map">
    <canvas ref={canvas} aria-hidden="true"/>
    <div className="map-key" aria-live="polite"><span className={count?'map-alert-dot':''}/>{count ? count+' overloaded '+(count===1?'teammate':'teammates') : 'No teammates overloaded'}</div>
    {markers.map(({user,summary,x,y,index})=>{
      const pending=state.moveRequests.some(r=>r.state==='pending'&&[r.toUserId,r.fromUserId].includes(user.id)&&state.tasks.some(t=>t.id===r.taskId&&(r.date===date||allocatedHours(state,t,date)>0)))
      const breakdown = workloadBreakdown(state,user.id,date,mode)
      const caught = highlight && summary.key === 'over' && cell(state,user.id,date,'planned').key !== 'over'
      return <button type="button" key={user.id} className={'map-pin'+(index===0?' map-pin-primary':'')+(pending?' map-pin-pending':'')+(caught?' map-pin-caught':'')}
        style={{left:x+'%',top:y+'%','--pin-color':statusColors[summary.key],'--pin-tint':cellShade(summary),'--workload-fill':summary.key==='leave'?LEAVE_PATTERN:cellShade(summary)}}
        aria-haspopup="dialog" aria-label={user.name+', '+summary.total+' hours, '+summary.label+'. '+breakdown+'. Show day details'} onClick={()=>onSelect({user,date})}>
        <span className="map-breakdown">{breakdown}</span><span className="map-pin-point" aria-hidden="true"/><strong>{user.name}</strong>
        <span>{summary.onLeave&&!summary.work?'Leave':summary.total+'h · '+summary.label}</span>
      </button>
    })}
  </div><div className="workload-mobile" aria-label="Selected day workload">
    {markers.map(({user,summary}) => {
      const breakdown = workloadBreakdown(state,user.id,date,mode)
      const caught = highlight && summary.key === 'over' && cell(state,user.id,date,'planned').key !== 'over'
      return <button type="button" key={user.id} className={caught?'map-pin-caught':undefined} style={{background:summary.key==='leave'?LEAVE_PATTERN:cellShade(summary)}}
        aria-haspopup="dialog" aria-label={user.name+'. '+summary.label+'. '+breakdown}
        onClick={()=>onSelect({user,date})}>
        <strong>{user.name}</strong><span>{summary.total}h · {summary.label}</span><small>{breakdown}</small>
      </button>
    })}
  </div></>
}
