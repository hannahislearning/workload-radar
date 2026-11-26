
import { describe, expect, it } from 'vitest'
import { initialState, cell, statusFor, deadlineRisk, transferCandidates, dashboardStats } from './store.js'
import { cellShade } from './shades.js'
import { approveFindings, findingsFor, reviewErrors } from './extractor.js'
import { MEMBER_UPLOADS, SAMPLE_MESSAGES } from '../data/samples.js'

const taskById = (state, id) => state.tasks.find(task => task.id === id)
const sample = id => SAMPLE_MESSAGES.find(m => m.id === id)
const luminance = (hex) => hex.slice(1).match(/../g).map(value => parseInt(value,16)/255)
  .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
  .reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0)

describe('workload status and palette', () => {
  it.each([[0,false,'free'],[4,false,'light'],[4.5,false,'busy'],[8,false,'full'],[8.5,false,'over'],[0,true,'leave'],[1,true,'over']])(
    'labels %sh, leave %s as %s', (hours,leave,key)=>expect(statusFor(hours,leave).key).toBe(key),
  )
  it('darkens steadily and keeps text at AA contrast', ()=>{
    const levels=Array.from({length:13},(_,total)=>luminance(cellShade({total})))
    for(let hour=0;hour<levels.length;hour++){
      expect((levels[hour]+.05)/(luminance('#152a27')+.05)).toBeGreaterThanOrEqual(4.5)
      if(hour) expect(levels[hour]).toBeLessThanOrEqual(levels[hour-1])
    }
  })
})

describe('review and approval', ()=>{
  it('recognizes the existing report and demo meeting', ()=>{
    const state=initialState()
    expect(findingsFor(sample('m1'),state,'kumar')[0].duplicateOf).toMatchObject({id:'plan-1',kind:'task'})
    expect(findingsFor(sample('m12'),state,'kumar')[0].duplicateOf).toMatchObject({id:'mtg-1',kind:'meeting'})
    for(const id of ['m21','m22'])expect(findingsFor(sample(id),state,'kumar')[0].duplicate).toBeUndefined()
  })
  it('blocks invalid reviews and counts Wednesday work only once', ()=>{
    const state={...initialState(), allocation:'deadline'}, user=state.users.find(u=>u.id==='kumar')
    const results=MEMBER_UPLOADS.kumar.map(messageId=>({messageId,tasks:findingsFor(sample(messageId),state,user.id)}))
    expect(approveFindings(state,user,results,'2026-11-23')).toBe(state)
    expect(reviewErrors({name:' ',hours:'',deadline:'2026-11-25'})).toHaveProperty('hours')
    const reviewed=results.map(result=>({...result, finalTasks:result.tasks.flatMap(t=>{
      if (result.messageId==='m4') return []
      const corrected={m5:'2026-12-04',m7:'2026-11-26',m13:'2026-11-27'}[result.messageId]
      return [{...t,...(corrected && {deadline:corrected,needsDate:false})}]
    })}))
    const next=approveFindings(state,user,reviewed,'2026-11-23')
    expect(cell(next,'kumar','2026-11-25','all')).toMatchObject({total:10,key:'over',meetings:2})
    expect(next.tasks.filter(t=>t.owner==='kumar'&&/vendor report/i.test(t.name))).toHaveLength(1)
    expect(next.meetings.filter(m=>m.owner==='kumar'&&/client demo call/i.test(m.name))).toHaveLength(1)
    expect(approveFindings(next,user,reviewed,'2026-11-23')).toBe(next)
    expect(JSON.stringify(next)).not.toContain(sample('m1').text)
  })
})

describe('workload decisions', ()=>{
  it('distinguishes overdue, at risk and OK', ()=>{
    const state=initialState()
    expect(deadlineRisk(state,taskById(state,'plan-6'),'2026-11-24')).toMatchObject({overdue:true,atRisk:true})
    expect(deadlineRisk(state,taskById(state,'demo-tender'))).toMatchObject({remaining:6,free:5,atRisk:true})
    expect(deadlineRisk(state,taskById(state,'plan-1'))).toMatchObject({atRisk:false})
  })
  it('ranks applicable skills and excludes leave', ()=>{
    const state={...initialState(), allocation:'deadline'}
    expect(transferCandidates(state,taskById(state,'demo-tender'))[0]).toMatchObject({user:{id:'meiling'},skillMatch:true,fits:true})
    const task={...taskById(state,'plan-1'),deadline:'2026-11-26'}
    expect(transferCandidates(state,task).find(c=>c.user.id==='june').fits).toBe(false)
  })
  it('uses remaining hours in results', ()=>{
    const state={...initialState(), allocation:'deadline'}
    const before=dashboardStats(state)
    taskById(state,'demo-tender').progress=50
    const after=dashboardStats(state)
    expect(after.hiddenHours).toBe(before.hiddenHours-3)
    expect(after.totalHours).toBe(before.totalHours-3)
  })
})
