// CHANGE: Income-tax matter domain helpers (workspace payload v2).
export type IncomeTaxAct = "Income-tax Act, 1961" | "Income-tax Act, 2025";
export type ReplyStatus = "Not started" | "Partially replied" | "Fully replied";
export type HearingOutcome = "Scheduled" | "Attended" | "Adjourned" | "Order reserved" | "Order passed";

export type MatterRound = {
  id: string;
  matterId: string;
  roundType: string;
  sequenceNumber: number;
  noticeNumber?: string;
  noticeDate?: string;
  dueDate?: string;
  hearingAt?: string;
  replyStatus: ReplyStatus;
  hearingOutcome?: HearingOutcome;
  nextHearingDate?: string;
  outcome?: string;
  notes?: string;
  attachments: { name: string; dataUrl?: string; url?: string }[];
};

export type IncomeTaxMatter = {
  id: string;
  client: string;
  name: string;
  matterType: string;
  act: IncomeTaxAct;
  financialYear?: string;
  assessmentYear?: string;
  taxYear?: string;
  nextAction?: string;
  dueDate?: string;
  status: "Open" | "Closed" | "On hold";
  rounds: MatterRound[];
};

export type ClientGroup = { id: string; name: string; clientNames: string[] };

export type MatterTaskType = {
  id: string;
  matterType: string;
  taskType: string;
  act: IncomeTaxAct;
  sectionReference?: string;
  active: boolean;
  sortOrder: number;
};

export const DEFAULT_MATTER_TYPES = [
  "Assessment", "Appeal", "Rectification", "Refund", "Penalty", "Prosecution", "Other",
];

const STARTER_1961: Record<string, string[]> = {
  Assessment: ["Notice u/s 143(2)", "Notice u/s 142(1)", "Notice u/s 148", "Notice u/s 148A", "Show cause notice (SCN)", "Intimation u/s 143(1)", "Other"],
  Appeal: ["Filing appeal", "Hearing notice", "Appeal order received", "Stay application", "Other"],
  Rectification: ["Rectification application u/s 154", "Order received", "Other"],
  Refund: ["Refund status follow-up", "Refund reissue request", "Other"],
  Penalty: ["Penalty notice", "Reply filed", "Penalty order", "Other"],
  Prosecution: ["Notice received", "Reply filed", "Other"],
  Other: ["Other"],
};

export function starterTaskTypes(): MatterTaskType[] {
  return Object.entries(STARTER_1961).flatMap(([matterType, names]) =>
    names.map((taskType, index) => ({
      id: `1961-${matterType}-${index}`, matterType, taskType,
      act: "Income-tax Act, 1961" as const,
      sectionReference: taskType.match(/u\\/s\\s+([0-9A-Za-z()]+)/)?.[1] || "",
      active: true, sortOrder: index,
    })),
  );
}

export function yearOptions(currentYear = new Date().getFullYear(), pastYears = 30, futureYears = 10): string[] {
  return Array.from({ length: pastYears + futureYears + 1 }, (_, i) => currentYear + futureYears - i);
}

export function financialYearOptions(): string[] {
  const years = yearOptions(new Date().getFullYear() + 1, 40, 10);
  return years.map(y => `${y - 1}-${String(y).slice(-2)}`);
}

export function assessmentYearFromFinancialYear(fy: string): string {
  const match = fy.match(/^(\\d{4})-(\\d{2}|\\d{4})$/);
  if (!match) return "";
  const start = Number(match[1]);
  return `${start + 1}-${String(start + 2).slice(-2)}`;
}

export function detectIncomeTaxYears(text: string): {
  financialYear?: string; assessmentYear?: string; taxYear?: string;
} {
  const normalized = text.replace(/[–—]/g, "-");
  const ay = normalized.match(/(?:assessment\\s+year|\\bAY\\b)\\s*[:\-]?\\s*(20\\d{2}\\s*[-/]\\s*\\d{2,4})/i);
  const fy = normalized.match(/(?:financial\\s+year|previous\\s+year|\\bFY\\b)\\s*[:\-]?\\s*(20\\d{2}\\s*[-/]\\s*\\d{2,4})/i);
  const ty = normalized.match(/(?:tax\\s+year)\\s*[:\-]?\\s*(20\\d{2}(?:\\s*[-/]\\s*\\d{2,4})?)/i);
  const clean = (v?: string) => v?.replace(/\\s/g, "-").replace("/", "-");
  const result: { financialYear?: string; assessmentYear?: string; taxYear?: string } = {};
  if (fy) result.financialYear = clean(fy[1]);
  if (ay) result.assessmentYear = clean(ay[1]);
  if (ty) result.taxYear = clean(ty[1]);
  if (!result.financialYear && result.assessmentYear) {
    const m = result.assessmentYear.match(/^(20\\d{2})-(\\d{2,4})$/);
    if (m) result.financialYear = `${Number(m[1]) - 1}-${String(Number(m[1]) - 2000).padStart(2,"0")}`;
  }
  return result;
}

export function nextRoundSequence(rounds: MatterRound[], roundType: string): number {
  return rounds.filter(r => r.roundType === roundType).reduce((max, r) => Math.max(max, r.sequenceNumber), 0) + 1;
}

export function duplicateRound(rounds: MatterRound[], candidate: Pick<MatterRound, "roundType" | "noticeNumber" | "noticeDate">, exceptId?: string): boolean {
  return rounds.some(r => r.id !== exceptId && r.roundType === candidate.roundType &&
    (r.noticeNumber || "") === (candidate.noticeNumber || "") &&
    (r.noticeDate || "") === (candidate.noticeDate || ""));
}

export function roundStatusFromTaskStatus(status: string): ReplyStatus | null {
  if (status === "Partially replied") return "Partially replied";
  if (status === "Fully replied" || status === "Closed") return "Fully replied";
  return null;
}
