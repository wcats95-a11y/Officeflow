"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { supabase } from "../supabaseClient";

type Stroke = { points: Array<[number, number]>; color: string; width: number };
type Note = { id: string; note_date: string; title: string; typed_text: string; handwriting_text: string; strokes: Stroke[]; updated_at?: string };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const key = "officeflow-diary-notes-v1";
const empty = (date: string): Note => ({ id: crypto.randomUUID(), note_date: date, title: "", typed_text: "", handwriting_text: "", strokes: [] });
let handwritingReader: Promise<any> | null = null;
async function getHandwritingReader() {
  if (!handwritingReader) handwritingReader = import("@huggingface/transformers").then(({ pipeline, env }) => {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.backends.onnx.wasm.numThreads = 1;
    return pipeline("image-to-text", "Xenova/trocr-small-handwritten");
  }).catch(error => { handwritingReader = null; throw error; });
  return handwritingReader;
}

export default function DiaryNotes({ userId }: { userId?: string }) {
  const [notes,setNotes]=useState<Note[]>([]), [date,setDate]=useState(today), [query,setQuery]=useState(""), [activeId,setActiveId]=useState(""), [tool,setTool]=useState<"pen"|"eraser">("pen"), [saving,setSaving]=useState(false), [loaded,setLoaded]=useState(false), [ocrStatus,setOcrStatus]=useState("");
  const canvas=useRef<HTMLCanvasElement>(null), drawing=useRef(false), current=useRef<Stroke|null>(null), notesRef=useRef(notes);
  useEffect(()=>{ notesRef.current=notes; },[notes]);
  useEffect(()=>{ let alive=true; setLoaded(false);setNotes([]); (async()=>{ if(userId&&supabase){ const {data,error}=await supabase.from("officeflow_notes").select("id,note_date,title,typed_text,handwriting_text,strokes,updated_at").order("note_date",{ascending:false}); if(alive&&!error){setNotes((data||[]) as Note[]);setLoaded(true);return;} } try { const raw=localStorage.getItem(key); if(alive)setNotes(raw?JSON.parse(raw):[]); } catch{} if(alive)setLoaded(true); })(); return()=>{alive=false}; },[userId]);
  const active=notes.find(n=>n.id===activeId)||notes.find(n=>n.note_date===date)||null;
  const filtered=useMemo(()=>notes.filter(n=>(!query.trim()||`${n.title} ${n.typed_text} ${n.handwriting_text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&(!date||n.note_date===date||query.trim())),[notes,query,date]);
  const update=(id:string,change:Partial<Note>)=>setNotes(old=>old.map(n=>n.id===id?{...n,...change,updated_at:new Date().toISOString()}:n));
  const create=()=>{const n=empty(date);setNotes(old=>[n,...old]);setActiveId(n.id);};
  useEffect(()=>{if(!loaded)return;setSaving(true);const timer=setTimeout(async()=>{if(userId&&supabase){const n=notesRef.current;const {data:{user}}=await supabase.auth.getUser();if(user){const rows=n.map(({id,...r})=>({id,user_id:user.id,...r}));if(rows.length)await supabase.from("officeflow_notes").upsert(rows,{onConflict:"id"});} }else{try{localStorage.setItem(key,JSON.stringify(notesRef.current));}catch{}}setSaving(false);},650);return()=>clearTimeout(timer)},[notes,loaded,userId]);
  const draw=useCallback(()=>{const c=canvas.current;if(!c)return;const r=c.getBoundingClientRect(), dpr=window.devicePixelRatio||1;if(c.width!==Math.round(r.width*dpr)||c.height!==Math.round(r.height*dpr)){c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);}const ctx=c.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.strokeStyle="#dfe8e5";ctx.lineWidth=1;for(let y=48;y<r.height;y+=34){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(r.width,y);ctx.stroke();}ctx.strokeStyle="#b9d7cf";ctx.beginPath();ctx.moveTo(36,0);ctx.lineTo(36,r.height);ctx.stroke();for(const s of active?.strokes||[]){if(!s.points.length)continue;ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap="round";ctx.lineJoin="round";ctx.moveTo(s.points[0][0]*r.width,s.points[0][1]*r.height);for(const p of s.points.slice(1))ctx.lineTo(p[0]*r.width,p[1]*r.height);ctx.stroke();}},[active]);
  useEffect(()=>{draw();const c=canvas.current;if(!c)return;const ro=new ResizeObserver(draw);ro.observe(c);return()=>ro.disconnect()},[draw]);
  const point=(e:ReactPointerEvent<HTMLCanvasElement>):[number,number]=>{const r=e.currentTarget.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]};
  const start=(e:ReactPointerEvent<HTMLCanvasElement>)=>{if(!active)return;setOcrStatus(active.strokes.length?"Ink changed. Recognize handwriting again to refresh search words.":"");drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);current.current={points:[point(e)],color:tool==="eraser"?"#ffffff":"#173f36",width:tool==="eraser"?22:Math.max(1.5,(e.pressure||0.5)*3.3)};};
  const move=(e:ReactPointerEvent<HTMLCanvasElement>)=>{if(!drawing.current||!current.current||!active)return;current.current.points.push(point(e));const s=current.current;setNotes(old=>old.map(n=>n.id===active.id?{...n,strokes:[...n.strokes.slice(0,-1),s]}:n)); if(s.points.length===2)setNotes(old=>old.map(n=>n.id===active.id&&n.strokes.length===0?{...n,strokes:[s]}:n));};
  const end=()=>{drawing.current=false;current.current=null;};
  const recognizeHandwriting=useCallback(async(note:Note)=>{
    if(!note.strokes.length){setOcrStatus("Write something first, then I can recognize it.");return;}
    const canvasElement=canvas.current;if(!canvasElement)return;
    setOcrStatus("Preparing on-device handwriting search…");
    try{
      const reader=await getHandwritingReader();
      const lineGroups:Array<{y:number;strokes:Stroke[]}>=[];
      for(const stroke of note.strokes){if(!stroke.points.length)continue;const y=stroke.points.reduce((sum,p)=>sum+p[1],0)/stroke.points.length;let group=lineGroups.find(item=>Math.abs(item.y-y)<0.075);if(!group){group={y,strokes:[]};lineGroups.push(group);}group.strokes.push(stroke);group.y=(group.y*(group.strokes.length-1)+y)/group.strokes.length;}
      lineGroups.sort((a,b)=>a.y-b.y);
      const results:string[]=[];
      for(let i=0;i<lineGroups.length;i++){
        const strokes=lineGroups[i].strokes,points=strokes.flatMap(s=>s.points),w=canvasElement.clientWidth,h=canvasElement.clientHeight;
        const left=Math.max(0,Math.min(...points.map(p=>p[0]*w))-24),right=Math.min(w,Math.max(...points.map(p=>p[0]*w))+24),top=Math.max(0,Math.min(...points.map(p=>p[1]*h))-18),bottom=Math.min(h,Math.max(...points.map(p=>p[1]*h))+18);
        const crop=document.createElement("canvas");crop.width=Math.max(120,Math.ceil(right-left));crop.height=Math.max(52,Math.ceil(bottom-top));const ctx=crop.getContext("2d");if(!ctx)continue;ctx.fillStyle="#fff";ctx.fillRect(0,0,crop.width,crop.height);ctx.strokeStyle="#173f36";ctx.lineCap="round";ctx.lineJoin="round";
        for(const stroke of strokes){if(!stroke.points.length)continue;ctx.beginPath();ctx.strokeStyle=stroke.color;ctx.lineWidth=Math.max(2,stroke.width);ctx.moveTo(stroke.points[0][0]*w-left,stroke.points[0][1]*h-top);for(const p of stroke.points.slice(1))ctx.lineTo(p[0]*w-left,p[1]*h-top);ctx.stroke();}
        setOcrStatus(`Reading handwritten line ${i+1} of ${lineGroups.length}…`);
        const recognized=await reader(crop);const text=Array.isArray(recognized)?recognized.map((item:any)=>item.generated_text||"").join(" "):"";if(text.trim())results.push(text.trim());
      }
      const transcription=results.join("\n");update(note.id,{handwriting_text:transcription});setOcrStatus(transcription?"Handwriting indexed. Review the words below for accuracy.":"No handwriting was recognized. Try writing larger or darker.");
    }catch(error){console.error("On-device handwriting recognition failed",error);setOcrStatus("Could not start handwriting search. Check your connection and try again.");}
  },[]);
  const selected=active||filtered[0]||null;
  return <div className="notes-shell"><div className="notes-top"><div><span className="dashboard-kicker">DAILY DIARY</span><h3>Notes</h3><p>Write with a pen or type. Notes are saved by date and kept private to your account.</p></div><button className="primary-button" onClick={create}>＋ New note</button></div><div className="notes-filters"><label>Find by date<input type="date" value={date} onChange={e=>{setDate(e.target.value);setActiveId("")}}/></label><label className="notes-search">Search title and words<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search typed notes or indexed handwriting…"/></label><span className="notes-save">{saving?"Saving…":"Saved"}</span></div><div className="notes-layout"><aside className="notes-list"><div className="notes-list-head">{filtered.length} {filtered.length===1?"note":"notes"}</div>{filtered.map(n=><button key={n.id} className={`notes-list-item ${selected?.id===n.id?"selected":""}`} onClick={()=>{setActiveId(n.id);setDate(n.note_date)}}><b>{n.title||"Untitled note"}</b><time>{new Date(n.note_date+"T12:00:00").toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</time><span>{(n.typed_text||n.handwriting_text||"Handwritten note").slice(0,72)}</span></button>)}{!filtered.length&&<p className="notes-no-results">No notes found for this date or search.</p>}</aside>{selected?<section className="notes-editor"><div className="notes-editor-head"><input className="note-title" aria-label="Note title" placeholder="Give this note a title" maxLength={160} value={selected.title} onChange={e=>update(selected.id,{title:e.target.value})}/><input aria-label="Note date" type="date" value={selected.note_date} onChange={e=>{update(selected.id,{note_date:e.target.value});setDate(e.target.value)}}/></div><div className="notes-tools"><button className={tool==="pen"?"active":""} onClick={()=>setTool("pen")}>✎ Pen</button><button className={tool==="eraser"?"active":""} onClick={()=>setTool("eraser")}>⌫ Eraser</button><button onClick={()=>update(selected.id,{strokes:selected.strokes.slice(0,-1)})} disabled={!selected.strokes.length}>↶ Undo</button><button className="notes-ocr-button" onClick={()=>recognizeHandwriting(selected)} disabled={!selected.strokes.length}>⌕ Recognize handwriting</button><span>Write with a stylus or finger</span></div><canvas ref={canvas} className="notes-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/><div className="notes-ocr-info" aria-live="polite">{ocrStatus||"On-device recognition keeps your ink on this device. The first use downloads a handwriting model (about 64 MB); after that it is cached in your browser."}</div><div className="notes-text-grid"><label>Typed notes<textarea value={selected.typed_text} onChange={e=>update(selected.id,{typed_text:e.target.value})} placeholder="Add searchable typed notes…"/></label><label>Recognized handwriting · editable<textarea value={selected.handwriting_text} onChange={e=>update(selected.id,{handwriting_text:e.target.value})} placeholder="Recognized handwriting will appear here. You can correct it before searching…"/><small>Search uses the recognized text. Check and correct it if the handwriting model misreads a word.</small></label></div></section>:<section className="notes-empty"><span>✎</span><h3>Start a note for {new Date(date+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</h3><p>Your notes are grouped by date. Search titles, typed text, and recognized handwriting.</p><button className="primary-button" onClick={create}>＋ Create note</button></section>}</div></div>;
}
