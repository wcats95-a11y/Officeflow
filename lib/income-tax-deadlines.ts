export type RemedyDeadlineRule = "first-appeal" | "itat-appeal" | "cross-objection" | "itat-rectification";

type RemedyTask = { matterType?: string; taskType?: string; title?: string; description?: string };

const normalizedText = (task: RemedyTask) => [task.matterType, task.taskType, task.title, task.description]
  .filter(Boolean).join(" ").toLowerCase().replace(/[‐‑‒–—]/g, "-");

export function isAppealOrRectificationMatter(matterType: string): boolean {
  return /appeal|rectification/i.test(matterType || "");
}

export function isReturnOrTaxAuditMatter(matterType: string): boolean {
  return /^(itr filing|tax audit)$/i.test((matterType || "").trim());
}

export function getRemedyDeadlineRule(task: RemedyTask): RemedyDeadlineRule | null {
  const text = normalizedText(task);
  const matterType = (task.matterType || "").toLowerCase();
  if (/cross[ -]?objection|form\s*36a/.test(text)) return "cross-objection";
  if (/(?:itat|tribunal)/.test(text) && (/(?:rectification|254\s*\(\s*2\s*\))/.test(text)) && !/(?:hearing|paper book|written submission|order received)/.test(text)) return "itat-rectification";
  if (/(?:itat|tribunal)/.test(text) && /appeal/.test(text) && !/(?:hearing|paper book|written submission|order received)/.test(text)) return "itat-appeal";
  if (matterType === "appeal" && !/(?:hearing|written submission|order received|stay application)/.test(text)) return "first-appeal";
  if (/(?:form\s*35|section\s*246\s*a|section\s*249|s\.?\s*246\s*a|s\.?\s*249)/.test(text) && /appeal/.test(text) && !/(?:hearing|written submission|order received)/.test(text)) return "first-appeal";
  return null;
}

export function remedyTriggerDateLabel(rule: RemedyDeadlineRule): string {
  switch (rule) {
    case "first-appeal": return "Order / demand notice served date";
    case "itat-appeal": return "CIT(A) order communication date";
    case "cross-objection": return "Appeal notice received date";
    case "itat-rectification": return "ITAT order passed date";
  }
}

export function remedyDeadlineBasis(rule: RemedyDeadlineRule): string {
  switch (rule) {
    case "first-appeal": return "30 days from service of the order or demand notice.";
    case "itat-appeal": return "Two calendar months from the end of the month in which the order was communicated.";
    case "cross-objection": return "30 days from receipt of the notice of appeal.";
    case "itat-rectification": return "Six months from the end of the month in which the ITAT order was passed.";
  }
}

function parseISODate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? { year, month, day } : null;
}

function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addCalendarDays(value: string, days: number): string {
  const parsed = parseISODate(value);
  if (!parsed) return "";
  return isoDate(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days)));
}

function addMonthsFromMonthEnd(value: string, months: number): string {
  const parsed = parseISODate(value);
  if (!parsed) return "";
  const monthEnd = new Date(Date.UTC(parsed.year, parsed.month, 0));
  const targetMonthEnd = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + months + 1, 0));
  return isoDate(targetMonthEnd);
}

/** Returns an indicative deadline from the date trigger and selected remedy. */
export function calculateRemedyDeadline(rule: RemedyDeadlineRule, triggerDate: string): string {
  switch (rule) {
    case "first-appeal":
    case "cross-objection": return addCalendarDays(triggerDate, 30);
    case "itat-appeal": return addMonthsFromMonthEnd(triggerDate, 2);
    case "itat-rectification": return addMonthsFromMonthEnd(triggerDate, 6);
  }
}
