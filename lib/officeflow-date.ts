export type DiaryPeriod = "day" | "week" | "month";
function parseISODate(value: string): { year:number; month:number; day:number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
}
function formatUTCDate(value: Date): string { return value.toISOString().slice(0, 10); }
/** Sunday-start diary ranges are calculated independently of browser timezone. */
export function getDiaryDateRange(reportDate: string, period: DiaryPeriod | string): [string, string] {
  const parts = parseISODate(reportDate);
  if (!parts) return ["", ""];
  if (period === "month") {
    const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
    return [`${parts.year}-${String(parts.month).padStart(2,"0")}-01`,`${parts.year}-${String(parts.month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`];
  }
  if (period === "week") {
    const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - dayOfWeek));
    const end = new Date(start.getTime() + 6 * 86400000);
    return [formatUTCDate(start), formatUTCDate(end)];
  }
  return [reportDate, reportDate];
}
/** Calendar date of an instant in the OfficeFlow business timezone. */
export function indiaDateFromTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const part = (type:string) => parts.find(item=>item.type===type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Current wall-clock time in the OfficeFlow business timezone. */
export function indiaClockTime(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(value);
  const part = (type:string) => parts.find(item=>item.type===type)?.value || "00";
  return `${part("hour")}:${part("minute")}:${part("second")}`;
}
/** Convert a selected India-local diary date/time into a stable UTC instant. */
export function indiaLocalDateTimeToISO(date: string, time: string): string {
  if (!parseISODate(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return "";
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const instant = new Date(`${date}T${normalizedTime}+05:30`);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : "";
}
