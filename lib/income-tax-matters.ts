// OfficeFlow 2.1 — Income-tax matter domain model and pure helpers.
export type IncomeTaxAct = "Income-tax Act, 1961" | "Income-tax Act, 2025";
export type ReplyStatus = "Not started" | "Partially replied" | "Fully replied";
export type HearingOutcome = "Scheduled" | "Attended" | "Adjourned" | "Order reserved" | "Order passed";
export type MatterRound = { id:string; matterId:string; roundType:string; sequenceNumber:number; noticeNumber?:string; noticeDate?:string; dueDate?:string; hearingAt?:string; replyStatus:ReplyStatus; hearingOutcome?:HearingOutcome; nextHearingDate?:string; outcome?:string; notes?:string; attachments:{name:string;dataUrl?:string;url?:string}[] };
export type IncomeTaxMatter = { id:string; client:string; name:string; matterType:string; act:IncomeTaxAct; financialYear?:string; assessmentYear?:string; taxYear?:string; nextAction?:string; dueDate?:string; status:"Open"|"Closed"|"On hold"; rounds:MatterRound[] };
export type ClientGroup = { id:string; name:string; clientNames:string[] };
export type MatterTaskType = { id:string; matterType:string; taskType:string; act:IncomeTaxAct; sectionReference?:string; active:boolean; sortOrder:number };
export const DEFAULT_MATTER_TYPES = ["Assessment","Appeal","Rectification","Refund","Penalty","Prosecution","Other"];
const STARTER_1961:Record<string,string[]> = {
 Assessment:["Notice u/s 143(2)","Notice u/s 142(1)","Notice u/s 148","Notice u/s 148A","Show cause notice (SCN)","Intimation u/s 143(1)","Other"],
 Appeal:["Filing appeal","Hearing notice","Appeal order received","Stay application","Other"],
 Rectification:["Rectification application u/s 154","Order received","Other"],
 Refund:["Refund status follow-up","Refund reissue request","Other"],
 Penalty:["Penalty notice","Reply filed","Penalty order","Other"],
 Prosecution:["Notice received","Reply filed","Other"],
 Other:["Other"]
};
const STARTER_2025:Record<string,string[]> = {
 Assessment:["Return processing / intimation","Scrutiny assessment","Information request","Reassessment proceeding","Show-cause notice","Assessment order received","Other"],
 Appeal:["Filing appeal","Hearing notice","Written submissions","Appeal order received","Stay application","Other"],
 Rectification:["Rectification application","Order received","Other"],
 Refund:["Refund status follow-up","Refund reissue request","Other"],
 Penalty:["Penalty notice","Reply filed","Penalty order","Other"],
 Prosecution:["Notice received","Reply filed","Other"],
 Other:["TDS/TCS compliance","Tax deduction / collection default","Tax opinion","Other"]
};
export function starterTaskTypes():MatterTaskType[]{
 const build=(catalogue:Record<string,string[]>,act:IncomeTaxAct,prefix:string)=>Object.entries(catalogue).flatMap(([matterType,names])=>names.map((taskType,index)=>({id:prefix+"-"+matterType+"-"+index,matterType,taskType,act,sectionReference:"",active:true,sortOrder:index})));
 return [...build(STARTER_1961,"Income-tax Act, 1961","1961"),...build(STARTER_2025,"Income-tax Act, 2025","2025")];
}
export function yearOptions(currentYear=new Date().getFullYear(),_pastYears?:number,futureYears=10):number[]{const latest=currentYear+futureYears;return Array.from({length:latest-1900+1},(_,i)=>latest-i);}
export function financialYearOptions():string[]{return yearOptions(new Date().getFullYear()+1,100,10).map(y=>(y-1)+"-"+String(y).slice(-2));}
export function assessmentYearFromFinancialYear(fy:string):string{const m=fy.match(/^(\d{4})-(\d{2}|\d{4})$/);if(!m)return "";const y=Number(m[1])+1;return y+"-"+String(y+1).slice(-2);}
export function detectIncomeTaxYears(text:string):{financialYear?:string;assessmentYear?:string;taxYear?:string}{const t=text.replace(/[–—]/g,"-");const ay=t.match(/(?:assessment\s+year|\bAY\b|A\.Y\.)\s*[:.-]?\s*(20\d{2}\s*[-/]\s*\d{2,4})/i);const fy=t.match(/(?:financial\s+year|previous\s+year|\bFY\b|F\.Y\.)\s*[:.-]?\s*(20\d{2}\s*[-/]\s*\d{2,4})/i);const ty=t.match(/(?:tax\s+year)\s*[:.-]?\s*(20\d{2}(?:\s*[-/]\s*\d{2,4})?)/i);const clean=(v?:string)=>v?.replace(/\s/g,"").replace("/","-");const out:{financialYear?:string;assessmentYear?:string;taxYear?:string}={};if(ay)out.assessmentYear=clean(ay[1]);if(fy)out.financialYear=clean(fy[1]);if(ty)out.taxYear=clean(ty[1]);if(!out.financialYear&&out.assessmentYear){const m=out.assessmentYear.match(/^(20\d{2})-(\d{2,4})$/);if(m)out.financialYear=(Number(m[1])-1)+"-"+String(Number(m[1])-2000).padStart(2,"0");}return out;}
export function nextRoundSequence(rounds:MatterRound[],type:string):number{return rounds.filter(r=>r.roundType===type).reduce((n,r)=>Math.max(n,r.sequenceNumber),0)+1;}
export function duplicateRound(rounds:MatterRound[],candidate:Pick<MatterRound,"roundType"|"noticeNumber"|"noticeDate">,exceptId?:string):boolean{return rounds.some(r=>r.id!==exceptId&&r.roundType===candidate.roundType&&(r.noticeNumber||"")===(candidate.noticeNumber||"")&&(r.noticeDate||"")===(candidate.noticeDate||""));}
export function roundStatusFromTaskStatus(status:string):ReplyStatus|null{if(status==="Partially replied")return "Partially replied";if(status==="Fully replied"||status==="Closed"||status==="Filed / completed")return "Fully replied";return null;}
