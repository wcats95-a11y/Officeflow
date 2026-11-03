// OfficeFlow 2.2 — Income-tax matter catalogues and validated year helpers.
export type IncomeTaxAct = "Income-tax Act, 1961" | "Income-tax Act, 2025";
export type ReplyStatus = "Not started" | "Partially replied" | "Fully replied";
export type HearingOutcome = "Scheduled" | "Attended" | "Adjourned" | "Order reserved" | "Order passed";
export type MatterRound = { id:string; matterId:string; roundType:string; sequenceNumber:number; noticeNumber?:string; noticeDate?:string; dueDate?:string; hearingAt?:string; replyStatus:ReplyStatus; hearingOutcome?:HearingOutcome; nextHearingDate?:string; outcome?:string; notes?:string; attachments:{name:string;dataUrl?:string;url?:string}[] };
export type IncomeTaxMatter = { id:string; client:string; name:string; matterType:string; act:IncomeTaxAct; financialYear?:string; assessmentYear?:string; taxYear?:string; nextAction?:string; dueDate?:string; status:"Open"|"Closed"|"On hold"; rounds:MatterRound[] };
export type ClientGroup = { id:string; name:string; clientNames:string[] };
export type MatterTaskType = { id:string; matterType:string; taskType:string; act:IncomeTaxAct; sectionReference?:string; active:boolean; sortOrder:number };


export type DirectTaxTaskLike = { taskType?:string; matterType?:string; applicableAct?:string; category?:string; title?:string; description?:string };
export function isIncomeTaxTaskLike(task:DirectTaxTaskLike):boolean{
  const text=[task.taskType,task.matterType,task.applicableAct,task.category,task.title,task.description].filter(Boolean).join(" ").toLowerCase();
  if(/\b(gst|goods and services tax)\b/.test(text))return false;
  return /income.?tax|direct tax|\bitr\b|\bpan\b|assessment|reassessment|faceless|tax audit|advance tax|capital gains|\btds\b|\btcs\b|tax deducted at source|tax collected at source|withholding tax|tax deduction|tax collection|section 14[38]|section 14[89]|section 15[456]|section 26as|form 16|form 26|tax notice|income-tax act/.test(text)||task.taskType==="Income tax";
}

export const DEFAULT_MATTER_TYPES = [
  "Compliance","ITR filing","Tax audit","Assessment","Appeal","ITAT appeal",
  "Stay / recovery","Rectification","Refund","Penalty","Prosecution","Tax opinion","Other"
];

const STARTER_1961:Record<string,string[]> = {
  Compliance:["TDS return – Form 24Q","TDS return – Form 26Q","TDS return – Form 27Q","TCS return – Form 27EQ","TDS/TCS default notice","TDS certificate / Form 16","Advance tax compliance","Other compliance"],
  "ITR filing":["ITR preparation","ITR review","Original return filing","Revised return","Belated return","Updated return","Refund follow-up","Other"],
  "Tax audit":["Tax audit preparation","Tax audit review","Form 3CA / 3CB and 3CD","Tax audit clarification","Audit report filing","Other"],
  Assessment:["Assessment","Notice u/s 143(2)","Notice u/s 142(1)","Notice u/s 148","Notice u/s 148A","Show cause notice (SCN)","Intimation u/s 143(1)","Assessment order","Other"],
  Appeal:["Filing appeal","CIT(A) hearing notice","Written submissions","Appeal order received","Stay application","Other"],
  "ITAT appeal":["ITAT appeal filing","Paper book preparation","Written submissions","ITAT hearing","ITAT order received","Other"],
  "Stay / recovery":["Stay of demand application","Recovery notice","Stay hearing","Instalment / payment monitoring","Other"],
  Rectification:["Rectification application u/s 154","Order received","Other"],
  Refund:["Refund status follow-up","Refund reissue request","Other"],
  Penalty:["Penalty notice","Reply filed","Penalty order","Other"],
  Prosecution:["Notice received","Reply filed","Other"],
  "Tax opinion":["Tax opinion request","Research and analysis","Draft opinion","Partner review","Final opinion"],
  Other:["Other direct-tax matter"]
};

const STARTER_2025:Record<string,string[]> = {
  Compliance:["TDS return preparation","TCS return preparation","TDS/TCS statement review","TDS/TCS default notice","Tax deduction / collection reconciliation","Advance tax compliance","Other compliance"],
  "ITR filing":["Tax return preparation","Tax return review","Original return filing","Updated return","Refund follow-up","Other"],
  "Tax audit":["Tax audit preparation","Tax audit review","Audit report preparation","Audit report filing","Tax audit clarification","Other"],
  Assessment:["Assessment","Return processing / intimation","Scrutiny assessment","Information request","Reassessment proceeding","Show-cause notice","Assessment order received","Other"],
  Appeal:["Filing appeal","Hearing notice","Written submissions","Appeal order received","Stay application","Other"],
  "ITAT appeal":["ITAT appeal filing","Paper book preparation","Written submissions","ITAT hearing","ITAT order received","Other"],
  "Stay / recovery":["Stay of demand application","Recovery notice","Stay hearing","Instalment / payment monitoring","Other"],
  Rectification:["Rectification application","Order received","Other"],
  Refund:["Refund status follow-up","Refund reissue request","Other"],
  Penalty:["Penalty notice","Reply filed","Penalty order","Other"],
  Prosecution:["Notice received","Reply filed","Other"],
  "Tax opinion":["Tax opinion request","Research and analysis","Draft opinion","Partner review","Final opinion"],
  Other:["Other direct-tax matter"]
};

