"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { supabase } from "../supabaseClient";

type Point = [number, number, number?];
type Stroke = { points: Point[]; color: string; width: number };
type JournalPage = { id: string; typed_text: string; handwriting_text: string; strokes: Stroke[] };
type Journal = { id: string; note_date: string; title: string; pages: JournalPage[]; updated_at?: string };
const storageKey = "officeflow-diary-notes-v1";
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const makePage = (): JournalPage => ({ id: crypto.randomUUID(), typed_text: "", handwriting_text: "", strokes: [] });
const makeJournal = (date: string): Journal => ({ id: crypto.randomUUID(), note_date: date, title: "", pages: [makePage()] });
const normalizeJournal = (row: any): Journal => ({
  id: row.id, note_date: row.note_date, title: row.title || "",
  pages: Array.isArray(row.pages) && row.pages.length ? row.pages : [{ id: crypto.randomUUID(), typed_text: row.typed_text || "", handwriting_text: row.handwriting_text || "", strokes: Array.isArray(row.strokes) ? row.strokes : [] }],
  updated_at: row.updated_at,
});
let handwritingReader: Promise<any> | null = null;
async function getHandwritingReader() {
  if (!handwritingReader) handwritingReader = import("@huggingface/transformers").then(({ pipeline, env }) => {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
    return pipeline("image-to-text", "Xenova/trocr-small-handwritten");
  }).catch(error => { handwritingReader = null; throw error; });
  return handwritingReader;
}

