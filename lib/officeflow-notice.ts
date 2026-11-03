const NOTICE_DOCUMENT_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /form\s*16|salary certificate|salary slip/i, label: "Form 16 / salary certificate" },
  { pattern: /bank statement|bank account statement/i, label: "Bank statements for the relevant period" },
  { pattern: /form\s*26as|26as/i, label: "Form 26AS" },
  { pattern: /annual information statement|\bAIS\b|\bTIS\b/i, label: "AIS / TIS" },
  { pattern: /ledger|books of account/i, label: "Relevant ledgers and books of account" },
  { pattern: /invoice|bill|purchase register|sales register/i, label: "Invoices and sales / purchase registers" },
  { pattern: /challan|tax payment/i, label: "Tax payment challans" },
  { pattern: /income.?tax return|\bITR\b|return of income/i, label: "Filed income-tax return and computation" },
  { pattern: /financial statement|balance sheet|profit.?and.?loss|trial balance/i, label: "Financial statements and trial balance" },
  { pattern: /agreement|deed|contract/i, label: "Relevant agreements / deeds" },
  { pattern: /capital gain|share sale|property sale/i, label: "Capital-gains working and sale / purchase documents" },
  { pattern: /deduction|80c|80d|investment proof/i, label: "Deduction and investment proofs" },
  { pattern: /tds statement|form\s*24q|form\s*26q|form\s*27q|form\s*27eq|traces/i, label: "TDS/TCS statements, TRACES downloads and reconciliations" },
  { pattern: /withholding|deductee|tax deducted at source|tax collected at source/i, label: "Deductee / collectee-wise tax deduction records" },
];

export function suggestNoticeDocuments(noticeText: string): string[] {
  const text = String(noticeText || "");
  if (!text.trim()) return [];
  return NOTICE_DOCUMENT_RULES.filter(rule => rule.pattern.test(text)).map(rule => rule.label);
}

const NOTICE_MONTH_NUMBER:Record<string,number> = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function validNoticeDate(year:number,month:number,day:number):string {
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return "";
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function parseNoticeDateToken(token:string):string {
  const value=token.trim().replace(/,/g,"");
  let match=value.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if(match)return validNoticeDate(Number(match[1]),Number(match[2]),Number(match[3]));
  match=value.match(/^(\d{1,2})[/-]([A-Za-z]{3,9}|\d{1,2})[/-](\d{2,4})$/);
  if(match){const day=Number(match[1]);const month=Number(match[2])||NOTICE_MONTH_NUMBER[match[2].slice(0,3).toLowerCase()]||0;let year=Number(match[3]);if(year<100)year+=2000;return validNoticeDate(year,month,day);}
  match=value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if(match)return validNoticeDate(Number(match[3]),NOTICE_MONTH_NUMBER[match[2].slice(0,3).toLowerCase()]||0,Number(match[1]));
  match=value.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})$/);
  if(match)return validNoticeDate(Number(match[3]),NOTICE_MONTH_NUMBER[match[1].slice(0,3).toLowerCase()]||0,Number(match[2]));
  return "";
}
/** Extract an explicitly labelled response/deposit/hearing date using Indian dd-mm-yyyy ordering. */
export function extractNoticeDueDate(noticeText:string):string {
  const text=String(noticeText||"");if(!text.trim())return "";
  const patterns=[
    /(?:reply|respond|response|compliance|submit|submission|hearing|due\s+date|last\s+date|on\s+or\s+before|by)\D{0,45}(20\d{2}-\d{1,2}-\d{1,2})/i,
    /(?:reply|respond|response|compliance|submit|submission|hearing|due\s+date|last\s+date|on\s+or\s+before|by)\D{0,45}(\d{1,2}[/-](?:\d{1,2}|[A-Za-z]{3,9})[/-]\d{2,4})/i,
    /(?:reply|respond|response|compliance|submit|submission|hearing|due\s+date|last\s+date|on\s+or\s+before|by)\D{0,45}(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
  ];
  for(const pattern of patterns){const match=text.match(pattern);if(match)return parseNoticeDateToken(match[1]);}
  return "";
}


export function buildNoticeChecklist(kind: string, noticeText: string): string[] {
  const base: Record<string, string[]> = {
    "Show-cause notice": ["Notice and allegations analysed", "Documents required list sent", "Documents and evidence received", "Draft point-wise reply to allegations", "Prepare supporting annexures", "Send reply for review", "File reply and save acknowledgement"],
    "ITAT notice": ["Notice, appeal grounds and hearing directions analysed", "Required case papers and evidence list sent", "Documents and paper-book materials received", "Prepare written submissions", "Prepare paper book and annexures", "Send submissions for review", "File submissions and save acknowledgement"],
    "First appeal notice": ["Appeal/hearing notice and directions analysed", "Required evidence and supporting documents list sent", "Documents received and grounds cross-checked", "Prepare statement of facts / written submissions", "Prepare evidence compilation and annexures", "Send appeal submissions for review", "File submissions and save acknowledgement"],
    "TDS/TCS notice": ["Notice and identified defaults analysed", "Quarter-wise reconciliation and document list sent", "Challans, returns and supporting records received", "Prepare reconciliation and reply / correction statement", "Prepare supporting annexures", "Send reply for review", "Submit response and save acknowledgement"],
    "Penalty notice": ["Penalty charge, provision and notice analysed", "Evidence and supporting document list sent", "Documents and prior submissions received", "Prepare reply to proposed penalty", "Prepare supporting annexures", "Send reply for review", "File reply and save acknowledgement"],
    "Reassessment notice": ["Reassessment notice, reasons and requested details analysed", "Return, transaction and evidence list sent", "Documents and prior-year records received", "Prepare issue-wise response", "Prepare supporting annexures", "Send response for review", "File response and save acknowledgement"],
    "Scrutiny assessment notice": ["Scrutiny notice and questions analysed", "Question-wise document list sent", "Documents and reconciliations received", "Prepare question-wise response", "Prepare supporting annexures and workings", "Send response for review", "File response and save acknowledgement"],
    "Information request notice": ["Information request and each query analysed", "Query-wise document list sent", "Documents and explanations received", "Prepare point-wise response", "Prepare supporting annexures", "Send response for review", "Submit response and save acknowledgement"],
  };
  const selected = base[kind] || ["Notice analysed", "Documents required list sent", "Documents received", "Prepare the reply", "Prepare the annexures", "Sent to review", "Filed"];
  const suggestions = suggestNoticeDocuments(noticeText).map(name => "Suggested document — confirm before requesting: " + name);
  return [...selected, ...suggestions];
}