export function starterTaskTypes():MatterTaskType[]{
  const build=(catalogue:Record<string,string[]>,act:IncomeTaxAct,prefix:string)=>
    Object.entries(catalogue).flatMap(([matterType,names])=>
      names.map((taskType,index)=>({id:prefix+"-"+matterType+"-"+index,matterType,taskType,act,sectionReference:"",active:true,sortOrder:index}))
    );
  return [...build(STARTER_1961,"Income-tax Act, 1961","1961"),...build(STARTER_2025,"Income-tax Act, 2025","2025")];
}

/** Union the full built-in catalogue with saved customisations; saved rows win by stable ID. */
export function mergeStarterTaskTypes(savedValue: unknown): MatterTaskType[] {
  // Pre-Act workspaces did not persist an Act, active flag or sort order.
  // Preserve those custom templates under the 1961 catalogue while adding
  // the new 2025 starter catalogue; do not let an older payload hide it.
  const saved = Array.isArray(savedValue) ? savedValue
    .filter((item:any)=>item && typeof item.id==="string" && typeof item.matterType==="string" && typeof item.taskType==="string")
    .map((item:any,index:number)=>({
      ...item,
      act: item.act==="Income-tax Act, 2025" ? "Income-tax Act, 2025" as const : "Income-tax Act, 1961" as const,
      active: typeof item.active==="boolean" ? item.active : true,
      sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
    })) as MatterTaskType[] : [];
  const merged = new Map<string,MatterTaskType>();
  for(const item of starterTaskTypes()) merged.set(item.id,item);
  for(const item of saved) merged.set(item.id,item);
  return [...merged.values()].sort((a,b)=>
    a.act.localeCompare(b.act)||a.matterType.localeCompare(b.matterType)||a.sortOrder-b.sortOrder||a.taskType.localeCompare(b.taskType)
  );
}

/** Return only active task templates for the selected Act and matter type. Built-ins are unioned with saved customisations so an older workspace cannot hide a newer Act catalogue. */
export function getMatterTaskTypesForAct(savedValue: unknown, matterType: string, act: string): MatterTaskType[] {
  const selectedAct: IncomeTaxAct = act === "Income-tax Act, 2025" ? "Income-tax Act, 2025" : "Income-tax Act, 1961";
  const selectedMatter = String(matterType || "").trim();
  if (!selectedMatter) return [];
  return mergeStarterTaskTypes(savedValue)
    .filter(item => item.active && item.act === selectedAct && item.matterType === selectedMatter)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.taskType.localeCompare(b.taskType));
}

export function mergeMatterTypeNames(savedValue: unknown): string[] {
  const saved=Array.isArray(savedValue)?savedValue.filter((name:any)=>typeof name==="string"&&name.trim()).map((name:string)=>name.trim()):[];
  return [...new Set([...DEFAULT_MATTER_TYPES,...saved])];
}

export function yearOptions(currentYear=new Date().getFullYear(),pastYears=50,futureYears=10):number[]{
  const first=Math.max(1900,currentYear-Math.max(0,pastYears));
  const last=currentYear+Math.max(0,futureYears);
  return Array.from({length:last-first+1},(_,index)=>last-index);
}

export function financialYearOptions():string[]{
  return yearOptions(new Date().getFullYear()+1,50,10).map(year=>(year-1)+"-"+String(year).slice(-2));
}

export function taxYearOptions(currentYear=new Date().getFullYear(),futureYears=10):string[]{
  const first=Math.max(2026,currentYear);
  const last=first+Math.max(0,futureYears);
  return Array.from({length:last-first+1},(_,index)=>first+index).map(year=>year+"-"+String(year+1).slice(-2));
}

function normalizeYearRange(value:string):string{
  const match=String(value||"").trim().replace(/[–—/]/g,"-").match(/^(\d{4})\s*-\s*(\d{2}|\d{4})$/);
  if(!match)return "";
  const start=Number(match[1]);
  const end=match[2].length===2?Math.floor(start/100)*100+Number(match[2]):Number(match[2]);
  if(end!==start+1)return "";
  return start+"-"+String(end).slice(-2);
}

export function normalizeTaxYear(value:string):string{
  const raw=String(value||"").trim().replace(/[–—/]/g,"-");
  if(/^20\d{2}$/.test(raw)){
    const start=Number(raw);
    return start>=2026?start+"-"+String(start+1).slice(-2):"";
  }
  const normalized=normalizeYearRange(raw);
  return normalized&&Number(normalized.slice(0,4))>=2026?normalized:"";
}

