export type MeetingRecurrence = "None" | "Daily" | "Weekly" | "Monthly";
export type MeetingLike = { date:string; start:string; duration:number };

function isISODate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d]=value.split("-").map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}

function formatDate(date:Date):string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
}

export function meetingOccurrenceDates(startDate:string, recurrence:MeetingRecurrence|string, count=12):string[] {
  if(!isISODate(startDate)) return [];
  if(recurrence==="None"||!recurrence) return [startDate];
  const [year,month,day]=startDate.split("-").map(Number);
  const occurrences:string[]=[];
  const limit=Math.max(1,Math.min(24,Math.floor(count)||12));
  for(let index=0;index<limit;index++){
    if(recurrence==="Daily"||recurrence==="Weekly"){
      const offset=index*(recurrence==="Daily"?1:7);
      occurrences.push(formatDate(new Date(Date.UTC(year,month-1,day+offset))));
    }else if(recurrence==="Monthly"){
      const monthIndex=month-1+index;
      const targetYear=year+Math.floor(monthIndex/12);
      const targetMonth=monthIndex%12;
      const lastDay=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate();
      occurrences.push(formatDate(new Date(Date.UTC(targetYear,targetMonth,Math.min(day,lastDay)))));
    }else{
      return [startDate];
    }
  }
  return occurrences;
}

function minutes(value:string):number|null {
  const match=value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match?Number(match[1])*60+Number(match[2]):null;
}

export function meetingTimesOverlap(a:MeetingLike,b:MeetingLike):boolean {
  if(a.date!==b.date) return false;
  const aStart=minutes(a.start),bStart=minutes(b.start);
  if(aStart===null||bStart===null||!Number.isFinite(a.duration)||!Number.isFinite(b.duration)) return false;
  return aStart < bStart+b.duration && aStart+a.duration > bStart;
}

export function hasMeetingConflict(existing:MeetingLike[],draft:MeetingLike&{recurrence?:string},count=12):boolean {
  const dates=meetingOccurrenceDates(draft.date,draft.recurrence||"None",count);
  return existing.some(meeting=>dates.some(date=>meetingTimesOverlap(meeting,{...draft,date})));
}