export default function DiaryNotes({ userId, onClose }: { userId?: string; onClose: () => void }) {
  const [journals,setJournals]=useState<Journal[]>([]), [selectedDate,setSelectedDate]=useState(localDate), [activeId,setActiveId]=useState(""), [search,setSearch]=useState(""), [dateFilter,setDateFilter]=useState(""), [sidebarOpen,setSidebarOpen]=useState(false), [tool,setTool]=useState<"pen"|"eraser">("pen"), [penColor,setPenColor]=useState("#243f68"), [penWidth,setPenWidth]=useState(3.2), [lastInkPage,setLastInkPage]=useState(""), [saving,setSaving]=useState(false), [loaded,setLoaded]=useState(false), [ocrStatus,setOcrStatus]=useState(""), [saveError,setSaveError]=useState("");
  const accountStorageKey=userId?`${storageKey}:user:${userId}`:`${storageKey}:local`;
  const canvasRefs=useRef(new Map<string,HTMLCanvasElement>()), activeStroke=useRef<{journalId:string;pageId:string;stroke:Stroke}|null>(null), journalsRef=useRef(journals);
  useEffect(()=>{journalsRef.current=journals},[journals]);

  useEffect(()=>{let alive=true;setLoaded(false);setJournals([]);setActiveId("");setSaveError("");(async()=>{
    if(userId&&supabase){
      const {data,error}=await supabase.from("officeflow_notes").select("id,note_date,title,typed_text,handwriting_text,strokes,pages,updated_at").order("note_date",{ascending:false});
      if(!alive)return;
      if(!error){setJournals((data||[]).map(normalizeJournal));setLoaded(true);return;}
      setSaveError("Cloud journal could not be loaded. Showing only this account's local recovery copy.");
    }
    try{const raw=localStorage.getItem(accountStorageKey);if(alive)setJournals(raw?(JSON.parse(raw) as any[]).map(normalizeJournal):[])}catch{if(alive)setSaveError("The local journal recovery copy could not be read.");}
    if(alive)setLoaded(true);
  })();return()=>{alive=false}},[userId,accountStorageKey]);

  const active=journals.find(j=>j.id===activeId)||journals.find(j=>j.note_date===selectedDate)||null;
  const filtered=useMemo(()=>journals.filter(j=>{
    const matchesDate=!dateFilter||j.note_date===dateFilter;
    const haystack=`${j.title} ${j.pages.map(p=>`${p.typed_text} ${p.handwriting_text}`).join(" ")}`.toLocaleLowerCase();
    return matchesDate&&(!search.trim()||haystack.includes(search.trim().toLocaleLowerCase()));
  }).sort((a,b)=>b.note_date.localeCompare(a.note_date)),[journals,search,dateFilter]);
  const updateJournal=(id:string,change:Partial<Journal>)=>setJournals(old=>old.map(j=>j.id===id?{...j,...change,updated_at:new Date().toISOString()}:j));
  const updatePage=(journalId:string,pageId:string,change:Partial<JournalPage>)=>setJournals(old=>old.map(j=>j.id===journalId?{...j,pages:j.pages.map(p=>p.id===pageId?{...p,...change}:p),updated_at:new Date().toISOString()}:j));
  const openJournal=(j:Journal)=>{setSelectedDate(j.note_date);setActiveId(j.id);setOcrStatus("");setSidebarOpen(false)};
  const createOrOpenToday=()=>{const j=journals.find(x=>x.note_date===selectedDate);if(j){openJournal(j);return;}const fresh=makeJournal(selectedDate);setJournals(old=>[fresh,...old]);setActiveId(fresh.id);setOcrStatus("");};
  const addPage=()=>{if(!active)return;const page=makePage();updateJournal(active.id,{pages:[...active.pages,page]});setOcrStatus("");requestAnimationFrame(()=>document.getElementById(`journal-page-${page.id}`)?.scrollIntoView({behavior:"smooth",block:"start"}));};

  useEffect(()=>{if(!loaded)return;setSaving(true);const timer=setTimeout(async()=>{
    const current=journalsRef.current;
    const rows=current.map(j=>({id:j.id,user_id:userId,note_date:j.note_date,title:j.title,pages:j.pages,typed_text:j.pages.map(p=>p.typed_text).join("\n").slice(0,20000),handwriting_text:j.pages.map(p=>p.handwriting_text).join("\n").slice(0,20000),strokes:j.pages[0]?.strokes||[],updated_at:j.updated_at||new Date().toISOString()}));
    let localCacheSaved=true;
    try{localStorage.setItem(accountStorageKey,JSON.stringify(current));}catch{localCacheSaved=false;}
    if(userId&&supabase&&rows.length===0&&saveError){setSaving(false);return;}
    try{
      if(userId&&supabase&&rows.length){const {error}=await supabase.from("officeflow_notes").upsert(rows,{onConflict:"id"});if(error)throw error;}
      if(!localCacheSaved)setSaveError(userId&&supabase?"Cloud saved; this browser could not keep a recovery copy.":"Local journal save failed. Copy your latest notes before leaving.");
      else setSaveError("");
    }catch(error){
      setSaveError(localCacheSaved?"Cloud save failed. Changes are retained in this account's local recovery copy; retry after reconnecting.":"Cloud and local recovery saves failed. Keep this page open and copy your latest notes before leaving.");
    }finally{setSaving(false);}
  },650);return()=>clearTimeout(timer)},[journals,loaded,userId,accountStorageKey,saveError]);

  const drawPage=useCallback((page:JournalPage,canvas:HTMLCanvasElement)=>{
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=window.devicePixelRatio||1;
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
    const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#fffefa";ctx.fillRect(0,0,rect.width,rect.height);
    ctx.strokeStyle="#e4edf2";ctx.lineWidth=1;for(let y=58;y<rect.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(rect.width,y);ctx.stroke();}
    ctx.strokeStyle="#f0c8c5";ctx.beginPath();ctx.moveTo(54,0);ctx.lineTo(54,rect.height);ctx.stroke();
    for(const stroke of page.strokes){if(!stroke.points.length)continue;ctx.lineCap="round";ctx.lineJoin="round";
      if(stroke.points.length===1){const p=stroke.points[0];ctx.beginPath();ctx.fillStyle=stroke.color;ctx.arc(p[0]*rect.width,p[1]*rect.height,Math.max(1,stroke.width*(.55+(p[2]||.5)*.8)/2),0,Math.PI*2);ctx.fill();continue;}
      for(let i=1;i<stroke.points.length;i++){const a=stroke.points[i-1],b=stroke.points[i];ctx.beginPath();ctx.strokeStyle=stroke.color;ctx.lineWidth=Math.max(.8,stroke.width*(.5+(((a[2]||.5)+(b[2]||.5))/2)*1.15));ctx.moveTo(a[0]*rect.width,a[1]*rect.height);ctx.lineTo(b[0]*rect.width,b[1]*rect.height);ctx.stroke();}
    }
  },[]);
  useEffect(()=>{if(!active)return;for(const page of active.pages){const canvas=canvasRefs.current.get(page.id);if(canvas)drawPage(page,canvas);}const resize=new ResizeObserver(()=>{for(const page of active.pages){const c=canvasRefs.current.get(page.id);if(c)drawPage(page,c);}});for(const page of active.pages){const c=canvasRefs.current.get(page.id);if(c)resize.observe(c);}return()=>resize.disconnect()},[active,drawPage]);

  const pointerPoint=(e:ReactPointerEvent<HTMLCanvasElement>):Point=>{const r=e.currentTarget.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,e.pointerType==="pen"?e.pressure:.5]};
  const startStroke=(journalId:string,page:JournalPage,e:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(e.pointerType==="touch")return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const point=pointerPoint(e),stroke:Stroke={points:[point],color:tool==="eraser"?"#fffefa":penColor,width:tool==="eraser"?24:penWidth};activeStroke.current={journalId,pageId:page.id,stroke};setLastInkPage(page.id);
    const ctx=e.currentTarget.getContext("2d"),r=e.currentTarget.getBoundingClientRect();if(ctx){ctx.beginPath();ctx.fillStyle=stroke.color;ctx.arc(point[0]*r.width,point[1]*r.height,stroke.width/2,0,Math.PI*2);ctx.fill();}
    if(page.strokes.length)setOcrStatus("Ink changed. Recognize handwriting again to refresh search.");
  };
  const moveStroke=(e:ReactPointerEvent<HTMLCanvasElement>)=>{
    const activeInk=activeStroke.current;if(!activeInk)return;e.preventDefault();const stroke=activeInk.stroke,ctx=e.currentTarget.getContext("2d"),r=e.currentTarget.getBoundingClientRect(),samples=e.nativeEvent.getCoalescedEvents?.()||[e.nativeEvent];
    for(const sample of samples){const next:Point=[(sample.clientX-r.left)/r.width,(sample.clientY-r.top)/r.height,sample.pointerType==="pen"?sample.pressure:.5],previous=stroke.points[stroke.points.length-1];stroke.points.push(next);if(ctx){ctx.beginPath();ctx.strokeStyle=stroke.color;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=Math.max(1,stroke.width*(.5+((previous[2]||.5)+(next[2]||.5))/2*1.15));ctx.moveTo(previous[0]*r.width,previous[1]*r.height);ctx.lineTo(next[0]*r.width,next[1]*r.height);ctx.stroke();}}
  };
  const finishStroke=()=>{const finished=activeStroke.current;if(!finished)return;activeStroke.current=null;setJournals(old=>old.map(j=>j.id===finished.journalId?{...j,pages:j.pages.map(p=>p.id===finished.pageId?{...p,strokes:[...p.strokes,finished.stroke]}:p),updated_at:new Date().toISOString()}:j));};

  const recognizeJournal=useCallback(async(note:Journal)=>{
    if(!note.pages.some(p=>p.strokes.length)){setOcrStatus("Write something first, then choose Recognize ink.");return;}
    setOcrStatus("Preparing on-device handwriting search…");
    try{const reader=await getHandwritingReader(),recognizedPages:JournalPage[]=[];
      for(let pIndex=0;pIndex<note.pages.length;pIndex++){
        const page=note.pages[pIndex],paper=canvasRefs.current.get(page.id);if(!paper){recognizedPages.push(page);continue;}const width=paper.clientWidth,height=paper.clientHeight;
        const groups:Array<{y:number;strokes:Stroke[]}>=[];
        for(const stroke of page.strokes){if(!stroke.points.length)continue;const y=stroke.points.reduce((n,p)=>n+p[1],0)/stroke.points.length;let g=groups.find(x=>Math.abs(x.y-y)<.075);if(!g){g={y,strokes:[]};groups.push(g);}g.strokes.push(stroke);g.y=(g.y*(g.strokes.length-1)+y)/g.strokes.length;}
        groups.sort((a,b)=>a.y-b.y);const words:string[]=[];
        for(let i=0;i<groups.length;i++){
          const strokes=groups[i].strokes,points=strokes.flatMap(s=>s.points);const left=Math.max(0,Math.min(...points.map(p=>p[0]*width))-24),right=Math.min(width,Math.max(...points.map(p=>p[0]*width))+24),top=Math.max(0,Math.min(...points.map(p=>p[1]*height))-18),bottom=Math.min(height,Math.max(...points.map(p=>p[1]*height))+18);
          const crop=document.createElement("canvas");crop.width=Math.max(120,Math.ceil(right-left));crop.height=Math.max(52,Math.ceil(bottom-top));const ctx=crop.getContext("2d");if(!ctx)continue;ctx.fillStyle="#fff";ctx.fillRect(0,0,crop.width,crop.height);
          for(const stroke of strokes){if(!stroke.points.length)continue;ctx.beginPath();ctx.strokeStyle=stroke.color;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=stroke.width;ctx.moveTo(stroke.points[0][0]*width-left,stroke.points[0][1]*height-top);for(const point of stroke.points.slice(1))ctx.lineTo(point[0]*width-left,point[1]*height-top);ctx.stroke();}
          setOcrStatus(`Reading page ${pIndex+1} · line ${i+1} of ${groups.length}…`);const result=await reader(crop);const line=Array.isArray(result)?result.map((item:any)=>item.generated_text||"").join(" "):"";if(line.trim())words.push(line.trim());
        }
        recognizedPages.push({...page,handwriting_text:words.join("\n")});
      }
      updateJournal(note.id,{pages:recognizedPages});setOcrStatus("Ink indexed. Review recognized text on each page and correct any misread words.");
    }catch(error){console.error("On-device handwriting recognition failed",error);setOcrStatus("Could not start handwriting search. Check your connection and try again.");}
  },[]);

  return <div className="journal-fullscreen">
    <header className="journal-topbar"><div className="journal-brand"><span className="journal-brand-mark">✎</span><span><b>Daily journal</b><small>{saving?"Saving changes…":saveError||"All changes saved"}</small></span></div><div className="journal-top-actions"><button className="journal-panel-toggle" onClick={()=>setSidebarOpen(v=>!v)} aria-label="Show journal list">☰ <span>Journal list</span></button><button className="journal-close" onClick={onClose}>Done <span>✓</span></button></div></header>
    <div className="journal-frame">
      {sidebarOpen&&<aside className="journal-sidebar"><div className="journal-sidebar-heading"><div><span>YOUR JOURNAL</span><b>By date</b></div><button onClick={()=>setSidebarOpen(false)} aria-label="Hide journal list">×</button></div><label className="journal-search">Search words<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a word or phrase"/></label><label className="journal-date-filter">Jump to date<input type="date" value={dateFilter} onChange={e=>{const next=e.target.value;setDateFilter(next);if(!next)return;setSelectedDate(next);const match=journals.find(j=>j.note_date===next);if(match)openJournal(match);else setActiveId("")}}/></label><button className="journal-today" onClick={createOrOpenToday}>＋ Start journal for selected date</button><div className="journal-date-list">{filtered.map(j=><button key={j.id} className={`journal-date-card ${active?.id===j.id?"selected":""}`} onClick={()=>openJournal(j)}><time>{new Date(j.note_date+"T12:00:00").toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</time><b>{j.title||"Daily entry"}</b><small>{j.pages.length} {j.pages.length===1?"page":"pages"} · {(j.pages.map(p=>`${p.typed_text} ${p.handwriting_text}`).join(" ").trim().slice(0,58))||"No text preview"}</small></button>)}{!filtered.length&&<p className="journal-no-results">No journals match this date or search.</p>}</div>{active&&<div className="journal-page-strip"><div className="journal-strip-heading">PAGES IN THIS JOURNAL</div>{active.pages.map((page,index)=><button key={page.id} className="journal-strip-page" onClick={()=>document.getElementById(`journal-page-${page.id}`)?.scrollIntoView({behavior:"smooth",block:"start"})}><span>{String(index+1).padStart(2,"0")}</span><b>Page {index+1}</b><small>{(page.typed_text||page.handwriting_text||"Blank page").slice(0,38)}</small></button>)}<button className="journal-strip-add" onClick={addPage}>＋ Add page</button></div>}</aside>}
      <main className={`journal-writing ${sidebarOpen?"with-sidebar":""}`}>
        {!loaded?<section className="journal-welcome"><span className="journal-welcome-icon">✎</span><p>Opening your journal…</p></section>:active?<>
          <div className="journal-entry-heading"><div className="journal-date-label">{new Date(active.note_date+"T12:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><input aria-label="Journal title" className="journal-title-input" maxLength={160} placeholder="Give today a title, or start writing…" value={active.title} onChange={e=>updateJournal(active.id,{title:e.target.value})}/><input className="journal-date-input" aria-label="Journal date" type="date" value={active.note_date} onChange={e=>{const next=e.target.value;if(journals.some(j=>j.id!==active.id&&j.note_date===next)){setOcrStatus("There is already a journal for that date. Open it from the date list.");return;}updateJournal(active.id,{note_date:next});setSelectedDate(next)}}/></div>
          <div className="journal-toolbar"><button className={tool==="pen"?"chosen":""} onClick={()=>setTool("pen")}>✎ <span>Pen</span></button>{tool==="pen"&&<><div className="journal-colors" aria-label="Pen colour">{["#243f68","#222b29","#356b54","#934d48"].map(color=><button key={color} className={penColor===color?"selected":""} style={{backgroundColor:color}} aria-label={`Choose ${color} ink`} onClick={()=>setPenColor(color)}/>)}</div><select className="journal-pen-width" aria-label="Pen size" value={penWidth} onChange={e=>setPenWidth(Number(e.target.value))}><option value={2.4}>Fine</option><option value={3.2}>Regular</option><option value={4.2}>Bold</option></select></>}<button className={tool==="eraser"?"chosen":""} onClick={()=>setTool("eraser")}>⌫ <span>Eraser</span></button><button onClick={()=>{const page=active.pages.find(p=>p.id===lastInkPage)||active.pages.at(-1);if(page)updatePage(active.id,page.id,{strokes:page.strokes.slice(0,-1)});}} disabled={!active.pages.some(p=>p.strokes.length)}>↶ <span>Undo</span></button><button className="journal-recognize" onClick={()=>recognizeJournal(active)} disabled={!active.pages.some(p=>p.strokes.length)}>⌕ <span>Recognize ink</span></button><span className="journal-tool-spacer"/><span className="journal-page-count">{active.pages.length} {active.pages.length===1?"page":"pages"}</span></div>
          <div className="journal-ink-hint" aria-live="polite">{ocrStatus||"Write with your stylus, or type below each page. Choose Recognize ink to make handwriting searchable; the first use downloads a model to this browser."}</div>
          <div className="journal-pages">{active.pages.map((page,index)=><section className="journal-page" id={`journal-page-${page.id}`} key={page.id}><div className="journal-page-label"><span>PAGE {String(index+1).padStart(2,"0")}</span></div><canvas ref={element=>{if(element){canvasRefs.current.set(page.id,element);drawPage(page,element);}else canvasRefs.current.delete(page.id)}} className="journal-canvas" onPointerDown={e=>startStroke(active.id,page,e)} onPointerMove={moveStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke}/><textarea className="journal-page-typing" value={page.typed_text} onChange={e=>updatePage(active.id,page.id,{typed_text:e.target.value})} placeholder="Type on this page…" aria-label={`Typed text for page ${index+1}`}/>{page.handwriting_text&&<details className="journal-recognized"><summary>Recognized handwriting · editable</summary><textarea value={page.handwriting_text} onChange={e=>updatePage(active.id,page.id,{handwriting_text:e.target.value})} aria-label={`Recognized handwriting for page ${index+1}`}/></details>}</section>)}<button className="journal-add-page" onClick={addPage}>＋ Add another page</button></div>
          <div className="journal-footer-hint">The page continues below. Add another page whenever you need more room.</div>
        </>:<section className="journal-welcome"><span className="journal-welcome-icon">✎</span><div className="journal-date-label">{new Date(selectedDate+"T12:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><h1>A page for today.</h1><p>Write freely. Your journal grows with you, page by page.</p><button className="journal-start-button" onClick={createOrOpenToday}>Start today’s journal</button><button className="journal-browse-button" onClick={()=>setSidebarOpen(true)}>Open another date</button></section>}
      </main>
    </div>
  </div>;
}
