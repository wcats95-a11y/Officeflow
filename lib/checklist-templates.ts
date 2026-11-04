const checklistTemplates: Record<string, string[]> = {
  "income tax return filing": [
    "Engagement & Information Collection — Confirm scope, applicable year and filing requirements; request income, deduction, tax credit and bank details; track client documents.",
    "Source Data Review & Reconciliation — Review prior returns, AIS/TIS, Form 26AS, Form 16, books and supporting records; resolve mismatches and missing information.",
    "Computation & Return Preparation — Prepare the tax computation, verify regimes and eligible claims, and complete the applicable return schedules.",
    "Internal Review & Client Confirmation — Independently review the computation and return; resolve review points and obtain client confirmation.",
    "Filing, Verification & Acknowledgement — File the authorised return, complete e-verification, and save the ITR-V and filing records.",
  ],
  "itr filing": [
    "Engagement & Information Collection — Confirm scope, applicable year and filing requirements; request income, deduction, tax credit and bank details; track client documents.",
    "Source Data Review & Reconciliation — Review prior returns, AIS/TIS, Form 26AS, Form 16, books and supporting records; resolve mismatches and missing information.",
    "Computation & Return Preparation — Prepare the tax computation, verify regimes and eligible claims, and complete the applicable return schedules.",
    "Internal Review & Client Confirmation — Independently review the computation and return; resolve review points and obtain client confirmation.",
    "Filing, Verification & Acknowledgement — File the authorised return, complete e-verification, and save the ITR-V and filing records.",
  ],
  "tax audit": [
    "Engagement & Audit Planning — Confirm applicability, scope, reporting clauses, timelines and client responsibilities; issue the records request.",
    "Books & Evidence Examination — Obtain trial balance, ledgers, financial statements and evidence; perform audit procedures and document exceptions.",
    "Tax Reconciliation & Clause Review — Reconcile book profit with taxable income; examine statutory dues, disallowances, related parties and reportable transactions.",
    "Findings, Representation & Draft Report — Resolve queries with management, document representations and prepare the tax audit report and annexures.",
    "Partner Review & Finalisation — Complete independent review, clear observations and obtain approval of the final report.",
    "Filing & Record Retention — Upload the report, coordinate client acceptance, verify filing status and preserve the signed audit file.",
  ],
  "tds returns": [
    "Deduction Data & Challan Collection — Obtain payroll/vendor data, deductee PANs, deduction details, challans and prior-period records.",
    "Deduction & Payment Reconciliation — Reconcile deductions with books, challans and Form 26Q/24Q/27Q requirements; identify shortfalls and late payments.",
    "Statement Preparation & Validation — Prepare the quarterly statement and validate PAN, section, rates, amounts and challan allocation.",
    "Review & Correction — Independently review the statement, resolve validation errors and obtain authorised approval.",
    "Filing & Acknowledgement — File the statement, save the token/acknowledgement and track processing or defaults.",
  ],
  "tds defaults and notices": [
    "Default Analysis & Deadline Control — Review the TRACES/intimation or notice, identify quarter, section, default type, demand and response date.",
    "Challan, Return & Deductee Reconciliation — Reconcile books, challans, filed statements, PANs and deductee credits; identify correction requirements.",
    "Rectification or Reply Preparation — Prepare the correction statement or evidence-based response and supporting workings.",
    "Internal Review & Authorisation — Verify calculations, evidence, limitation and proposed relief; obtain approval to submit.",
    "Submission & Demand Follow-up — Submit the correction/response, save acknowledgement, monitor demand adjustment and advise the client.",
  ],
  "notice u/s 142(1)": [
    "Notice Analysis & Document Collection — Analyse the notice and identify all information, explanations and documents required; prepare and send the document requirement list to the client; follow up and collect the required documents.",
    "Document Verification & Reconciliation — Verify supporting documents; reconcile information with books of accounts, ITR, financial statements and other relevant records; identify discrepancies and missing information.",
    "Preparation of Reply & Annexures — Prepare the detailed response to the notice; prepare supporting statements, reconciliations and annexures.",
    "Internal Review & Approval — Submit the response for review; incorporate review comments; obtain final approval.",
    "Filing & Acknowledgement — File the response on the Income Tax portal; upload the filing acknowledgement and preserve supporting records.",
  ],
  "notice u/s 143(2)": [
    "Scrutiny Scope & Notice Analysis — Review the scrutiny notice, selected issues, assessment year, jurisdiction and response/hearing deadlines.",
    "Evidence Collection & Issue Reconciliation — Request and collect issue-specific records; reconcile return positions with books, statements and tax credits.",
    "Issue-wise Submissions & Annexures — Prepare fact-based responses, reconciliations and indexed supporting evidence for each scrutiny point.",
    "Internal Review & Client Approval — Review legal and factual positions, clear queries and obtain approval of the final submissions.",
    "Portal Filing & Hearing Follow-through — File submissions, retain acknowledgements, attend scheduled hearings and track further directions or orders.",
  ],
  "notice u/s 148": [
    "Reassessment Notice & Limitation Review — Verify service, statutory timelines, assessment year, recorded information and applicable reassessment provisions.",
    "Return & Information Reconciliation — Review the original return, reasons/information, books, tax credits and relevant transaction evidence.",
    "Response Strategy & Submissions — Advise on the response and return requirements; prepare issue-specific submissions and supporting annexures.",
    "Independent Review & Client Approval — Review jurisdiction, limitation, factual support and legal positions; obtain approval before submission.",
    "Filing, Hearing & Order Monitoring — File the response, preserve acknowledgement, attend hearings and assess the resulting order and remedies.",
  ],
  "notice u/s 148a": [
    "Show-cause & Limitation Analysis — Review the section 148A communication, information relied upon, service and statutory response period.",
    "Evidence Collection & Reconciliation — Obtain transaction evidence, books, return disclosures and explanations relevant to the alleged income.",
    "Evidence-based Objections & Reply — Prepare a reasoned response addressing each item of information with reconciliations and annexures.",
    "Internal Review & Approval — Review jurisdictional, limitation and factual objections; clear comments and obtain client approval.",
    "Portal Submission & Outcome Review — Submit within time, retain acknowledgement, examine the order and advise on subsequent reassessment steps.",
  ],
  "show cause notice (scn)": [
    "SCN, Allegations & Deadline Analysis — Identify the proposed action, allegations, statutory provision, evidence relied upon and response deadline.",
    "Evidence & Case Record Collection — Obtain the notice record, prior submissions, books and supporting documents; verify relevant facts.",
    "Point-wise Reply & Annexures — Draft a reasoned reply to each allegation with documentary support and legal submissions.",
    "Review, Conference & Approval — Conduct internal review, discuss material risks with the client and approve the final response.",
    "Submission & Hearing Follow-up — File the response, retain acknowledgement, attend hearing if scheduled and track the decision.",
  ],
  "intimation u/s 143(1)": [
    "Intimation & Processing Comparison — Compare the intimation with the filed return and identify adjustments, tax credits, interest and demand/refund.",
    "Return, Tax Credit & Computation Reconciliation — Verify reported income, deductions, TDS/TCS, advance tax and self-assessment payments.",
    "Rectification or Response Assessment — Determine the appropriate correction, rectification or response route and prepare supporting workings.",
    "Review & Client Approval — Review the proposed action, timelines and evidence; obtain approval to proceed.",
    "Portal Filing & Demand/Refund Tracking — Submit the application or response, retain acknowledgement and monitor the resulting adjustment.",
  ],
  "other notices": [
    "Notice Triage & Deadline Register — Identify authority, provision, issue, service date, response deadline and immediate procedural requirements.",
    "Records & Evidence Collection — Review prior filings and correspondence; request and collect issue-specific supporting documents.",
    "Issue Analysis & Draft Response — Reconcile facts with records and prepare a reasoned response with supporting annexures.",
    "Internal Review & Client Approval — Review legal and factual positions, address comments and obtain approval before filing.",
    "Submission & Follow-up — File the response, preserve acknowledgement and track hearings, orders and further action.",
  ],
  "assessment proceedings": [
    "Proceeding Review & Deadline Control — Review notices, jurisdiction, limitation, assessment year and hearing/response schedule.",
    "Client Records & Issue Reconciliation — Collect books, returns, statements and evidence; reconcile each query to source records.",
    "Issue-wise Submissions & Hearing Preparation — Prepare reasoned submissions, workings and indexed annexures; brief the client for hearings.",
    "Internal Review & Approval — Review facts, law and evidence; resolve review points and approve filings.",
    "Filing, Hearings & Order Review — File submissions, preserve acknowledgements, attend hearings and review the assessment order and demand.",
  ],
  "reassessment proceedings": [
    "Reopening Basis & Limitation Review — Examine reopening notices, reasons/information, jurisdiction, service and statutory timelines.",
    "Return & Transaction Evidence — Reconcile original filings and relevant transactions with books, tax credits and supporting records.",
    "Objections & Merits Submissions — Prepare procedural objections and evidence-based submissions addressing each reassessment issue.",
    "Review & Approval — Independently review limitation, jurisdiction, facts and legal positions; obtain client approval.",
    "Filing, Hearings & Order Follow-up — Submit responses, attend hearings, review the order and advise on demand, appeal or stay.",
  ],
  "appeal before cit(a)": [
    "Order, Demand & Limitation Review — Obtain the appealed order, demand and service evidence; assess appealability and limitation.",
    "Facts, Grounds & Evidence Compilation — Prepare statement of facts, grounds and indexed supporting documents; reconcile disputed additions.",
    "Appeal Filing & Demand Protection — Complete the appeal filing and assess stay/payment requirements for outstanding demand.",
    "Written Submissions & Hearing Preparation — Prepare issue-wise written submissions and paper book; track notices and hearing dates.",
    "Review of Appellate Order & Next Remedy — Analyse the order, consequential demand and available rectification or further appeal.",
  ],
  "itat appeal": [
    "Appeal Record & Limitation Review — Obtain the appellate order, grounds, service date and lower-authority record; verify limitation.",
    "Grounds, Paper Book & Stay Position — Finalise grounds, compile indexed evidence and assess pending demand and stay requirements.",
    "Written Submissions & Hearing Preparation — Prepare authorities and issue-wise submissions; track registry defects and hearing schedule.",
    "Internal Review & Client Conference — Review the record, submissions and hearing strategy; obtain approval.",
    "Hearing, Order & Further Remedy — Attend the hearing, analyse the order and advise on consequential action or further appeal.",
  ],
  "stay petition": [
    "Demand & Recovery Position — Reconcile demand with the order, tax credits and payments; confirm appeal and recovery status.",
    "Stay Strategy & Supporting Evidence — Assess merits, hardship, payment history and applicable conditions; obtain client instructions.",
    "Petition & Annexure Preparation — Draft the stay request with evidence, demand reconciliation and relevant orders.",
    "Review & Filing — Review the requested relief, obtain approval, file the petition and preserve acknowledgement.",
    "Hearing & Compliance Monitoring — Track the decision and recovery, comply with conditions and update the client.",
  ],
  "penalty notice": [
    "Notice, penalty provision and underlying order — Obtain the penalty notice, charge, underlying assessment/order and service evidence.",
    "Facts, limitation and merits review — Verify jurisdiction, limitation, satisfaction/recorded reasons and the statutory basis for penalty.",
    "Evidence and client information — Request and reconcile returns, books, prior submissions, explanations and supporting evidence.",
    "Draft point-wise penalty response — Address each proposed charge, facts, legal grounds and applicable defences with indexed annexures.",
    "Independent review and client approval — Review facts, law, calculations and evidence; resolve comments and obtain approval.",
    "Filing and acknowledgement — Submit the reply, preserve acknowledgement and track hearing, order and further remedies.",
  ],
  "tax opinion": [
    "Question, Scope & Assumptions — Define the question, relevant facts, years, scope, assumptions and documents required.",
    "Legal Research & Fact Verification — Verify records and research applicable provisions, rules, circulars and judicial authorities.",
    "Analysis, Alternatives & Risk Assessment — Analyse the law against the facts, compare alternatives and identify uncertainties and risks.",
    "Draft Opinion & Independent Review — Prepare a reasoned opinion with practical recommendations and obtain independent review.",
    "Client Discussion & Final Opinion — Resolve review points, discuss material conclusions and issue the final opinion with records.",
  ],
  "tax advisory": [
    "Engagement & Fact Collection — Confirm the client question, scope, transaction facts, relevant period and required records.",
    "Legal & Tax Analysis — Research applicable tax provisions and analyse consequences, compliance requirements and alternatives.",
    "Options, Risks & Recommendation — Compare practical options, quantify material impacts and document assumptions and risks.",
    "Review & Client Discussion — Review advice internally and discuss the recommendation and implementation requirements with the client.",
    "Final Advice & Follow-through — Issue written advice and track agreed implementation or subsequent compliance actions.",
  ],
  "other direct tax assignments": [
    "Scope & Deliverables — Confirm assignment objective, applicable year/Act, deliverables, timeline and client responsibilities.",
    "Records & Fact Verification — Obtain and verify relevant records, representations and prior compliance information.",
    "Technical Analysis & Work Product — Perform the assignment-specific analysis and prepare calculations, submissions or advice.",
    "Internal Review & Client Approval — Complete independent review, resolve comments and obtain necessary client approval.",
    "Final Delivery & Record Retention — Deliver the agreed output, record follow-up actions and preserve supporting work papers.",
  ],
};

