export type TaskDeadlineLike = {
  statutoryDue?: string;
  noticeDue?: string;
  internalDue?: string;
  due?: string;
};

function validISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split("-").map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}

/** All unique, valid dates that can make a task time-critical, earliest first. */
export function getTaskDeadlineDates(task: TaskDeadlineLike): string[] {
  return [...new Set([task.statutoryDue,task.noticeDue,task.internalDue,task.due].filter(validISODate))].sort();
}

export type FilingAcknowledgementLike = { name?: string; dataUrl?: string; url?: string } | null | undefined;

/** A task cannot enter a terminal/closed status until a real filing acknowledgement is attached. */
export function canSetTaskStatus(task: { filingAckDocument?: FilingAcknowledgementLike }, nextStatus: string): boolean {
  if (!["Filed / completed","Done","Closed"].includes(nextStatus)) return true;
  const acknowledgement=task.filingAckDocument;
  return Boolean(acknowledgement && typeof acknowledgement.name==="string" && acknowledgement.name.trim() &&
    ((typeof acknowledgement.dataUrl==="string"&&acknowledgement.dataUrl.length>0)||(typeof acknowledgement.url==="string"&&acknowledgement.url.length>0)));
}
