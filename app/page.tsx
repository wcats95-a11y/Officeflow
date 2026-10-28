"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "To Do" | "In Progress" | "Under Review" | "Done";
type Priority = "Urgent" | "High" | "Medium" | "Low";
type Task = { id: string; title: string; description: string; status: Status; priority: Priority; category: string; due: string; project: string; client: string; juniors: string[] };
const seed: Task[] = [
 {id:"t1",title:"Review Q2 GST reconciliation",description:"Check purchase register against GSTR-2B and note exceptions.",status:"In Progress",priority:"Urgent",category:"Tax",due:"2026-10-29",project:"Quarterly compliance",client:"Aster Retail",juniors:["Ruchita","Sapna"]},
 {id:"t2",title:"Prepare client document checklist",description:"Collect missing bank and interest certificates.",status:"To Do",priority:"High",category:"Client follow-up",due:"2026-10-30",project:"ITR filing",client:"Northstar Foods",juniors:["Jahnavi"]},
 {id:"t3",title:"Finalize audit observations",description:"Consolidate open points and supporting notes.",status:"Under Review",priority:"Medium",category:"Audit",due:"2026-10-31",project:"Statutory audit",client:"Aster Retail",juniors:["Charan Reddy"]},
 {id:"t4",title:"Send signed computation",description:"Share the reviewed computation with the client.",status:"Done",priority:"Low",category:"Tax",due:"2026-10-27",project:"ITR filing",client:"Northstar Foods",juniors:["Sapna"]}
];
const statuses: Status[] = ["To Do","In Progress","Under Review","Done"];
const priorities: Priority[] = ["Urgent","High","Medium","Low"];
const initials = (s:string) => s.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();

