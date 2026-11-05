export type CompOffEntry = {
  id: string;
  type: "earned" | "used";
  date: string;
  notes?: string;
  expiresAt?: string;
  earnedEntryId?: string;
};

export type CompOffHolidayLike = { date:string; status?:string };

/** Only a second/fourth Saturday or an applicable configured holiday qualifies. Sundays and paid leave do not. */
export function compOffQualifyingDayType(value:unknown, holidays:CompOffHolidayLike[]):string {
  if(!isCompOffISODate(value))return "";
  const [year,month,day]=value.split("-").map(Number);
  const weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();
  if(weekday===6&&Math.ceil(day/7)%2===0)return "2nd / 4th Saturday";
  const holiday=holidays.find(item=>item.date===value);
  if(!holiday)return "";
  if(["central-reference","restricted-reference","provisional"].includes(holiday.status||""))return "Reference holiday — confirm office closure";
  return "Public holiday";
}

export function isCompOffISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Valid through the clamped calendar date three months after earning. */
export function compOffExpiryDate(earnedDate: string): string {
  if (!isCompOffISODate(earnedDate)) return "";
  const [year, month, day] = earnedDate.split("-").map(Number);
  const targetMonthIndex = month - 1 + 3;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const expiryDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(expiryDay).padStart(2, "0")}`;
}

/**
 * Adds a stable earned-entry link to legacy "used" rows.
 * Matching is chronological FIFO and only links a usage to an earned day
 * that existed and had not expired on the usage date.
 */
export function normalizeCompOffEntries(value: unknown): CompOffEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CompOffEntry[] = value
    .filter((entry: any) => entry && typeof entry.id === "string" && isCompOffISODate(entry.date) && (entry.type === "earned" || entry.type === "used"))
    .map((entry: any) => ({
      ...entry,
      notes: typeof entry.notes === "string" ? entry.notes : "",
      ...(entry.type === "earned" ? { expiresAt: compOffExpiryDate(entry.date) } : {}),
    }));
  const earned = entries.filter(entry => entry.type === "earned").sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const earnedById = new Map(earned.map(entry => [entry.id, entry]));
  const consumed = new Set<string>();
  const linked = new Map<string, string>();
  const used = entries.filter(entry => entry.type === "used").sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const usage of used) {
    const existing = usage.earnedEntryId ? earnedById.get(usage.earnedEntryId) : undefined;
    const existingIsUsable = Boolean(existing && !consumed.has(existing.id) && usage.date >= existing.date && usage.date <= (existing.expiresAt || compOffExpiryDate(existing.date)));
    if (existingIsUsable && existing) {
      consumed.add(existing.id);
      linked.set(usage.id, existing.id);
      continue;
    }
    // An explicit but invalid link is not a legacy row. Never redirect it to another earned entry.
    if (usage.earnedEntryId) {
      linked.set(usage.id, usage.earnedEntryId);
      continue;
    }
    const candidate = earned.find(entry =>
      !consumed.has(entry.id) &&
      entry.date <= usage.date &&
      usage.date <= (entry.expiresAt || compOffExpiryDate(entry.date))
    );
    if (candidate) {
      consumed.add(candidate.id);
      linked.set(usage.id, candidate.id);
    }
  }

  return entries.map(entry => entry.type === "used"
    ? { ...entry, earnedEntryId: linked.get(entry.id) }
    : entry);
}

export function getCompOffAvailableEntries(value: unknown, onDate: string): CompOffEntry[] {
  if (!isCompOffISODate(onDate)) return [];
  const entries = normalizeCompOffEntries(value);
  const usedIds = new Set(entries.filter(entry => entry.type === "used" && entry.date <= onDate && entry.earnedEntryId).map(entry => entry.earnedEntryId as string));
  return entries
    .filter(entry => entry.type === "earned" && entry.date <= onDate && (entry.expiresAt || compOffExpiryDate(entry.date)) >= onDate && !usedIds.has(entry.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function hasLinkedCompOffUsage(value: unknown, earnedEntryId: string): boolean {
  return normalizeCompOffEntries(value).some(entry => entry.type === "used" && entry.earnedEntryId === earnedEntryId);
}

export function isValidCompOffUsageDate(value: unknown, usedEntryId: string, date: string): boolean {
  if (!isCompOffISODate(date)) return false;
  const entries = normalizeCompOffEntries(value);
  const usage = entries.find(entry => entry.id === usedEntryId && entry.type === "used");
  if (!usage?.earnedEntryId) return false;
  const earned = entries.find(entry => entry.id === usage.earnedEntryId && entry.type === "earned");
  return Boolean(earned && date >= earned.date && date <= (earned.expiresAt || compOffExpiryDate(earned.date)));
}

