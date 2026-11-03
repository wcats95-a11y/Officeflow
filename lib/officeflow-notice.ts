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