export default function Home() {
 const [tasks,setTasks] = useState<Task[]>(seed);
 const [ready,setReady] = useState(false);
 const [view,setView] = useState("Today");
 const [query,setQuery] = useState("");
 const [filter,setFilter] = useState("All tasks");
 const [showAdd,setShowAdd] = useState(false);
 const [dark,setDark] = useState(false);
 const [toast,setToast] = useState("");
 const [form,setForm] = useState({title:"",description:"",priority:"Medium" as Priority,due:new Date().toISOString().slice(0,10),category:"General",project:"",client:"",juniors:""});
 useEffect(()=>{try{const saved=localStorage.getItem("officeflow-tasks");if(saved)setTasks(JSON.parse(saved));setDark(localStorage.getItem("officeflow-dark")==="true");}catch{}setReady(true)},[]);
 useEffect(()=>{if(ready)localStorage.setItem("officeflow-tasks",JSON.stringify(tasks))},[tasks,ready]);
 useEffect(()=>{if(ready)localStorage.setItem("officeflow-dark",String(dark))},[dark,ready]);
 const filtered = useMemo(()=>tasks.filter(t=>{
  const q=query.toLowerCase();
  const matches=[t.title,t.description,t.client,t.project,t.category,...t.juniors].join(" ").toLowerCase().includes(q);
  return matches && (filter==="All tasks" || (filter==="Overdue" && t.due<new Date().toISOString().slice(0,10) && t.status!=="Done") || (filter==="Urgent" && t.priority==="Urgent") || t.status===filter);
 }),[tasks,query,filter]);
 const counts = {open:tasks.filter(t=>t.status!=="Done").length,review:tasks.filter(t=>t.status==="Under Review").length,done:tasks.filter(t=>t.status==="Done").length,urgent:tasks.filter(t=>t.priority==="Urgent"&&t.status!=="Done").length};
 function updateStatus(id:string,status:Status){setTasks(old=>old.map(t=>t.id===id?{...t,status}:t));setToast("Task updated");setTimeout(()=>setToast(""),2200)}
 function addTask(e:React.FormEvent){e.preventDefault();if(!form.title.trim())return;setTasks(old=>[{...form,id:crypto.randomUUID(),status:"To Do",juniors:form.juniors.split(",").map(s=>s.trim()).filter(Boolean)},...old]);setShowAdd(false);setForm({title:"",description:"",priority:"Medium",due:new Date().toISOString().slice(0,10),category:"General",project:"",client:"",juniors:""});setToast("Task created");setTimeout(()=>setToast(""),2200)}
 function whatsapp(t:Task){const message=encodeURIComponent(`Hi ${t.juniors.join(", ")},\nTask: ${t.title}\nDue: ${t.due}\nPriority: ${t.priority}\n${t.description}\nPlease share an update when you can.`);const phone="";window.open(`https://wa.me/${phone}?text=${message}`,"_blank","noopener,noreferrer")}
 return <main className={dark?"app dark":"app"}>
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark">o</div><span>office<span className="brand-light">flow</span></span></div>
   <div className="workspace"><div className="workspace-icon">C</div><div><b>My workspace</b><small>Personal office</small></div><span className="chevron">⌄</span></div>
   <p className="nav-label">WORKSPACE</p>
   <nav>{[["Today","◷"],["My tasks","☷"],["Kanban board","▦"],["Calendar","▦"],["Projects","▤"],["Delegated work","↗"],["Clients","♧"]].map(([name,icon])=><button key={name} className={view===name?"nav-item active":"nav-item"} onClick={()=>setView(name)}><span className="nav-icon">{icon}</span>{name}{name==="Today"&&<span className="nav-count">{counts.open}</span>}</button>)}</nav>
   <p className="nav-label space-top">YOUR SPACE</p>
   <button className="nav-item" onClick={()=>setView("Settings")}><span className="nav-icon">⚙</span>Settings</button>
   <div className="sidebar-bottom"><div className="help-card"><div className="help-symbol">✳</div><b>Make work flow.</b><p>A little clarity goes a long way.</p></div><div className="profile"><div className="avatar owner">CR</div><div><b>Charan Reddy</b><small>Workspace owner</small></div><button title="Toggle theme" className="icon-button" onClick={()=>setDark(!dark)}>{dark?"☼":"◐"}</button></div></div>
  </aside>
  <section className="main-area">
   <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{view}</b></div><div className="top-actions"><div className="searchbox"><span>⌕</span><input aria-label="Search" placeholder="Search anything..." value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div><button className="icon-button notification" title="Notifications">♧<i/></button><div className="avatar owner">CR</div></div></header>
   <div className="content">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR WORKSPACE · WEDNESDAY, OCTOBER 28</div><h1>{view==="Today"?"Good evening, Charan":view}<span className="wave">{view==="Today"?" ✦":""}</span></h1><p className="subtitle">{view==="Today"?"A clear mind starts with a clear plan. Here's your day at a glance.":`Your ${view.toLowerCase()} in one calm, organized place.`}</p></div><button className="primary-button" onClick={()=>setShowAdd(true)}><span>＋</span> New task</button></div>
    <div className="stats-grid">
     <div className="stat-card"><div className="stat-top"><span>Open tasks</span><span className="stat-icon purple">☷</span></div><div className="stat-value">{counts.open}<span className="stat-note">in progress</span></div><div className="stat-bottom"><span className="mini-bars"><i/><i/><i/><i/><i/><i/><i/></span><span>Keep the momentum</span></div></div>
     <div className="stat-card"><div className="stat-top"><span>Needs review</span><span className="stat-icon orange">◷</span></div><div className="stat-value">{counts.review}<span className="stat-note">awaiting review</span></div><div className="stat-bottom"><span className="status-dot orange-dot"/>A quick check can unblock work</div></div>
     <div className="stat-card"><div className="stat-top"><span>Completed</span><span className="stat-icon green">✓</span></div><div className="stat-value">{counts.done}<span className="stat-note">tasks finished</span></div><div className="stat-bottom"><span className="status-dot green-dot"/>Progress worth celebrating</div></div>
     <div className="stat-card"><div className="stat-top"><span>Urgent priority</span><span className="stat-icon red">↗</span></div><div className="stat-value">{counts.urgent}<span className="stat-note">need attention</span></div><div className="stat-bottom"><span className="status-dot red-dot"/>Focus on what matters</div></div>
    </div>
    <div className="section-heading"><div><h2>{view==="Today"?"Your tasks":view==="Projects"?"Projects overview":view==="Clients"?"Clients overview":view==="Calendar"?"Upcoming deadlines":view==="Kanban board"?"Board overview":view==="Delegated work"?"Delegated tasks":"Task overview"}</h2><p>{view==="Today"?"The important things, all in one place.":"Everything you need, without the noise."}</p></div><div className="view-actions"><select aria-label="Filter tasks" value={filter} onChange={e=>setFilter(e.target.value)}><option>All tasks</option><option>To Do</option><option>In Progress</option><option>Under Review</option><option>Done</option><option>Overdue</option><option>Urgent</option></select><button className="secondary-button" onClick={()=>setView("Kanban board")}>▦ Board view</button></div></div>
    {view==="Kanban board"?<div className="kanban">{statuses.map(status=><div className="kanban-column" key={status}><div className="kanban-title"><span className={"status-dot "+(status==="Done"?"green-dot":status==="Under Review"?"orange-dot":"purple-dot")}/>{status}<span>{filtered.filter(t=>t.status===status).length}</span></div>{filtered.filter(t=>t.status===status).map(t=><TaskCard key={t.id} task={t} updateStatus={updateStatus} whatsapp={whatsapp}/>)}</div>)}</div>:view==="Projects"||view==="Clients"?<div className="entity-grid">{Array.from(new Set(filtered.map(t=>view==="Projects"?t.project:t.client).filter(Boolean))).map(name=><div className="entity-card" key={name}><div className="entity-symbol">{view==="Projects"?"▤":"♧"}</div><h3>{name}</h3><p>{filtered.filter(t=>(view==="Projects"?t.project:t.client)===name).length} linked tasks</p><div className="entity-progress"><span style={{width:(filtered.filter(t=>(view==="Projects"?t.project:t.client)===name&&t.status==="Done").length/Math.max(1,filtered.filter(t=>(view==="Projects"?t.project:t.client)===name).length)*100)+"%"}}/></div></div>)}</div>:<div className="task-panel"><div className="task-table-head"><span>TASK</span><span>PRIORITY</span><span>STATUS</span><span>DUE DATE</span><span>ASSIGNED TO</span><span/></div>{filtered.filter(t=>view==="Delegated work"?t.juniors.length>0:true).sort((a,b)=>a.due.localeCompare(b.due)).map(t=><TaskRow key={t.id} task={t} updateStatus={updateStatus} whatsapp={whatsapp}/>)}
     {filtered.length===0&&<div className="empty-state"><div>⌕</div><b>No tasks found</b><p>Try a different search or create a new task.</p><button className="secondary-button" onClick={()=>setShowAdd(true)}>Create a task</button></div>}
    </div>}
    <div className="bottom-note"><span className="sparkle">✳</span><span><b>Small steps, meaningful progress.</b> Keep your focus on the next right thing.</span><button onClick={()=>setShowAdd(true)}>Plan a task <span>↗</span></button></div>
    <footer>OFFICEFLOW <span>·</span> YOUR WORK, IN MOTION <span className="footer-right">MADE FOR A CLEARER DAY ✳</span></footer>
   </div>
  </section>
  {showAdd&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><form className="modal" onSubmit={addTask}><div className="modal-header"><div><div className="eyebrow">MAKE IT HAPPEN</div><h2>Create a task</h2></div><button type="button" className="icon-button" onClick={()=>setShowAdd(false)}>✕</button></div><label>Task title<input autoFocus required placeholder="What needs to get done?" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Description<textarea placeholder="Add a little context..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="form-grid"><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as Priority})}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label><label>Due date<input type="date" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></label><label>Category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Project<input placeholder="Project name" value={form.project} onChange={e=>setForm({...form,project:e.target.value})}/></label><label>Client<input placeholder="Client name" value={form.client} onChange={e=>setForm({...form,client:e.target.value})}/></label><label>Assigned juniors<input placeholder="Names, separated by commas" value={form.juniors} onChange={e=>setForm({...form,juniors:e.target.value})}/></label></div><div className="modal-footer"><span>Saved to this browser for now</span><button type="button" className="secondary-button" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary-button" type="submit">Create task <span>↗</span></button></div></form></div>}
  {toast&&<div className="toast">✓ &nbsp;{toast}</div>}
 </main>
}
function TaskRow({task,updateStatus,whatsapp}:{task:Task;updateStatus:(id:string,s:Status)=>void;whatsapp:(t:Task)=>void}){
 const late=task.due<new Date().toISOString().slice(0,10)&&task.status!=="Done";
 return <div className="task-row"><div className="task-title-cell"><div className={"task-check "+(task.status==="Done"?"checked":"")} onClick={()=>updateStatus(task.id,task.status==="Done"?"To Do":"Done")}>{task.status==="Done"?"✓":""}</div><div className="task-name-wrap"><b className={task.status==="Done"?"muted-title":""}>{task.title}</b><small>{task.category}{task.project?" · "+task.project:""}</small></div></div><div><span className={"priority-pill "+task.priority.toLowerCase()}><i/>{task.priority}</span></div><div><select className={"status-select "+task.status.toLowerCase().replaceAll(" ","-")} value={task.status} onChange={e=>updateStatus(task.id,e.target.value as Status)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div><div className={late?"due-date late":"due-date"}>{late?"! ":""}{new Date(task.due+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div><div className="assignees">{task.juniors.slice(0,3).map((j,i)=><span className={"avatar junior junior-"+(i+1)} title={j} key={j}>{initials(j)}</span>)}<span className="assignee-names">{task.juniors[0]||"Unassigned"}{task.juniors.length>1?" +"+(task.juniors.length-1):""}</span></div><div className="row-menu"><button className="icon-button" title="Prepare WhatsApp message" onClick={()=>whatsapp(task)}>↗</button></div></div>
}
function TaskCard({task,updateStatus,whatsapp}:{task:Task;updateStatus:(id:string,s:Status)=>void;whatsapp:(t:Task)=>void}){return <div className="kanban-card"><span className={"priority-pill "+task.priority.toLowerCase()}><i/>{task.priority}</span><h3>{task.title}</h3><p>{task.description}</p><div className="kanban-card-bottom"><span>◷ {task.due}</span><button className="icon-button" onClick={()=>whatsapp(task)} title="Prepare WhatsApp message">↗</button></div><select className={"status-select "+task.status.toLowerCase().replaceAll(" ","-")} value={task.status} onChange={e=>updateStatus(task.id,e.target.value as Status)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>}
