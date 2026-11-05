"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabaseClient";
import { buildJournalPdf } from "../lib/journal-pdf";

type Point = [number, number, number?];
type Stroke = { id?: string; points: Point[]; color: string; width: number; erase?: boolean; shape?: "rectangle" | "ellipse" | "line" };
type JournalTool = "pen" | "eraser" | "select" | "rectangle" | "ellipse" | "line";
type JournalTodo = { id: string; line: number; checked: boolean };
type JournalPage = { id: string; typed_text: string; handwriting_text: string; strokes: Stroke[]; todos: JournalTodo[] };
type Journal = { id: string; note_date: string; title: string; pages: JournalPage[]; finalized_at?: string | null; updated_at?: string };
const JOURNAL_LINE_STEP = 40;
const JOURNAL_TODO_ROW_CENTER = 78;
const storageKey = "officeflow-diary-notes-v1";
const indiaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const makePage = (): JournalPage => ({ id: crypto.randomUUID(), typed_text: "", handwriting_text: "", strokes: [], todos: [] });
const makeJournal = (date: string): Journal => ({ id: crypto.randomUUID(), note_date: date, title: "", pages: [makePage()] });
const isLegacyEraser = (stroke: Stroke) => stroke.erase === true || stroke.color.toLowerCase() === "#fffefa" || stroke.color.toLowerCase() === "#ffffff";
const normalizeJournal = (row: any): Journal => ({
  id: String(row.id || crypto.randomUUID()), note_date: String(row.note_date || indiaDate()), title: row.title || "", finalized_at: row.finalized_at || null,
  pages: Array.isArray(row.pages) && row.pages.length ? row.pages.map((page: any, index: number) => ({
    id: String(page.id || crypto.randomUUID()), typed_text: String(page.typed_text || ""), handwriting_text: String(page.handwriting_text || ""),
    strokes: Array.isArray(page.strokes) ? page.strokes.filter((stroke: any) => Array.isArray(stroke.points) && typeof stroke.color === "string").map((stroke: any) => ({ ...stroke, id: String(stroke.id || crypto.randomUUID()), erase: isLegacyEraser(stroke) })) : [],
    todos: Array.isArray(page.todos) ? page.todos.filter((todo: any) => todo && typeof todo === "object").map((todo: any, todoIndex: number) => ({ id: String(todo.id || crypto.randomUUID()), line: Number.isFinite(todo.line) && todo.line >= 0 ? todo.line : todoIndex, checked: Boolean(todo.checked) })) : [],
  })) : [{ id: crypto.randomUUID(), typed_text: row.typed_text || "", handwriting_text: row.handwriting_text || "", strokes: (Array.isArray(row.strokes) ? row.strokes : []).map((stroke: Stroke) => ({ ...stroke, erase: isLegacyEraser(stroke) })), todos: [] }],
  updated_at: row.updated_at,
});