function normaliseTaskType(taskType: string): string {
  return taskType.trim().toLowerCase().replace(/\s+/g, " ");
}

export function checklistTemplateForTaskType(taskType: string): string {
  const key = normaliseTaskType(taskType);
  const template = checklistTemplates[key];
  if (template) return template.map((stage) => `[ ] ${stage}`).join("\n");
  if (/^notice\s+u\/s\s*142\s*\(\s*1\s*\)/i.test(key)) return checklistTemplateForTaskType("Notice u/s 142(1)");
  if (/^notice\s+u\/s\s*143\s*\(\s*2\s*\)/i.test(key)) return checklistTemplateForTaskType("Notice u/s 143(2)");
  if (/^notice\s+u\/s\s*148a/i.test(key)) return checklistTemplateForTaskType("Notice u/s 148A");
  if (/^notice\s+u\/s\s*148/i.test(key)) return checklistTemplateForTaskType("Notice u/s 148");
  if (/show.?cause/i.test(key)) return checklistTemplateForTaskType("Show Cause Notice (SCN)");
  if (/143\s*\(\s*1\s*\)/i.test(key)) return checklistTemplateForTaskType("Intimation u/s 143(1)");
  if (/tds|traces/i.test(key)) return checklistTemplateForTaskType(/default|notice/i.test(key) ? "TDS Defaults and Notices" : "TDS Returns");
  if (/tax audit|audit report/i.test(key)) return checklistTemplateForTaskType("Tax Audit");
  if (/reassessment/i.test(key)) return checklistTemplateForTaskType("Reassessment Proceedings");
  if (/assessment|scrutiny/i.test(key)) return checklistTemplateForTaskType("Assessment Proceedings");
  if (/cit\s*\(?a\)?|first appeal/i.test(key)) return checklistTemplateForTaskType("Appeal before CIT(A)");
  if (/itat|tribunal/i.test(key)) return checklistTemplateForTaskType("ITAT Appeal");
  if (/stay/i.test(key)) return checklistTemplateForTaskType("Stay Petition");
  if (/itr|return filing/i.test(key)) return checklistTemplateForTaskType("Income Tax Return Filing");
  if (/advisory/i.test(key)) return checklistTemplateForTaskType("Tax Advisory");
  if (/opinion/i.test(key)) return checklistTemplateForTaskType("Tax Opinion");
  if (/penalty/i.test(key)) return checklistTemplateForTaskType("Penalty Notice");
  if (/other/i.test(key)) return checklistTemplateForTaskType("Other Direct Tax Assignments");
  return "";
}

export function applyChecklistTemplate(template: string, current: string): string {
  if (!template) return "";
  const completed = new Set(current.split("\n").filter((line) => /^\s*\[x\]/i.test(line)).map((line) => line.replace(/^\s*\[[xX ]\]\s*/, "").split(" — ")[0].trim().toLowerCase()));
  return template.split("\n").map((line) => {
    const stage = line.replace(/^\s*\[[xX ]\]\s*/, "").split(" — ")[0].trim().toLowerCase();
    return line.replace(/^\[ \]/, completed.has(stage) ? "[x]" : "[ ]");
  }).join("\n");
}
