'use strict';
const $ = id => document.getElementById(id);
const people = { manager:'Aisha Rahman', mei:'Mei Linng', kumar:'Kumar Patel', sara:'Sara Tan' };
const members = ['mei','kumar','sara'];
const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const zone = 'Asia/Kuala_Lumpur';
const today = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monday = new Date(today + 'T12:00:00Z');
monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
const dateAt = offset => { const d = new Date(monday); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); };
const dateLabel = (date, opts={month:'short',day:'numeric'}) => new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{...opts,timeZone:'UTC'});
const stamp = date => new Date(date).toLocaleString('en-GB',{timeZone:zone,dateStyle:'medium',timeStyle:'short'});
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = value => value.toLowerCase().replace(/[^a-z0-9]/g,'');
function task(id,title,owner,offset,hours,source='plan',kind='Task',due=offset){
  return {id,title,owner,date:dateAt(offset),due:dateAt(due),hours,source,kind,done:0};
}
function seed(){
  const core = [
    ['mei',0,'Design review',4],['mei',1,'Update user flows',5],['mei',2,'Prototype screens',8],['mei',3,'Stakeholder review',6,'Meeting'],['mei',4,'Handoff notes',3],
    ['kumar',0,'API integration',7],['kumar',1,'Data mapping',6],['kumar',2,'QA fixes',5],['kumar',3,'Release checklist',8],['kumar',4,'Write rollout guide',4],
    ['sara',0,'Test plan',3],['sara',1,'Accessibility audit',4],['sara',2,'Regression tests',6],['sara',3,'Partner demo',5,'Meeting'],['sara',4,'Review findings',4],
    ['mei',7,'Sprint planning',5,'Meeting'],['mei',10,'Design QA',6],['kumar',8,'Performance testing',8],['kumar',10,'Service documentation',4],['sara',8,'Cross-browser testing',4],['sara',11,'Research readout',5,'Meeting'],
    ['mei',14,'Conference preparation',6],['mei',15,'Product conference',4,'Conference'],['kumar',16,'Integration rehearsal',6],['sara',17,'Customer feedback synthesis',7]
  ];
  const tasks = core.map(([owner,day,title,hours,kind],i)=>task('p'+i,title,owner,day,hours,'plan',kind));
  tasks.push(task('m1','Update launch assets','mei',0,5,'WhatsApp'),task('m2','Investigate intake failures','kumar',1,4,'Email'),task('m3','Run on-site demo rehearsal','mei',2,3,'Email','Meeting'),task('m4','Prepare partner support notes','sara',3,3,'WhatsApp'),task('m5','Patch reporting endpoint','kumar',8,2,'WhatsApp'));
  const completed = task('done1','Confirm launch scope','mei',0,2);
  completed.done = 2;
  tasks.push(completed);
  return {tasks,drafts:[],requests:[],last:{mei:Date.now(),kumar:Date.now()-10*86400000,sara:Date.now()-86400000}};
}
let state;
try { state = JSON.parse(localStorage.getItem('workload-v1')) || seed(); } catch { state=seed(); }
let role = sessionStorage.getItem('workload-role') || 'manager';
let page = location.hash === '#team' ? 'team' : 'upload';
let week = 0, combined = true, flipped = new Set(), toastTimer;
const remaining = t => Math.max(0,t.hours-t.done);
const visible = t => combined || t.source==='plan';
const cellTasks = (owner,date,filter=visible) => state.tasks.filter(t=>t.owner===owner && t.date===date && filter(t) && remaining(t)>0);
const total = list => list.reduce((sum,t)=>sum+remaining(t),0);
const hours = (owner,date,filter) => total(cellTasks(owner,date,filter));
const status = h => h<=4 ? 'light' : h<=7 ? 'busy' : h===8 ? 'full' : 'over';
const label = s => s[0].toUpperCase()+s.slice(1);
const manager = () => role==='manager';
const pending = () => state.requests.filter(r=>r.status==='Pending');
const waiting = roleId => pending().filter(r=>r.to===roleId);
const draftVisible = d => d.reviewer===role;
const openTasks = t => remaining(t)>0;
const stale = () => members.filter(id=>(manager()||role===id) && Date.now()-state.last[id]>=7*86400000);
const duplicate = d => state.tasks.find(t=>t.owner===d.owner && norm(t.title)===norm(d.title) && t.due===d.due);
function save(){ localStorage.setItem('workload-v1',JSON.stringify(state)); render(); }
function notify(message){
  $('toast').textContent=message;
  $('toast').style.display='block';
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').style.display='none',3200);
}
function showPage(next){ location.hash=next; page=next; render(); }
window.addEventListener('hashchange',()=>{page=location.hash==='#team'?'team':'upload';render();});
function selectPeople(selected,exclude){
  return members.filter(id=>id!==exclude).map(id=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+people[id]+'</option>').join('');
}
function render(){
  $('role').value=role;
  document.querySelectorAll('nav [data-page]').forEach(button=>{
    button.classList.toggle('active',button.dataset.page===page);
    if(button.dataset.page===page) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  $('crumb').textContent='Workspace / '+(page==='upload'?'Upload & review':'Team heatmap');
  const n = (manager()?pending().length:waiting(role).length)+stale().length+(manager()?state.requests.filter(r=>r.status!=='Pending'&&!r.read).length:0);
  $('count').textContent=n || '';
  $('main').innerHTML=page==='upload'?uploadPage():teamPage();
}
function sourceCard(source, icon, detail, button){
  return '<article class="panel"><div class="source-icon" aria-hidden="true">'+icon+'</div><h2>'+source+'</h2><p class="muted">'+detail+'</p>'+button+'</article>';
}
function uploadPage(){
  const drafts=state.drafts.filter(draftVisible);
  return '<h1>Upload &amp; review</h1><p class="muted lead">Bring project plans and messages into your team workload.</p><section class="sources" aria-label="Upload sources">'+
    sourceCard('Project plan','▤','Load a sample project plan with assignments, estimated hours and milestones.',manager()?'<button class="primary" data-action="sample" data-source="plan">Upload demo plan</button>':'<span class="pill">Manager upload</span>')+
    sourceCard('WhatsApp','◉','Review work assigned in WhatsApp conversations.',manager()?'<span class="pill">Team member upload</span>':messageButtons('WhatsApp'))+
    sourceCard('Email','✉','Review assignments, meetings and deadlines from email.',manager()?'<span class="pill">Team member upload</span>':messageButtons('Email'))+
    '</section><section class="panel"><div class="row spread"><div><h2>Extraction review</h2><p class="muted">Confirm assignments and resolve flagged findings before they reach the heatmap.</p></div><span class="pill">'+drafts.length+' to review</span></div>'+
    (drafts.length?drafts.map(draftItem).join(''):'<p class="empty">Upload a demo source to see findings here.</p>')+'</section><p class="muted">'+(manager()?'Manager view includes approved tasks and their source labels.':'Message text stays in your review session. Approved findings share task details with the team.')+'</p>';
}
function messageButtons(source){
  return '<div class="row"><button class="primary" data-action="sample" data-source="'+source+'">Load demo</button><button data-action="input" data-source="'+source+'">Paste or upload</button></div>';
}
function draftItem(d){
  const match=duplicate(d);
  return '<article class="item"><div class="row spread"><h3>'+esc(d.title)+'</h3><span class="pill">'+esc(d.source==='plan'?'Project plan':d.source)+'</span></div><p class="muted">'+people[d.owner]+' · '+d.kind+' · '+d.hours+'h · Scheduled '+dateLabel(d.date)+' · Due '+dateLabel(d.due)+'</p>'+
    (match||d.flag?'<p class="danger">'+(match?'Matches “'+esc(match.title)+'”. Approval links to the existing task.':esc(d.flag))+'</p>':'')+
    '<div class="row"><button class="primary" data-action="approve-draft" data-id="'+d.id+'">'+(match?'Confirm match':'Approve')+'</button><button data-action="edit" data-id="'+d.id+'">Edit</button><button class="danger" data-action="delete" data-id="'+d.id+'">Delete</button></div></article>';
}
function loadSample(source){
  const demo = source==='plan' ? [
    task('', 'Prepare steering committee deck','sara',2,3),task('', 'Steering committee meeting','mei',3,2,'plan','Meeting'),task('', 'Industry conference','kumar',17,4,'plan','Conference')
  ] : [
    task('',source==='Email'?'Summarise stakeholder feedback':'Review updated launch checklist',role,1,3,source,'Task',3),
    task('',source==='Email'?'Partner alignment call':'Vendor check-in',role,2,1,source,'Meeting'),
    {...task('', 'Check revised handover scope',role,3,2,source),flag:'The message gives no estimate. Confirm the proposed duration and dates.'},
    {...state.tasks.find(t=>t.owner===role && t.source==='plan'),source}
  ];
  const fresh=demo.filter(d=>d.title && !state.drafts.some(existing=>existing.reviewer===role && existing.source===source && norm(existing.title)===norm(d.title)));
  state.drafts.push(...fresh.map(d=>({...d,id:uid(),done:0,reviewer:role})));
  save(); notify(fresh.length?fresh.length+' findings ready for review.':'These findings are already in review.');
}
function modal(title,body){
  $('modal').innerHTML='<div class="row spread"><h2>'+title+'</h2><button data-action="close" aria-label="Close">×</button></div>'+body;
  if(!$('modal').open) $('modal').showModal();
}
const field = (name, caption, type, value, extra='') => '<label class="field">'+caption+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" required '+extra+'></label>';
function editDraft(d){
  modal('Edit finding','<form data-form="edit" data-id="'+d.id+'">'+field('title','Title','text',d.title)+
    (manager()?'<label class="field">Assignee<select name="owner">'+selectPeople(d.owner)+'</select></label>':'')+
    '<label class="field">Type<select name="kind">'+['Task','Meeting','Conference','Milestone'].map(k=>'<option '+(k===d.kind?'selected':'')+'>'+k+'</option>').join('')+'</select></label>'+
    field('hours','Estimated hours','number',d.hours,'min="1" max="24" step="1"')+field('date','Work date','date',d.date,'min="'+dateAt(0)+'" max="'+dateAt(20)+'"')+field('due','Deadline or event date','date',d.due)+'<button class="primary">Save finding</button></form>');
}
function inputModal(source){
  modal('Import '+source,'<form data-form="import" data-source="'+source+'"><p class="muted">The prototype detects likely assignments and dates from text. Review every finding before approving.</p><label class="field">Upload a text export<input type="file" accept=".txt,.eml,text/plain,message/rfc822" id="file"></label><label class="field">Or paste message text<textarea name="message" id="message" required placeholder="Please prepare the budget report by Friday. Estimated time: 3 hours."></textarea></label><button class="primary">Extract findings</button></form>');
}
function extract(text,source){
  const searchDates = value => {
    const iso=value.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if(iso && Number.isFinite(Date.parse(iso))) return iso;
    const weekday = weekdays.findIndex(day=>new RegExp('\\b'+day+'\\b','i').test(value));
    if(weekday>=0) return dateAt(weekday+(/\bnext\b/i.test(value)||dateAt(weekday)<today?7:0));
    if(/\btomorrow\b/i.test(value)) return new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
    return /\btoday\b/i.test(value)?today:null;
  };
  const blocks=text.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const candidates=blocks.filter(line=>! /^(subject|from|to|sent|date):/i.test(line) && /\b(please|need|assigned|task|meeting|conference|call|deadline|due|reminder|don't forget|can you|could you|follow up|rsvp|milestone)\b/i.test(line));
  return (candidates.length?candidates:blocks.filter(line=>! /^(subject|from|to|sent|date):/i.test(line)).slice(0,1)).slice(0,25).map(line=>{
    const due=searchDates(line);
    const estimate=Number(line.match(/\b(\d{1,2})\s*(?:hours?|hrs?|h)\b/i)?.[1]);
    const kind=/\bconference\b/i.test(line)?'Conference':/\b(meeting|call)\b/i.test(line)?'Meeting':/\bmilestone\b/i.test(line)?'Milestone':'Task';
    const title=line.replace(/^.*?\]\s*[^:]+:\s*/,'').replace(/^(?:please|can you|could you|reminder:|don.t forget(?: the)?)\s+/i,'').split(/[.!?](?:\s|$)/)[0].replace(/\s+(?:due|by|on)\s+.*$/i,'').trim().slice(0,115)||'Untitled finding';
    const owner=members.find(id=>new RegExp('\\b'+people[id].split(' ')[0]+'\\b','i').test(title))||role;
    const known=state.tasks.find(t=>t.owner===owner && norm(title).includes(norm(t.title)) && (!due||due===t.due));
    const date=due && due>=dateAt(0) && due<=dateAt(20)?due:today;
    const flag=(!due||!estimate||estimate>24||date!==due||owner!==role||!candidates.length)?'Confirm the assignee, estimate and dates for this finding.':'';
    return {id:uid(),title:known?.title||title,owner,date,due:due||known?.due||date,hours:estimate>0&&estimate<=24?estimate:1,source,kind,done:0,flag,reviewer:role};
  });
}
function teamPage(){
  const forecast=[];
  const forecastWeek=week<2?week+1:2;
  for(let d=0;d<5;d++) for(const id of members){
    const day=dateAt(forecastWeek*7+d);
    const h=hours(id,day);
    if(h>8) forecast.push({id,day,h});
  }
  forecast.sort((a,b)=>b.h-a.h);
  const top=forecast[0];
  const stalePeople=stale();
  return '<h1>Team heatmap</h1><p class="muted lead">Review capacity, rebalance assignments and log progress in one place.</p>'+
    '<div class="banner"><strong>'+(week===2?'Week outlook':'Next week outlook')+'</strong> · '+(top?people[top.id]+' is at <b>'+top.h+'h</b> on '+dateLabel(top.day,{weekday:'long',month:'short',day:'numeric'})+'.':'Everyone is within the 8h daily limit in this view.')+'</div>'+
    (stalePeople.length?'<div class="banner alert"><strong>Progress update overdue</strong> · '+stalePeople.map(id=>people[id]+' last logged progress '+Math.floor((Date.now()-state.last[id])/86400000)+' days ago').join(' · ')+'</div>':'')+
    '<section class="panel"><div class="row spread toolbar"><div><h2>Weekly capacity</h2><small>8 hours per person per day · Click a cell for tasks and deadlines</small></div><div class="seg" aria-label="Workload source"><button data-action="mode" data-value="combined" aria-pressed="'+combined+'" class="'+(combined?'active':'')+'">Planned + messages</button><button data-action="mode" data-value="planned" aria-pressed="'+!combined+'" class="'+(!combined?'active':'')+'">Planned only</button></div></div>'+
    '<div class="row spread"><div class="row"><button data-action="week" data-value="-1" aria-label="Previous week" '+(week===0?'disabled':'')+'>‹</button><strong>'+dateLabel(dateAt(week*7))+' – '+dateLabel(dateAt(week*7+4))+'</strong><button data-action="week" data-value="1" aria-label="Next week" '+(week===2?'disabled':'')+'>›</button><span class="pill">'+['This week','Next week','In two weeks'][week]+'</span></div>'+
    (manager()?'<div class="row"><button data-action="suggest">✦ Suggest a move</button><button class="primary" data-action="move">Request a move</button></div>':'')+'</div>'+
    '<div class="row legend">'+[['light','Light · 0–4h'],['busy','Busy · 5–7h'],['full','Full · 8h'],['over','Over · 9h+']].map(([c,l])=>'<span><i class="dot '+c+'"></i>'+l+'</span>').join('')+'</div>'+
    '<div class="grid-wrap"><div class="grid"><div class="day">Team member</div>'+weekdays.map((day,i)=>'<div class="day"><strong>'+day.slice(0,3)+'</strong><br>'+dateLabel(dateAt(week*7+i))+'</div>').join('')+
    members.map(id=>'<div class="person"><span class="avatar">'+people[id].split(' ').map(x=>x[0]).join('')+'</span>'+people[id]+'</div>'+weekdays.map((_,i)=>gridCell(id,dateAt(week*7+i))).join('')).join('')+'</div></div></section>'+
    '<div class="lower"><section class="panel"><h2>Task logging</h2><p class="muted">'+(manager()?'Team tasks ordered by deadline.':'Your tasks ordered by deadline. Logging work updates capacity immediately.')+'</p>'+taskLog()+'</section><section class="panel"><h2>Requests &amp; change history</h2><p class="muted">Reassignments take effect after the receiving teammate approves.</p>'+history()+'</section></div>';
}
function gridCell(id,date){
  const tasks=cellTasks(id,date);
  const h=total(tasks), s=status(h), key=id+'|'+date;
  const requests=pending().filter(r=>r.date===date&&(r.from===id||r.to===id)&&state.tasks.some(t=>t.id===r.task&&visible(t)));
  const note=requests.length?'Waiting for '+[...new Set(requests.map(r=>people[r.to]))].join(', ')+'’s approval':'';
  return '<button class="cell '+(flipped.has(key)?'flipped ':'')+(note?'pending':'')+'" data-action="flip" data-id="'+key+'" aria-pressed="'+flipped.has(key)+'" aria-label="'+people[id]+', '+dateLabel(date)+', '+h+' hours. '+esc(note)+'"><span class="flip"><span class="face '+s+'"><strong>'+h+'h</strong><span>'+label(s)+'</span>'+(note?'<small>'+esc(note)+'</small>':'')+'</span><span class="face back">'+(tasks.length?tasks.map(t=>'<span style="display:block">'+esc(t.title)+' · Due '+dateLabel(t.due)+'</span>').join(''):'No remaining work')+(note?'<small>'+esc(note)+'</small>':'')+'</span></span></button>';
}
function taskLog(){
  const tasks=state.tasks.filter(t=>(manager()||t.owner===role)&&visible(t));
  const sort=(a,b)=>a.due.localeCompare(b.due)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title);
  const open=tasks.filter(openTasks).sort(sort), done=tasks.filter(t=>!openTasks(t)).sort(sort);
  return (open.length?open.slice(0,5).map(logItem).join(''):'<p class="empty">No open tasks in this view.</p>')+
    (open.length>5?'<details><summary>Show '+(open.length-5)+' more open tasks</summary>'+open.slice(5).map(logItem).join('')+'</details>':'')+
    (done.length?'<details open><summary>Completed ('+done.length+')</summary>'+done.map(logItem).join('')+'</details>':'');
}
function logItem(t){
  return '<article class="item"><div class="row spread"><h3>'+esc(t.title)+'</h3><span class="pill">'+(remaining(t)?remaining(t)+'h left':'Done')+'</span></div><p class="muted">'+people[t.owner]+' · Due '+dateLabel(t.due)+' · '+esc(t.source==='plan'?'Planned':t.source)+'</p><div class="row"><progress value="'+t.done+'" max="'+t.hours+'" aria-label="Work progress"></progress><small>'+t.done+' / '+t.hours+'h logged</small>'+(!manager()&&remaining(t)?'<button data-action="log" data-id="'+t.id+'">Log progress</button>':'')+'</div></article>';
}
function requestItem(r){
  const pair=r.after?' · '+r.before[0]+'h → '+r.after[0]+'h for '+people[r.from]+' · '+r.before[1]+'h → '+r.after[1]+'h for '+people[r.to]:'';
  return '<article class="item"><div class="row spread"><h3>'+esc(r.title)+'</h3><span class="pill">'+r.status+'</span></div><p>'+people[r.from]+' to '+people[r.to]+' · '+dateLabel(r.date)+'</p><p class="muted">Requested by '+people.manager+' · '+stamp(r.created)+'</p>'+
    (r.status==='Pending'?'<p>Waiting for '+people[r.to]+'’s approval</p>':'<p class="muted">'+r.status+' by '+people[r.to]+' · '+stamp(r.resolved)+esc(pair)+'</p>')+
    (r.status==='Pending'&&r.to===role?'<div class="row"><button class="primary" data-action="resolve" data-value="Approved" data-id="'+r.id+'">Approve</button><button data-action="resolve" data-value="Rejected" data-id="'+r.id+'">Reject</button></div>':'')+'</article>';
}
function history(){
  const all=state.requests.filter(r=>manager()||r.from===role||r.to===role).slice().reverse();
  return all.length?all.map(requestItem).join(''):'<p class="empty">No workload changes yet.</p>';
}
function moveModal(suggest){
  const options=state.tasks.filter(t=>visible(t)&&openTasks(t)&&t.date>=dateAt(week*7)&&t.date<=dateAt(week*7+4)&&!pending().some(r=>r.task===t.id));
  let best;
  if(suggest) for(const t of options){
    const from=hours(t.owner,t.date);
    if(from<=8) continue;
    for(const to of members.filter(id=>id!==t.owner)){
      const recipient=hours(to,t.date)+remaining(t);
      const score=from-Math.max(recipient,from-remaining(t));
      if(recipient<=8&&score>0&&(!best||score>best.score)) best={t,to,score,from,recipient};
    }
  }
  if(!options.length||suggest&&!best){ modal(suggest?'Suggested move':'Request a move','<p class="empty">'+(suggest?'No move in this week and view reduces overload while keeping the recipient within 8h.':'There are no available assignments in this week and view.')+'</p>');return; }
  const first=best?.t||options[0];
  modal(suggest?'Suggested move':'Request a move',(best?'<p class="banner">'+people[first.owner]+' drops from '+best.from+'h to '+(best.from-remaining(first))+'h. '+people[best.to]+' would have '+best.recipient+'h.</p>':'')+
    '<form data-form="move"><label class="field">Assignment<select name="task" id="move-task">'+options.map(t=>'<option value="'+t.id+'" '+(t.id===first.id?'selected':'')+'>'+esc(t.title)+' · '+people[t.owner]+' · '+dateLabel(t.date)+' · '+remaining(t)+'h</option>').join('')+'</select></label><label class="field">Send to<select name="to" id="move-to">'+selectPeople(best?.to,first.owner)+'</select></label><button class="primary">Send request</button></form>');
}
function resolve(id,outcome){
  const r=pending().find(x=>x.id===id&&x.to===role);
  if(!r)return;
  const t=state.tasks.find(t=>t.id===r.task);
  if(outcome==='Approved'&&(!t||!remaining(t)||t.owner!==r.from)){
    outcome='Closed';
    notify('The assignment is no longer available to move.');
  }
  if(outcome==='Approved'){
    const pairs=()=>[hours(r.from,r.date,()=>true),hours(r.to,r.date,()=>true)];
    r.before=pairs();
    t.owner=r.to;
    r.after=pairs();
  }
  r.status=outcome;
  r.resolved=Date.now();
  save();
  if($('modal').open) showNotifications();
  if(outcome!=='Closed') notify('Request '+outcome.toLowerCase()+'.');
}
function showNotifications(){
  const list=manager()?state.requests.slice().reverse():waiting(role);
  if(manager()){list.forEach(r=>{if(r.status!=='Pending')r.read=true;});save();}
  modal('Notifications',stale().map(id=>'<p class="banner alert">'+people[id]+' has an overdue progress update.</p>').join('')+
    (list.length?list.map(requestItem).join(''):stale().length?'':'<p class="empty">You’re all caught up.</p>'));
}
$('role').innerHTML='<option value="manager">Aisha · Manager</option>'+selectPeople();
document.addEventListener('change',async e=>{
  if(e.target.id==='role'){
    role=e.target.value; sessionStorage.setItem('workload-role',role); flipped.clear(); render();
  } else if(e.target.id==='file'){
    try {const file=e.target.files[0]; if(file){if(file.size>2000000){notify('Choose a text file under 2 MB.');return;} $('message').value=await file.text();}}
    catch {notify('Unable to read this file.');}
  } else if(e.target.id==='move-task'){
    const t=state.tasks.find(t=>t.id===e.target.value);
    $('move-to').innerHTML=selectPeople(null,t.owner);
  }
});
document.addEventListener('click',e=>{
  const button=e.target.closest('button');
  if(!button)return;
  const {page:next,action,id,source,value}=button.dataset;
  if(next){showPage(next);return;}
  if(button.id==='notifications'){showNotifications();return;}
  const draft=()=>state.drafts.find(d=>d.id===id&&draftVisible(d));
  switch(action){
    case 'close': $('modal').close(); break;
    case 'sample': if((source==='plan')===manager())loadSample(source);break;
    case 'input': if(!manager())inputModal(source);break;
    case 'edit': if(draft())editDraft(draft());break;
    case 'delete': if(draft()){state.drafts=state.drafts.filter(d=>d.id!==id);save();notify('Finding removed.');}break;
    case 'approve-draft': {
      const d=draft(); if(!d)break;
      const match=duplicate(d);
      if(!match){
        const {reviewer,flag,...approved}=d;
        state.tasks.push(approved);
      }
      state.drafts=state.drafts.filter(d=>d.id!==id);save();
      notify(match?'Matched to existing work. Hours are unchanged.':'Approved and added to the heatmap.');
      break;
    }
    case 'mode': combined=value==='combined';flipped.clear();render();break;
    case 'week': week+=Number(value);flipped.clear();render();break;
    case 'flip': {
      if(flipped.has(id))flipped.delete(id);else flipped.add(id);
      button.classList.toggle('flipped',flipped.has(id));button.setAttribute('aria-pressed',flipped.has(id));break;
    }
    case 'move': case 'suggest': if(manager())moveModal(action==='suggest');break;
    case 'resolve': resolve(id,value);break;
    case 'log': {
      const t=state.tasks.find(t=>t.id===id&&t.owner===role);
      if(t&&remaining(t)) modal('Log progress','<form data-form="log" data-id="'+id+'"><p>'+esc(t.title)+' · '+remaining(t)+'h remaining</p>'+field('hours','Hours worked','number',1,'min="1" max="'+remaining(t)+'" step="1"')+'<div class="row"><button class="primary" value="log">Save progress</button><button value="done" formnovalidate>Mark complete</button></div></form>');
      break;
    }
  }
});
document.addEventListener('submit',e=>{
  const form=e.target;
  if(!form.dataset.form)return;
  e.preventDefault();
  const data=Object.fromEntries(new FormData(form));
  const {id,source}=form.dataset;
  let message;
  switch(form.dataset.form){
    case 'edit': {
      const d=state.drafts.find(d=>d.id===id&&draftVisible(d));
      if(!d||!data.title.trim()){notify('Enter a finding title.');return;}
      Object.assign(d,{title:data.title.trim(),owner:data.owner||d.owner,kind:data.kind,hours:Number(data.hours),date:data.date,due:data.due,flag:''});
      message='Finding updated.';break;
    }
    case 'import': {
      if(manager())return;
      const findings=extract(data.message,source);
      if(!findings.length){notify('Enter a message with an assignment or event.');return;}
      state.drafts.push(...findings);message=findings.length+' findings ready for review.';break;
    }
    case 'move': {
      const t=state.tasks.find(t=>t.id===data.task);
      if(!manager()||!t||!remaining(t)||t.owner===data.to||!members.includes(data.to)||pending().some(r=>r.task===t.id))return;
      state.requests.push({id:uid(),task:t.id,title:t.title,from:t.owner,to:data.to,date:t.date,status:'Pending',created:Date.now()});
      message='Request sent to '+people[data.to]+'.';break;
    }
    case 'log': {
      const t=state.tasks.find(t=>t.id===id&&t.owner===role);
      if(!t)return;
      const worked=e.submitter?.value==='done'?remaining(t):Number(data.hours);
      if(!Number.isInteger(worked)||worked<=0||worked>remaining(t))return;
      t.done+=worked;state.last[role]=Date.now();message=remaining(t)?'Progress saved. Capacity updated.':'Task completed. Capacity updated.';break;
    }
  }
  $('modal').close();save();notify(message);
});
render();