export function isValidFinancialYear(value:string):boolean{
  const normalized=normalizeYearRange(value);
  return Boolean(normalized&&Number(normalized.slice(0,4))>=1900);
}

export function isValidAssessmentYear(value:string):boolean{
  const normalized=normalizeYearRange(value);
  return Boolean(normalized&&Number(normalized.slice(0,4))>=1901);
}

export function isValidTaxYear(value:string):boolean{
  return Boolean(normalizeTaxYear(value));
}

export function assessmentYearFromFinancialYear(financialYear:string):string{
  const normalized=normalizeYearRange(financialYear);
  if(!normalized)return "";
  const next=Number(normalized.slice(0,4))+1;
  return next+"-"+String(next+1).slice(-2);
}

export function validateActYears(act:string,financialYear:string,assessmentYear:string,taxYear:string):string|null{
  if(act==="Income-tax Act, 2025"){
    if(!isValidTaxYear(taxYear))return "Select a valid tax year, for example 2026-27.";
    return null;
  }
  if(act!=="Income-tax Act, 1961")return "Select the applicable Income-tax Act.";
  if(!isValidFinancialYear(financialYear))return "Select a valid financial year, for example 2025-26.";
  if(!isValidAssessmentYear(assessmentYear))return "Select a valid assessment year, for example 2026-27.";
  if(assessmentYearFromFinancialYear(financialYear)!==normalizeYearRange(assessmentYear))return "The selected financial year and assessment year do not match.";
  return null;
}

/** Keep FY/AY and Tax Year fields mutually exclusive when switching Acts or migrating records. */
export function normalizeTaskActYearFields<T extends {applicableAct?:string;financialYear?:string;assessmentYear?:string;taxYear?:string}>(
  task:T,
):T & {applicableAct:IncomeTaxAct;financialYear:string;assessmentYear:string;taxYear:string}{
  const applicableAct:IncomeTaxAct=task.applicableAct==="Income-tax Act, 2025"?"Income-tax Act, 2025":"Income-tax Act, 1961";
  if(applicableAct==="Income-tax Act, 2025"){
    return {...task,applicableAct,financialYear:"",assessmentYear:"",taxYear:normalizeTaxYear(task.taxYear||"")||""};
  }
  return {...task,applicableAct,financialYear:task.financialYear||"",assessmentYear:task.assessmentYear||"",taxYear:""};
}

export function detectIncomeTaxYears(text:string):{financialYear?:string;assessmentYear?:string;taxYear?:string}{
  const source=text.replace(/[–—]/g,"-");
  const ay=source.match(/(?:assessment\s+year|\bAY\b|A\.Y\.)\s*[:.-]?\s*(20\d{2}\s*[-/]\s*\d{2,4})/i);
  const fy=source.match(/(?:financial\s+year|previous\s+year|\bFY\b|F\.Y\.)\s*[:.-]?\s*(20\d{2}\s*[-/]\s*\d{2,4})/i);
  const ty=source.match(/(?:tax\s+year)\s*[:.-]?\s*(20\d{2}(?:\s*[-/]\s*\d{2,4})?)/i);
  const clean=(value?:string)=>value?.replace(/\s/g,"").replace("/","-");
  const result:{financialYear?:string;assessmentYear?:string;taxYear?:string}={};
  if(ay)result.assessmentYear=normalizeYearRange(clean(ay[1])||"")||clean(ay[1]);
  if(fy)result.financialYear=normalizeYearRange(clean(fy[1])||"")||clean(fy[1]);
  if(ty)result.taxYear=normalizeTaxYear(clean(ty[1])||"")||clean(ty[1]);
  if(!result.financialYear&&result.assessmentYear){
    const normalized=normalizeYearRange(result.assessmentYear);
    if(normalized)result.financialYear=(Number(normalized.slice(0,4))-1)+"-"+String(Number(normalized.slice(0,4))).slice(-2);
  }
  return result;
}

export function nextRoundSequence(rounds:MatterRound[],type:string):number{
  return rounds.filter(round=>round.roundType===type).reduce((number,round)=>Math.max(number,round.sequenceNumber),0)+1;
}

export function duplicateRound(rounds:MatterRound[],candidate:Pick<MatterRound,"roundType"|"noticeNumber"|"noticeDate">,exceptId?:string):boolean{
  return rounds.some(round=>round.id!==exceptId&&round.roundType===candidate.roundType&&(round.noticeNumber||"")===(candidate.noticeNumber||"")&&(round.noticeDate||"")===(candidate.noticeDate||""));
}

export function roundStatusFromTaskStatus(status:string):ReplyStatus|null{
  if(status==="Partially replied")return "Partially replied";
  if(status==="Fully replied"||status==="Closed"||status==="Filed / completed")return "Fully replied";
  return null;
}