export default function DiaryNotes({ userId, onClose }: { userId?: string; onClose: () => void }) {
  const accountStorageKey = userId ? `${storageKey}:user:${userId}` : `${storageKey}:local`;
  const [mounted, setMounted] = useState(false);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [selectedDate, setSelectedDate] = useState(indiaDate);
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tool, setTool] = useState<JournalTool>("pen");
  const [penColor, setPenColor] = useState("#243f68");
  const [penWidth, setPenWidth] = useState(3.2);
  const [lastInkPage, setLastInkPage] = useState("");
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [saveError, setSaveError] = useState("");
  const [retrySave, setRetrySave] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryLoad, setRetryLoad] = useState(0);
  const [dateConflictId, setDateConflictId] = useState("");
  const [uiMessage, setUiMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [today, setToday] = useState(indiaDate);
  const [bookPageIndex, setBookPageIndex] = useState(0);
  const [pageFlip, setPageFlip] = useState<"next" | "previous" | "">("");
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);
  const canvasRefs = useRef(new Map<string, HTMLCanvasElement>());
  const canvasRefCallbacks = useRef(new Map<string, (element: HTMLCanvasElement | null) => void>());
  const renderedStrokeSets = useRef(new Map<string, Stroke[]>());
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const activeStroke = useRef<{ journalId: string; pageId: string; stroke: Stroke; mode: "draw" | "move"; startPoint?: Point; originals?: Stroke[]; previewStrokes?: Stroke[] } | null>(null);
  const journalsRef = useRef(journals);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const canvasRefFor = (pageId: string) => {
    let callback = canvasRefCallbacks.current.get(pageId);
    if (!callback) {
      callback = element => {
        if (element) {
          element.dataset.journalPageId = pageId;
          canvasRefs.current.set(pageId, element);
        }
        else {
          canvasRefs.current.delete(pageId);
          renderedStrokeSets.current.delete(pageId);
        }
      };
      canvasRefCallbacks.current.set(pageId, callback);
    }
    return callback;
  };

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { journalsRef.current = journals; }, [journals]);
  useEffect(() => { const timer = window.setInterval(() => setToday(indiaDate()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => { if (pdfViewer?.url) URL.revokeObjectURL(pdfViewer.url); }, [pdfViewer?.url]);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setLoadError(false);
    setJournals([]);
    setActiveId("");
    (async () => {
      if (userId && supabase) {
        const { data, error } = await supabase.from("officeflow_notes").select("id,note_date,title,typed_text,handwriting_text,strokes,pages,finalized_at,updated_at").order("note_date", { ascending: false });
        if (alive && !error) {
          const loadedJournals = (data || []).map(normalizeJournal).map(journal => journal.note_date < indiaDate() ? { ...journal, finalized_at: journal.finalized_at || new Date().toISOString() } : journal);
          setJournals(loadedJournals);
          const legacyPast = loadedJournals.filter(journal => journal.note_date < indiaDate() && !data?.find(row => row.id === journal.id)?.finalized_at).map(journal => journal.id);
          if (legacyPast.length) void supabase.from("officeflow_notes").update({ finalized_at: new Date().toISOString() }).in("id", legacyPast).is("finalized_at", null);
          setLoaded(true);
          return;
        }
        if (alive && error) {
          setUiMessage("Could not load your cloud journal. Retry before editing so saved entries are not overwritten.");
          setLoadError(true);
          setLoaded(true);
          return;
        }
      }
      try {
        const raw = localStorage.getItem(accountStorageKey);
        if (alive) setJournals(raw ? (JSON.parse(raw) as any[]).map(normalizeJournal).map(journal => journal.note_date < indiaDate() ? { ...journal, finalized_at: journal.finalized_at || new Date().toISOString() } : journal) : []);
      } catch {
        if (alive) setUiMessage("This browser could not read its saved journal data.");
      }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [userId, accountStorageKey, retryLoad]);

  const active = journals.find(journal => journal.id === activeId) || journals.find(journal => journal.note_date === selectedDate) || null;
  const activePageKey = active?.pages.map(page => page.id).join("|") || "";
  const activeIsLocked = Boolean(active && (active.finalized_at || active.note_date < today));
  const filtered = useMemo(() => journals.filter(journal => {
    const matchesDate = !dateFilter || journal.note_date === dateFilter;
    const haystack = `${journal.title} ${journal.pages.map(page => `${page.typed_text} ${page.handwriting_text}`).join(" ")}`.toLocaleLowerCase();
    return matchesDate && (!search.trim() || haystack.includes(search.trim().toLocaleLowerCase()));
  }).sort((a, b) => b.note_date.localeCompare(a.note_date)), [journals, search, dateFilter]);

  const journalPdf = (journal: Journal) => {
    const bytes = buildJournalPdf(journal);
    const pdfBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(pdfBuffer).set(bytes);
    const name = `${journal.note_date}${journal.title ? `-${journal.title}` : "-journal"}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "-");
    return { blob: new Blob([pdfBuffer], { type: "application/pdf" }), name };
  };
  const showJournalPdf = (journal: Journal) => {
    const { blob, name } = journalPdf(journal);
    setPdfViewer({ url: URL.createObjectURL(blob), name });
  };
  const downloadJournalPdf = (journal: Journal) => {
    const { blob, name } = journalPdf(journal);
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const shareJournalPdf = async (journal: Journal) => {
    const { blob, name } = journalPdf(journal);
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: journal.title || "Daily journal", text: `Journal for ${journal.note_date}` }); }
      catch (error) { if (error instanceof Error && error.name !== "AbortError") setUiMessage("Could not open the share sheet. You can export the PDF instead."); }
      return;
    }
    downloadJournalPdf(journal);
    setUiMessage("PDF downloaded. Use your device’s share menu to send it.");
  };
  const deleteJournal = async (journal: Journal) => {
    if (!window.confirm(`Delete the journal for ${journal.note_date}${journal.title ? ` · ${journal.title}` : ""}? This cannot be undone.`)) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    ++saveVersionRef.current;
    try {
      await saveQueueRef.current;
      if (userId && supabase) {
        const { error } = await supabase.from("officeflow_notes").delete().eq("id", journal.id).eq("user_id", userId);
        if (error) throw error;
      }
      const next = journalsRef.current.filter(item => item.id !== journal.id);
      journalsRef.current = next;
      setJournals(next);
      if (activeId === journal.id) { setActiveId(""); setSelectedStrokeIds([]); setLastInkPage(""); }
      if (pdfViewer) setPdfViewer(null);
      setUiMessage("Journal deleted.");
    } catch (error) {
      setUiMessage(error instanceof Error ? `Could not delete this journal: ${error.message}` : "Could not delete this journal.");
    }
  };
  const updateJournal = (id: string, change: Partial<Journal>) => {
    const journal = journalsRef.current.find(item => item.id === id);
    if (journal && (journal.finalized_at || journal.note_date < today)) { setUiMessage("This day is closed. Open its PDF from the journal list to read it."); return; }
    setJournals(old => old.map(item => item.id === id ? { ...item, ...change, updated_at: new Date().toISOString() } : item));
  };
  const updatePage = (journalId: string, pageId: string, change: Partial<JournalPage>) => {
    const journal = journalsRef.current.find(item => item.id === journalId);
    if (journal && (journal.finalized_at || journal.note_date < today)) { setUiMessage("This day is closed. Its journal is read-only."); return; }
    setJournals(old => old.map(item => item.id === journalId ? { ...item, pages: item.pages.map(page => page.id === pageId ? { ...page, ...change } : page), updated_at: new Date().toISOString() } : item));
  };
  const openJournal = (journal: Journal) => {
    if (journal.finalized_at || journal.note_date < today) { setSelectedDate(journal.note_date); setSidebarOpen(false); setUiMessage(""); showJournalPdf(journal); return; }
    setPdfViewer(null); setSelectedDate(journal.note_date); setActiveId(journal.id); setUiMessage(""); setDateConflictId(""); setSidebarOpen(false); setBookPageIndex(0);
  };
  const createOrOpenDate = (date = selectedDate) => {
    const existing = journals.find(journal => journal.note_date === date);
    if (existing) { openJournal(existing); return; }
    if (date < today) { setUiMessage("Past days open as read-only PDFs. You can write in today’s and future journals."); return; }
    const fresh = makeJournal(date);
    setJournals(old => [fresh, ...old]);
    setActiveId(fresh.id);
    setSelectedDate(date);
    setUiMessage("");
  };

  const persistJournals = useCallback((items: Journal[], finalizeIds: string[] = []) => {
    const persist = async () => {
      const rows = items.filter(journal => (journal.note_date >= indiaDate() && !journal.finalized_at) || finalizeIds.includes(journal.id)).map(journal => ({
        id: journal.id, user_id: userId, note_date: journal.note_date, title: journal.title, pages: journal.pages,
        typed_text: journal.pages.map(page => page.typed_text).join("\n").slice(0, 20000),
        handwriting_text: journal.pages.map(page => page.handwriting_text).join("\n").slice(0, 20000),
        strokes: journal.pages[0]?.strokes || [], finalized_at: journal.finalized_at || null, updated_at: journal.updated_at || new Date().toISOString(),
      }));
      if (userId && supabase) {
        if (!rows.length) return;
        const { error } = await supabase.from("officeflow_notes").upsert(rows, { onConflict: "id" });
        if (error) throw new Error(`Cloud save failed: ${error.message}`);
        return;
      }
      localStorage.setItem(accountStorageKey, JSON.stringify(items));
    };
    const queued = saveQueueRef.current.then(persist, persist);
    saveQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, [userId, accountStorageKey]);

  const finalizeJournal = async (journal: Journal, automatic = false) => {
    if (journal.finalized_at || journal.note_date < today) { showJournalPdf(journal); return; }
    if (journal.note_date > today) { setUiMessage("Future journals stay editable until their day ends."); return; }
    const hasContent = Boolean(journal.title.trim() || journal.pages.some(page => page.typed_text.trim() || page.strokes.length || page.todos.length));
    if (!hasContent) { setUiMessage("Add a title or some writing before ending the day."); return; }
    if (!automatic && !window.confirm("End this journal day? It will become a read-only PDF and cannot be edited afterward.")) return;
    const finalized = { ...journal, finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const next = journalsRef.current.map(item => item.id === journal.id ? finalized : item);
    setJournals(next);
    try {
      await persistJournals(next, [journal.id]);
      showJournalPdf(finalized);
      setUiMessage("");
    } catch (error) {
      setJournals(journalsRef.current.map(item => item.id === journal.id ? journal : item));
      setSaveError(error instanceof Error ? error.message : "Could not end this journal day.");
      setSaveState("error");
    }
  };

  useEffect(() => {
    if (!loaded) return;
    const expired = journalsRef.current.filter(journal => journal.note_date < today && !journal.finalized_at);
    if (!expired.length) return;
    const stamp = new Date().toISOString();
    const ids = expired.map(journal => journal.id);
    const next = journalsRef.current.map(journal => ids.includes(journal.id) ? { ...journal, finalized_at: stamp, updated_at: stamp } : journal);
    setJournals(next);
    void persistJournals(next, ids).then(() => {
      const previouslyOpen = next.find(journal => journal.id === activeId);
      if (previouslyOpen && ids.includes(previouslyOpen.id)) showJournalPdf(previouslyOpen);
    }).catch(error => { setSaveState("error"); setSaveError(error instanceof Error ? error.message : "Could not archive yesterday’s journal."); });
  }, [today, loaded, activeId, persistJournals]);

  useEffect(() => {
    if (!loaded || loadError) return;
    setSaveState("saving");
    setSaveError("");
    const version = ++saveVersionRef.current;
    const timer = setTimeout(async () => {
      try {
        await persistJournals(journalsRef.current);
        if (version === saveVersionRef.current) setSaveState("saved");
      } catch (error) {
        if (version === saveVersionRef.current) {
          setSaveState("error");
          setSaveError(error instanceof Error ? error.message : "Could not save this journal.");
        }
      }
    }, 650);
    saveTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [journals, loaded, loadError, persistJournals, retrySave]);

  const saveBeforeClose = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const version = ++saveVersionRef.current;
    setSaveState("saving");
    setSaveError("");
    try {
      await persistJournals(journalsRef.current);
      if (version === saveVersionRef.current) {
        setSaveState("saved");
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
        onCloseRef.current();
      }
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Could not save this journal. Your edits are still here.");
    }
  };

  const drawPage = useCallback((page: JournalPage, canvas: HTMLCanvasElement, previewStroke?: Stroke) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, isFullscreen ? 1.5 : 2);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const drawStroke = (stroke: Stroke) => {
      if (!stroke.points.length) return;
      ctx.globalCompositeOperation = isLegacyEraser(stroke) ? "destination-out" : "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(0.8, stroke.width);
      if (stroke.shape && stroke.points.length >= 2) {
        const [first, last] = [stroke.points[0], stroke.points.at(-1)!];
        const x1 = first[0] * rect.width, y1 = first[1] * rect.height;
        const x2 = last[0] * rect.width, y2 = last[1] * rect.height;
        ctx.beginPath(); ctx.strokeStyle = stroke.color;
        if (stroke.shape === "line") { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
        else if (stroke.shape === "rectangle") ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        else ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(0.5, Math.abs(x2 - x1) / 2), Math.max(0.5, Math.abs(y2 - y1) / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        return;
      }
      if (stroke.points.length === 1) {
        const point = stroke.points[0];
        ctx.beginPath();
        ctx.fillStyle = stroke.color;
        ctx.arc(point[0] * rect.width, point[1] * rect.height, Math.max(1, stroke.width * (0.55 + (point[2] || 0.5) * 0.8) / 2), 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      const averagePressure = stroke.points.reduce((sum, point) => sum + (point[2] ?? 0.5), 0) / stroke.points.length;
      ctx.lineWidth = Math.max(0.8, stroke.width * (0.5 + averagePressure * 1.15));
      ctx.moveTo(stroke.points[0][0] * rect.width, stroke.points[0][1] * rect.height);
      for (let index = 1; index < stroke.points.length - 1; index++) {
        const point = stroke.points[index], next = stroke.points[index + 1];
        ctx.quadraticCurveTo(point[0] * rect.width, point[1] * rect.height, ((point[0] + next[0]) / 2) * rect.width, ((point[1] + next[1]) / 2) * rect.height);
      }
      const last = stroke.points.at(-1)!;
      ctx.lineTo(last[0] * rect.width, last[1] * rect.height);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    };
    for (const stroke of page.strokes) drawStroke(stroke);
    if (previewStroke && !page.strokes.some(stroke => stroke.id && stroke.id === previewStroke.id)) drawStroke(previewStroke);
    const selected = selectedStrokeIds.length ? page.strokes.filter(stroke => stroke.id && selectedStrokeIds.includes(stroke.id)) : [];
    if (selected.length) {
      const points = selected.flatMap(stroke => stroke.points);
      const xs = points.map(point => point[0] * rect.width), ys = points.map(point => point[1] * rect.height);
      ctx.globalCompositeOperation = "source-over"; ctx.save(); ctx.strokeStyle = "#16856a"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.max(1, Math.min(...xs) - 8), Math.max(1, Math.min(...ys) - 8), Math.min(rect.width - 2, Math.max(...xs) - Math.min(...xs) + 16), Math.min(rect.height - 2, Math.max(...ys) - Math.min(...ys) + 16));
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [isFullscreen, selectedStrokeIds]);

  useEffect(() => {
    if (!active) return;
    for (const page of active.pages) {
      const canvas = canvasRefs.current.get(page.id);
      if (canvas && renderedStrokeSets.current.get(page.id) !== page.strokes) {
        drawPage(page, canvas);
        renderedStrokeSets.current.set(page.id, page.strokes);
      }
    }
  }, [active, drawPage]);

  useEffect(() => {
    if (!active || !activePageKey) return;
    const journalId = active.id;
    const resize = new ResizeObserver(entries => {
      const journal = journalsRef.current.find(entry => entry.id === journalId);
      if (!journal) return;
      for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        const page = journal.pages.find(item => item.id === canvas.dataset.journalPageId);
        if (page) {
          drawPage(page, canvas);
          renderedStrokeSets.current.set(page.id, page.strokes);
        }
      }
    });
    for (const page of active.pages) {
      const canvas = canvasRefs.current.get(page.id);
      if (canvas) resize.observe(canvas);
    }
    return () => resize.disconnect();
  }, [active?.id, activePageKey, drawPage]);

  const pointerPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5];
  };
  const startStroke = (journalId: string, page: JournalPage, event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Some tablet browsers do not expose pointer capture. */ }
    const point = pointerPoint(event);
    if (tool === "select") {
      const rect = event.currentTarget.getBoundingClientRect();
      const hit = [...page.strokes].reverse().find(stroke => {
        if (!stroke.points.length) return false;
        const xs = stroke.points.map(value => value[0]), ys = stroke.points.map(value => value[1]);
        const padX = 24 / rect.width, padY = 24 / rect.height;
        return point[0] >= Math.min(...xs) - padX && point[0] <= Math.max(...xs) + padX && point[1] >= Math.min(...ys) - padY && point[1] <= Math.max(...ys) + padY;
      });
      if (!hit?.id) { setSelectedStrokeIds([]); activeStroke.current = null; drawPage(page, event.currentTarget); return; }
      const ids = event.shiftKey ? (selectedStrokeIds.includes(hit.id) ? selectedStrokeIds.filter(id => id !== hit.id) : [...selectedStrokeIds, hit.id]) : selectedStrokeIds.includes(hit.id) ? selectedStrokeIds : [hit.id];
      const originals = page.strokes.filter(stroke => stroke.id && ids.includes(stroke.id));
      setSelectedStrokeIds(ids);
      activeStroke.current = { journalId, pageId: page.id, stroke: hit, mode: "move", startPoint: point, originals, previewStrokes: page.strokes };
      drawPage(page, event.currentTarget);
      return;
    }
    const shape = tool === "rectangle" || tool === "ellipse" || tool === "line" ? tool : undefined;
    const erasing = tool === "eraser";
    const stroke: Stroke = { id: crypto.randomUUID(), points: [point], color: erasing ? "#ffffff" : penColor, width: erasing ? 26 : penWidth, erase: erasing, shape };
    activeStroke.current = { journalId, pageId: page.id, stroke, mode: "draw" };
    if (shape) { setSelectedStrokeIds([]); return; }
    const ctx = event.currentTarget.getContext("2d"), rect = event.currentTarget.getBoundingClientRect();
    if (ctx) {
      ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      ctx.beginPath(); ctx.fillStyle = stroke.color;
      ctx.arc(point[0] * rect.width, point[1] * rect.height, stroke.width / 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  };
  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = activeStroke.current;
    if (!current) return;
    event.preventDefault();
    const { stroke } = current, ctx = event.currentTarget.getContext("2d"), rect = event.currentTarget.getBoundingClientRect();
    const point = pointerPoint(event);
    if (current.mode === "move") {
      if (!current.startPoint || !current.originals?.length) return;
      const dx = point[0] - current.startPoint[0], dy = point[1] - current.startPoint[1];
      const moved = new Map(current.originals.map(original => [original.id, { ...original, points: original.points.map(([x, y, pressure]) => [Math.max(0, Math.min(1, x + dx)), Math.max(0, Math.min(1, y + dy)), pressure] as Point) }]));
      const latest = journalsRef.current.find(journal => journal.id === current.journalId)?.pages.find(page => page.id === current.pageId);
      if (latest) {
        current.previewStrokes = latest.strokes.map(saved => moved.get(saved.id) || saved);
        drawPage({ ...latest, strokes: current.previewStrokes }, event.currentTarget);
      }
      return;
    }
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    const samples = coalesced?.length ? coalesced : [event.nativeEvent];
    if (stroke.shape) {
      const sample = samples.at(-1)!;
      stroke.points = [stroke.points[0], [(sample.clientX - rect.left) / rect.width, (sample.clientY - rect.top) / rect.height, sample.pointerType === "pen" && sample.pressure > 0 ? sample.pressure : 0.5]];
      const page = journalsRef.current.find(journal => journal.id === current.journalId)?.pages.find(page => page.id === current.pageId);
      if (page) drawPage(page, event.currentTarget, stroke);
      return;
    }
    const previous = stroke.points.at(-1)!;
    const nextPoints: Point[] = [];
    let pressureTotal = previous[2] ?? 0.5;
    for (const sample of samples) {
      const next: Point = [(sample.clientX - rect.left) / rect.width, (sample.clientY - rect.top) / rect.height, sample.pointerType === "pen" ? sample.pressure : 0.5];
      stroke.points.push(next);
      pressureTotal += next[2] ?? 0.5;
      nextPoints.push(next);
    }
    if (ctx && nextPoints.length) {
      ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, stroke.width * (0.5 + (pressureTotal / (nextPoints.length + 1)) * 1.15));
      ctx.moveTo(previous[0] * rect.width, previous[1] * rect.height);
      let from = previous;
      for (const next of nextPoints) {
        ctx.quadraticCurveTo(from[0] * rect.width, from[1] * rect.height, ((from[0] + next[0]) / 2) * rect.width, ((from[1] + next[1]) / 2) * rect.height);
        from = next;
      }
      const last = nextPoints[nextPoints.length - 1];
      ctx.lineTo(last[0] * rect.width, last[1] * rect.height);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  };
  const finishStroke = () => {
    const finished = activeStroke.current;
    if (!finished) return;
    activeStroke.current = null;
    const currentPage = journalsRef.current.find(journal => journal.id === finished.journalId)?.pages.find(page => page.id === finished.pageId);
    if (finished.mode === "move") {
      if (!currentPage || !finished.previewStrokes) return;
      const nextStrokes = finished.previewStrokes;
      renderedStrokeSets.current.set(finished.pageId, nextStrokes);
      drawPage({ ...currentPage, strokes: nextStrokes }, canvasRefs.current.get(finished.pageId)!);
      setJournals(old => old.map(journal => journal.id === finished.journalId ? { ...journal, pages: journal.pages.map(page => page.id === finished.pageId ? { ...page, strokes: nextStrokes } : page), updated_at: new Date().toISOString() } : journal));
      return;
    }
    setLastInkPage(finished.pageId);
    const nextStrokes = [...(currentPage?.strokes || []), finished.stroke];
    renderedStrokeSets.current.set(finished.pageId, nextStrokes);
    const canvas = canvasRefs.current.get(finished.pageId);
    if (finished.stroke.shape && currentPage && canvas) drawPage({ ...currentPage, strokes: nextStrokes }, canvas);
    setJournals(old => old.map(journal => journal.id === finished.journalId ? {
      ...journal, pages: journal.pages.map(page => page.id === finished.pageId ? { ...page, strokes: nextStrokes } : page), updated_at: new Date().toISOString(),
    } : journal));
  };

  const addPage = () => {
    if (!active || activeIsLocked) return;
    const page = makePage();
    updateJournal(active.id, { pages: [...active.pages, page] });
    if (isFullscreen) setBookPageIndex(active.pages.length);
    else requestAnimationFrame(() => document.getElementById(`journal-page-${page.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const addTodoLine = () => {
    if (!active || activeIsLocked) return;
    const currentPage = isFullscreen ? active.pages[bookPageIndex] || active.pages.at(-1)! : active.pages.at(-1)!;
    const canvasHeight = canvasRefs.current.get(currentPage.id)?.clientHeight || 920;
    const nextLine = currentPage.todos.reduce((max, todo) => Math.max(max, todo.line), -1) + 1;
    const page = nextLine < Math.floor((canvasHeight - JOURNAL_TODO_ROW_CENTER - 20) / JOURNAL_LINE_STEP) ? currentPage : makePage();
    const line = page === currentPage ? nextLine : 0;
    const todo: JournalTodo = { id: crypto.randomUUID(), line, checked: false };
    if (page === currentPage) updatePage(active.id, page.id, { todos: [...page.todos, todo] });
    else { updateJournal(active.id, { pages: [...active.pages, { ...page, todos: [todo] }] }); if (isFullscreen) setBookPageIndex(active.pages.length); }
    setLastInkPage(page.id);
    if (!isFullscreen) requestAnimationFrame(() => document.getElementById(`journal-todo-${todo.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const turnPage = (direction: "next" | "previous") => {
    if (!active || pageFlip) return;
    const next = bookPageIndex + (direction === "next" ? 1 : -1);
    if (next < 0 || next >= active.pages.length) return;
    setPageFlip(direction);
    window.setTimeout(() => { setBookPageIndex(next); setPageFlip(""); }, 560);
  };
  const addBookPage = () => {
    if (!active || activeIsLocked || pageFlip) return;
    const page = makePage();
    updateJournal(active.id, { pages: [...active.pages, page] });
    setPageFlip("next");
    window.setTimeout(() => { setBookPageIndex(active.pages.length); setPageFlip(""); }, 560);
  };
  const toggleTodo = (journalId: string, pageId: string, todoId: string) => {
    const journal = journals.find(entry => entry.id === journalId);
    const page = journal?.pages.find(entry => entry.id === pageId);
    if (!journal || !page) return;
    updatePage(journalId, pageId, { todos: page.todos.map(todo => todo.id === todoId ? { ...todo, checked: !todo.checked } : todo) });
  };

  const toggleFullscreen = async () => {
    setUiMessage("");
    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen().catch(() => undefined);
      return;
    }
    setSidebarOpen(false);
    setIsFullscreen(true);
    try {
      if (rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen({ navigationUI: "hide" });
    } catch {
      setUiMessage("The journal is in full-screen writing mode. Use Exit full screen to return.");
    }
  };

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement === rootRef.current) void document.exitFullscreen();
        return;
      }
      if (sidebarOpen) { setSidebarOpen(false); return; }
      void saveBeforeClose();
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("fullscreenchange", updateFullscreen); document.removeEventListener("keydown", onKeyDown); };
  }, [sidebarOpen, isFullscreen]);

  const visiblePages = active ? (isFullscreen
    ? [
        ...(pageFlip ? [active.pages[bookPageIndex + (pageFlip === "next" ? 1 : -1)]].filter((page): page is JournalPage => Boolean(page)) : []),
        ...[active.pages[bookPageIndex]].filter((page): page is JournalPage => Boolean(page)),
      ]
    : active.pages) : [];

  if (!mounted) return null;
  return createPortal(<div ref={rootRef} className={`journal-fullscreen${isFullscreen ? " is-fullscreen" : ""}`}>
    <header className="journal-topbar">
      <div className="journal-brand"><span className="journal-brand-mark" aria-hidden="true">✎</span><span><b>Daily journal</b><small role="status">{saveState === "saving" ? "Saving changes…" : saveState === "error" ? "Could not save" : "All changes saved"}</small></span></div>
      <div className="journal-top-actions">
        <button className="journal-panel-toggle" onClick={() => setSidebarOpen(value => !value)} aria-expanded={sidebarOpen} aria-label={sidebarOpen ? "Hide journal list" : "Show journal list"}>☰ <span>Journal list</span></button>
        <button className="journal-fullscreen-toggle" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}>{isFullscreen ? "⛶ Exit full screen" : "⛶ Full screen"}</button>
        <button className="journal-close" onClick={() => void saveBeforeClose()} disabled={saveState === "saving"}>Done <span>✓</span></button>
      </div>
    </header>
    {isFullscreen && <><span className="journal-focus-save" role="status">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save needs attention" : "Saved"}</span><button className="journal-focus-exit" onClick={toggleFullscreen} aria-label="Exit full screen">⛶ <span>Exit</span></button></>}
    {saveState === "error" && <div className="journal-save-error" role="alert"><span>Couldn’t save your changes. They are still on this screen.</span><button onClick={() => setRetrySave(value => value + 1)}>Retry save</button><small>{saveError}</small></div>}
    {uiMessage && <div className="journal-notice" role="status">{uiMessage}<button onClick={() => setUiMessage("")} aria-label="Dismiss message">×</button></div>}
    <div className="journal-frame">
      {sidebarOpen && <button className="journal-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close journal list" />}
      {sidebarOpen && <aside className="journal-sidebar" aria-label="Journal navigation">
        <div className="journal-sidebar-heading"><div><span>YOUR JOURNAL</span><b>By date</b></div><button onClick={() => setSidebarOpen(false)} aria-label="Hide journal list">×</button></div>
        <label className="journal-search">Search words<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find typed text or title"/></label>
        <label className="journal-date-filter">Jump to date<input type="date" value={dateFilter} onChange={event => { const next = event.target.value; setDateFilter(next); if (next) { setSelectedDate(next); const match = journals.find(journal => journal.note_date === next); if (match) openJournal(match); else setActiveId(""); } }}/></label>
        <button className="journal-today" onClick={() => createOrOpenDate(dateFilter || selectedDate)}>＋ Start journal for selected date</button>
        <div className="journal-date-list">{filtered.map(journal => <button key={journal.id} className={`journal-date-card ${active?.id === journal.id ? "selected" : ""}`} onClick={() => openJournal(journal)}>
          <time>{new Date(journal.note_date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</time><b>{journal.title || "Daily entry"}</b>
          <small>{journal.pages.length} {journal.pages.length === 1 ? "page" : "pages"} · {(journal.pages.map(page => `${page.typed_text} ${page.handwriting_text}`).join(" ").trim().slice(0, 58)) || "No typed text preview"}</small>
        </button>)}{!filtered.length && <p className="journal-no-results">No journals match this date or search.</p>}</div>
        {active && <div className="journal-page-strip"><div className="journal-strip-heading">PAGES IN THIS JOURNAL</div>{active.pages.map((page, index) => <button key={page.id} className="journal-strip-page" onClick={() => document.getElementById(`journal-page-${page.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>{String(index + 1).padStart(2, "0")}</span><b>Page {index + 1}</b><small>{(page.typed_text || page.handwriting_text || (page.todos.length ? `${page.todos.length} to-do lines` : "Blank page")).slice(0, 38)}</small></button>)}<button className="journal-strip-add" onClick={addPage}>＋ Add page</button></div>}
      </aside>}
      <main className="journal-writing">
        {!loaded ? <section className="journal-welcome"><span className="journal-welcome-icon">✎</span><p>Opening your journal…</p></section> : loadError ? <section className="journal-welcome" role="alert"><span className="journal-welcome-icon">!</span><h1>Journal unavailable</h1><p>Your saved journal could not be loaded. Retry before editing so cloud entries are protected.</p><button className="journal-start-button" onClick={() => setRetryLoad(value => value + 1)}>Retry loading journal</button></section> : active ? <>
          <div className="journal-entry-heading">
            <div className="journal-date-label">{new Date(active.note_date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            <input aria-label="Journal title" className="journal-title-input" maxLength={160} placeholder="Give today a title, or start writing…" value={active.title} disabled={activeIsLocked} onChange={event => updateJournal(active.id, { title: event.target.value })}/>
            <label className="journal-date-control"><span className="sr-only">Journal date</span><input className="journal-date-input" aria-label="Journal date" type="date" value={active.note_date} onChange={event => {
              const next = event.target.value;
              if (next < today) { setUiMessage("Past days are read-only PDFs. Choose today or a future date to keep writing."); return; }
              const existing = journals.find(journal => journal.id !== active.id && journal.note_date === next);
              if (existing) { setDateConflictId(existing.id); return; }
              setDateConflictId(""); updateJournal(active.id, { note_date: next }); setSelectedDate(next);
            }} disabled={activeIsLocked}/></label>
            {dateConflictId && <div className="journal-date-conflict" role="alert">There is already a journal for this date. <button onClick={() => { const existing = journals.find(journal => journal.id === dateConflictId); if (existing) openJournal(existing); }}>Open that journal</button></div>}
          </div>
          <div className="journal-entry-actions" aria-label="Journal actions">
            <button className="journal-pdf-action" onClick={() => downloadJournalPdf(active)}>↓ Export PDF</button>
            <button className="journal-pdf-action" onClick={() => void shareJournalPdf(active)}>↗ Share PDF</button>
            {active.note_date === today && !active.finalized_at && <button className="journal-end-day" onClick={() => void finalizeJournal(active)}>End day</button>}
            {activeIsLocked && <button className="journal-pdf-action" onClick={() => showJournalPdf(active)}>▣ Open archived PDF</button>}
            <button className="journal-delete-action" onClick={() => void deleteJournal(active)}>Delete journal</button>
          </div>
          {activeIsLocked && <div className="journal-locked-banner" role="status">This day is closed and read-only. The PDF is available in the app.</div>}
          <div className="journal-toolbar" role="toolbar" aria-label="Journal writing tools">
            <button disabled={activeIsLocked} className={tool === "pen" ? "chosen" : ""} onClick={() => setTool("pen")} aria-pressed={tool === "pen"}>✎ <span>Pen</span></button>
            {tool !== "select" && tool !== "eraser" && <div className="journal-colors" aria-label="Pen colour">{["#243f68", "#222b29", "#356b54", "#934d48"].map(color => <button key={color} className={penColor === color ? "selected" : ""} style={{ backgroundColor: color }} aria-label={`Choose ${color} ink`} aria-pressed={penColor === color} onClick={() => setPenColor(color)}/>)}</div>}
            {tool !== "select" && tool !== "eraser" && <>
              <select className="journal-pen-width" aria-label="Pen size" value={penWidth} onChange={event => setPenWidth(Number(event.target.value))}><option value={2.4}>Fine</option><option value={3.2}>Regular</option><option value={4.2}>Bold</option></select></>}
            <button disabled={activeIsLocked} className={tool === "eraser" ? "chosen" : ""} onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}>⌫ <span>Eraser</span></button>
            <button disabled={activeIsLocked} title="Select and move handwriting; hold Shift to select multiple strokes" className={tool === "select" ? "chosen" : ""} onClick={() => setTool("select")} aria-pressed={tool === "select"}>⌖ <span>Select</span></button>
            <button disabled={activeIsLocked} title="Draw a rectangle" className={tool === "rectangle" ? "chosen" : ""} onClick={() => setTool("rectangle")} aria-pressed={tool === "rectangle"}>▱ <span>Box</span></button>
            <button disabled={activeIsLocked} title="Draw an ellipse" className={tool === "ellipse" ? "chosen" : ""} onClick={() => setTool("ellipse")} aria-pressed={tool === "ellipse"}>◯ <span>Oval</span></button>
            <button disabled={activeIsLocked} title="Draw a straight line" className={tool === "line" ? "chosen" : ""} onClick={() => setTool("line")} aria-pressed={tool === "line"}>／ <span>Line</span></button>
            <button onClick={() => { const page = active.pages.find(entry => entry.id === lastInkPage) || active.pages.at(-1); if (page?.strokes.length) updatePage(active.id, page.id, { strokes: page.strokes.slice(0, -1) }); }} disabled={!active.pages.some(page => page.strokes.length)}>↶ <span>Undo ink</span></button>
            <button disabled={activeIsLocked} className="journal-todo-add" onClick={addTodoLine}>☐ <span>To-do line</span></button>
            <span className="journal-tool-spacer"/><span className="journal-page-count">{active.pages.length} {active.pages.length === 1 ? "page" : "pages"}</span>
          </div>
          <div className="journal-ink-hint" aria-live="polite">{tool === "select" ? "Tap ink or a shape to select it. Drag to move; hold Shift to add more strokes to the selection." : tool === "rectangle" || tool === "ellipse" || tool === "line" ? "Drag on the page to draw the selected shape." : "Write with your stylus. Add a to-do line to place a checkbox, then write beside it. Search finds titles and typed text."}</div>
          <div className={`journal-pages${isFullscreen ? " journal-book-stage" : ""}`}>{visiblePages.map(page => { const index = active.pages.findIndex(item => item.id === page.id); const isTurningPage = isFullscreen && page.id === active.pages[bookPageIndex]?.id; return <section className={`journal-page${isFullscreen ? " journal-book-page" : ""}${isFullscreen && !isTurningPage ? " journal-book-under-page" : ""}${isTurningPage && pageFlip ? ` flip-${pageFlip}` : ""}`} id={`journal-page-${page.id}`} key={page.id}>
            <div className="journal-page-label"><span>PAGE {String(index + 1).padStart(2, "0")}</span><span>{page.todos.length ? `${page.todos.filter(todo => todo.checked).length}/${page.todos.length} done` : ""}</span></div>
            <div className="journal-canvas-wrap">
            <canvas ref={canvasRefFor(page.id)} className={`journal-canvas journal-canvas-${tool}`} onPointerDown={event => startStroke(active.id, page, event)} onPointerMove={moveStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke}/>
              {page.todos.map(todo => <button key={todo.id} id={`journal-todo-${todo.id}`} type="button" className={`journal-todo-checkbox${todo.checked ? " checked" : ""}`} style={{ top: `calc(${JOURNAL_TODO_ROW_CENTER}px + ${todo.line * JOURNAL_LINE_STEP}px)` }} onClick={() => toggleTodo(active.id, page.id, todo.id)} aria-label={`${todo.checked ? "Uncheck" : "Check off"} to-do line ${todo.line + 1}`} aria-pressed={todo.checked}>{todo.checked ? "✓" : ""}</button>)}
            </div>
            <textarea className="journal-page-typing" value={page.typed_text} disabled={activeIsLocked} onChange={event => updatePage(active.id, page.id, { typed_text: event.target.value })} placeholder="Type notes on this page…" aria-label={`Typed notes for page ${index + 1}`}/>
            {page.handwriting_text && <details className="journal-recognized"><summary>Previously recognized text · editable</summary><textarea value={page.handwriting_text} onChange={event => updatePage(active.id, page.id, { handwriting_text: event.target.value })} aria-label={`Previously recognized text for page ${index + 1}`}/></details>}
          </section>; })}{!isFullscreen && <button className="journal-add-page" onClick={addPage}>＋ Add another page</button>}</div>
          {isFullscreen && <nav className="journal-book-controls" aria-label="Journal page controls"><button onClick={() => turnPage("previous")} disabled={bookPageIndex <= 0 || Boolean(pageFlip)}>‹ Previous</button><span>Page {bookPageIndex + 1} of {active.pages.length}</span><button disabled={Boolean(pageFlip) || activeIsLocked} onClick={() => bookPageIndex === active.pages.length - 1 ? addBookPage() : turnPage("next")}>{bookPageIndex === active.pages.length - 1 ? "＋ New page" : "Next ›"}</button></nav>}
          {isFullscreen && <button className="journal-add-page journal-book-add" onClick={addPage}>＋ Add another page</button>}
          <div className="journal-footer-hint">Your journal is saved by date. Stylus checklist writing stays attached to its checkbox line.</div>
        </> : <section className="journal-welcome"><span className="journal-welcome-icon">✎</span><div className="journal-date-label">{new Date(selectedDate + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div><h1>A page for today.</h1><p>Write freely. Your journal grows with you, page by page.</p><button className="journal-start-button" onClick={() => createOrOpenDate(dateFilter || selectedDate)}>Start journal for selected date</button><button className="journal-browse-button" onClick={() => setSidebarOpen(true)}>Open another date</button></section>}
      </main>
    </div>
    {pdfViewer && <div className="journal-pdf-backdrop" role="dialog" aria-modal="true" aria-label="Read archived journal PDF"><section className="journal-pdf-viewer"><header><b>{pdfViewer.name}</b><div><a href={pdfViewer.url} download={pdfViewer.name}>Download PDF</a><button onClick={() => setPdfViewer(null)} aria-label="Close PDF">Done ×</button></div></header><iframe title="Archived daily journal PDF" src={pdfViewer.url}/></section></div>}
  </div>, document.body);
}

