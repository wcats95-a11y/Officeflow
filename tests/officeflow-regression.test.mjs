import test from "node:test";
import assert from "node:assert/strict";

import {
  compOffExpiryDate,
  normalizeCompOffEntries,
  getCompOffAvailableEntries,
  hasLinkedCompOffUsage,
  isValidCompOffUsageDate,
} from "../lib/comp-off.ts";
import {
  getMatterTaskTypesForAct,
  mergeStarterTaskTypes,
  starterTaskTypes,
  validateActYears,
  detectIncomeTaxYears,
  assessmentYearFromFinancialYear,
  isIncomeTaxTaskLike,
  nextRoundSequence,
  duplicateRound,
  roundStatusFromTaskStatus,
} from "../lib/income-tax-matters.ts";
import {
  HOLIDAY_PRESET_VERSION,
  presetHolidays2026_2027,
  mergePresetHolidays,
} from "../lib/officeflow-holidays.ts";
import { suggestNoticeDocuments, buildNoticeChecklist } from "../lib/officeflow-notice.ts";
import {
  OFFICEFLOW_BACKUP_SCHEMA_VERSION,
  isValidOfficeFlowBackup,
  migrateOfficeFlowBackup,
} from "../lib/officeflow-backup.ts";
import { meetingOccurrenceDates, meetingTimesOverlap, hasMeetingConflict } from "../lib/officeflow-scheduling.ts";
import { canSetTaskStatus, getTaskDeadlineDates } from "../lib/officeflow-task-rules.ts";

test("comp-off expires three calendar months after earning with end-of-month clamping", () => {
  assert.equal(compOffExpiryDate("2026-11-30"), "2027-02-28");
  assert.equal(compOffExpiryDate("2026-01-31"), "2026-04-30");
  assert.equal(compOffExpiryDate("2026-12-31"), "2027-03-31");
  assert.equal(compOffExpiryDate("not-a-date"), "");
});

test("deleting a used comp-off row restores only its linked, unexpired earned day", () => {
  const ledger = normalizeCompOffEntries([
    { id:"earned-a", type:"earned", date:"2026-01-01" },
    { id:"earned-b", type:"earned", date:"2026-01-15" },
    { id:"used-a", type:"used", date:"2026-02-01", earnedEntryId:"earned-a" },
    { id:"used-b", type:"used", date:"2026-02-10", earnedEntryId:"earned-b" },
  ]);
  assert.equal(getCompOffAvailableEntries(ledger,"2026-02-10").length,0);
  assert.equal(hasLinkedCompOffUsage(ledger,"earned-a"),true);
  assert.equal(isValidCompOffUsageDate(ledger,"used-a","2026-03-01"),true);
  assert.equal(isValidCompOffUsageDate(ledger,"used-a","2026-04-02"),false);

  const afterDelete = normalizeCompOffEntries(ledger.filter(entry=>entry.id!=="used-a"));
  assert.deepEqual(getCompOffAvailableEntries(afterDelete,"2026-02-10").map(entry=>entry.id),["earned-a"]);
  assert.equal(hasLinkedCompOffUsage(afterDelete,"earned-b"),true);
});

test("deleting usage after its earning entry has expired does not create a live balance", () => {
  const ledger = normalizeCompOffEntries([
    { id:"earned", type:"earned", date:"2026-01-31" },
    { id:"used", type:"used", date:"2026-02-15", earnedEntryId:"earned" },
  ]);
  const afterDelete = normalizeCompOffEntries(ledger.filter(entry=>entry.id!=="used"));
  assert.deepEqual(getCompOffAvailableEntries(afterDelete,"2026-05-01"),[]);
  assert.deepEqual(getCompOffAvailableEntries(afterDelete,"2026-04-30").map(entry=>entry.id),["earned"]);
});

test("Act 1961 and Act 2025 task catalogues stay separate and both load from an old workspace", () => {
  const oldWorkspaceTypes = starterTaskTypes().filter(item=>item.act==="Income-tax Act, 1961");
  const merged = mergeStarterTaskTypes(oldWorkspaceTypes);
  const act1961 = getMatterTaskTypesForAct(merged,"Compliance","Income-tax Act, 1961");
  const act2025 = getMatterTaskTypesForAct(merged,"Compliance","Income-tax Act, 2025");

  assert.ok(act1961.length>0);
  assert.ok(act2025.length>0);
  assert.ok(act1961.some(item=>item.taskType==="TDS return – Form 24Q"));
  assert.ok(act2025.some(item=>item.taskType==="TDS return preparation"));
  assert.ok(act2025.some(item=>item.taskType==="TDS/TCS default notice"));
  assert.ok(act1961.every(item=>item.act==="Income-tax Act, 1961"));
  assert.ok(act2025.every(item=>item.act==="Income-tax Act, 2025"));
  assert.deepEqual(getMatterTaskTypesForAct(merged,"","Income-tax Act, 2025"),[]);
});

test("FY/AY and Tax Year validation is Act-specific", () => {
  assert.equal(assessmentYearFromFinancialYear("2025-26"),"2026-27");
  assert.equal(validateActYears("Income-tax Act, 1961","2025-26","2026-27",""),null);
  assert.match(validateActYears("Income-tax Act, 1961","2025-26","2025-26","")||"",/do not match/);
  assert.equal(validateActYears("Income-tax Act, 2025","","","2026-27"),null);
  assert.match(validateActYears("Income-tax Act, 2025","","","2025-26")||"",/valid tax year/);
  const detected=detectIncomeTaxYears("FY 2025-26, AY 2026-27 and Tax Year 2026-27");
  assert.equal(detected.financialYear,"2025-26");
  assert.equal(detected.assessmentYear,"2026-27");
  assert.equal(detected.taxYear,"2026-27");
});

test("TDS/TCS remains in direct-tax classification while GST is excluded", () => {
  assert.equal(isIncomeTaxTaskLike({taskType:"TDS return – Form 24Q"}),true);
  assert.equal(isIncomeTaxTaskLike({title:"TCS statement Form 27EQ"}),true);
  assert.equal(isIncomeTaxTaskLike({taskType:"GST return GSTR-3B"}),false);
});

test("2026 Karnataka general and restricted references plus 2027 central and provisional dates are distinct", () => {
  const holidays=presetHolidays2026_2027();
  const byDate=new Map(holidays.map(item=>[item.date,item]));
  assert.equal(holidays.length, new Set(holidays.map(item=>item.date)).size);
  assert.equal(HOLIDAY_PRESET_VERSION,4);
  assert.equal(holidays.filter(item=>item.status==="restricted-reference").length,21);
  assert.equal(byDate.get("2026-03-30")?.name.includes("Mahavir"),true);
  assert.equal(byDate.has("2026-03-31"),false);
  assert.equal(byDate.get("2026-11-01")?.status,"karnataka-fixed");
  assert.equal(byDate.get("2026-01-01")?.status,"restricted-reference");
  assert.equal(byDate.get("2027-03-23")?.name,"Holi");
  assert.equal(byDate.get("2027-04-15")?.name,"Ram Navami");
  assert.equal(byDate.get("2027-08-25")?.name,"Janmashtami (Vaishnav)");
  assert.equal(byDate.get("2027-04-07")?.status,"provisional");
  assert.equal(byDate.get("2027-09-04")?.status,"provisional");
  assert.equal(byDate.get("2027-05-09")?.status,"provisional");
  assert.equal(byDate.get("2027-09-29")?.status,"provisional");
  assert.equal(byDate.get("2027-10-10")?.status,"provisional");
  assert.equal(byDate.get("2027-10-15")?.status,"provisional");
  assert.equal(byDate.get("2027-10-28")?.status,"provisional");
  assert.equal(byDate.get("2027-11-16")?.status,"provisional");
  assert.equal(byDate.has("2027-10-30"),false);
});

test("holiday v3 migration preserves user removals and removes obsolete provisional defaults", () => {
  const oldV3 = [
    {date:"2026-01-15",name:"Makara Sankranti",status:"karnataka-official"},
    {date:"2027-01-14",name:"Makara Sankranti (estimated)",status:"provisional"},
    {date:"2027-04-08",name:"Ugadi (estimated)",status:"provisional"},
    {date:"2027-05-09",name:"Basava Jayanthi (estimated)",status:"provisional"},
    {date:"2027-09-04",name:"Ganesh Chaturthi (estimated)",status:"provisional"},
    {date:"2027-09-29",name:"Mahalaya Amavasye (estimated)",status:"provisional"},
    {date:"2027-10-09",name:"Dussehra",status:"central-reference"},
    {date:"2027-10-10",name:"Vijayadashami (estimated)",status:"provisional"},
    {date:"2027-10-15",name:"Valmiki Jayanthi (estimated)",status:"provisional"},
    {date:"2027-10-30",name:"Balipadyami / Deepavali (estimated)",status:"provisional"},
    {date:"2027-11-16",name:"Kanakadasa Jayanthi (estimated)",status:"provisional"},
  ];
  const migrated=mergePresetHolidays(oldV3,3);
  const dates=new Set(migrated.map(item=>item.date));
  assert.equal(dates.has("2026-01-26"),false); // absent from the saved v3 list = deliberate removal
  assert.equal(dates.has("2026-01-01"),true);  // new restricted-reference date is added
  assert.equal(dates.has("2027-01-14"),false);
  assert.equal(dates.has("2027-04-08"),false);
  assert.equal(dates.has("2027-04-07"),true);
  assert.equal(dates.has("2027-09-04"),true);
  assert.equal(dates.has("2027-10-09"),true);
  assert.equal(dates.has("2027-10-10"),true);
  assert.equal(dates.has("2027-05-09"),true);
  assert.equal(dates.has("2027-09-29"),true);
  assert.equal(dates.has("2027-10-15"),true);
  assert.equal(dates.has("2027-11-16"),true);
  assert.equal(dates.has("2027-10-30"),false);
});

test("office-confirmed obsolete holiday is retained during migration; v4 removals stay removed", () => {
  const confirmed=mergePresetHolidays([
    {date:"2027-01-14",name:"Office Makara holiday",status:"office-confirmed"},
  ],3);
  assert.equal(confirmed.some(item=>item.date==="2027-01-14"&&item.status==="office-confirmed"),true);

  const savedV4=presetHolidays2026_2027().filter(item=>item.date!=="2026-01-26");
  const merged=mergePresetHolidays(savedV4,4);
  assert.equal(merged.some(item=>item.date==="2026-01-26"),false);
});

test("notice-derived document suggestions are added as reviewable checklist items", () => {
  const notice="Please furnish Form 16, bank statement, Form 26AS, AIS/TIS, ledger, invoices, challans, ITR, balance sheet, agreement, capital gains working, deduction proofs, TDS statement Form 24Q and deductee-wise records.";
  const suggestions=suggestNoticeDocuments(notice);
  assert.ok(suggestions.includes("Form 16 / salary certificate"));
  assert.ok(suggestions.includes("Form 26AS"));
  assert.ok(suggestions.includes("AIS / TIS"));
  assert.ok(suggestions.includes("TDS/TCS statements, TRACES downloads and reconciliations"));
  const checklist=buildNoticeChecklist("TDS/TCS notice",notice);
  assert.ok(checklist.includes("Notice and identified defaults analysed"));
  assert.ok(checklist.some(item=>item.startsWith("Suggested document — confirm before requesting:")));
});

test("backup validation rejects null directories, invalid schema numbers and malformed nested records", () => {
  const base={schemaVersion:1,tasks:[{id:"task-1",title:"Legacy task"}]};
  assert.equal(isValidOfficeFlowBackup(base),true);
  assert.equal(isValidOfficeFlowBackup({...base,juniorDirectory:null}),false);
  assert.equal(isValidOfficeFlowBackup({...base,schemaVersion:Number.NaN}),false);
  assert.equal(isValidOfficeFlowBackup({...base,schemaVersion:2.9}),false);
  assert.equal(isValidOfficeFlowBackup({...base,tasks:[{id:"task-1",title:"Bad task",checklist:[{text:"x",done:"yes"}]}]}),false);
  assert.equal(isValidOfficeFlowBackup({...base,compOffEntries:[{id:"x",type:"earned",date:"2026-02-30"}]}),false);
});

test("legacy backup migration fills missing fields and adds both Act catalogues without losing records", () => {
  const migrated=migrateOfficeFlowBackup({
    schemaVersion:1,
    tasks:[{id:"task-legacy",title:"Old assessment task"}],
    matterTaskTypes:[{id:"custom-1961",matterType:"Compliance",taskType:"Legacy custom TDS",active:true}],
  });
  assert.equal(migrated.schemaVersion,OFFICEFLOW_BACKUP_SCHEMA_VERSION);
  assert.equal(migrated.tasks[0].id,"task-legacy");
  assert.equal(migrated.tasks[0].status,"To Do");
  assert.deepEqual(migrated.tasks[0].juniors,[]);
  assert.equal(migrated.juniorDirectory.constructor,Object);
  assert.ok(migrated.matterTaskTypes.some(item=>item.id==="custom-1961"&&item.act==="Income-tax Act, 1961"));
  assert.ok(migrated.matterTaskTypes.some(item=>item.act==="Income-tax Act, 2025"&&item.matterType==="Compliance"));
  assert.equal(migrated.compOffHolidayPresetVersion,HOLIDAY_PRESET_VERSION);
  assert.ok(migrated.compOffHolidays.some(item=>item.date==="2026-01-01"&&item.status==="restricted-reference"));
});

test("task completion requires a real filing acknowledgement and deadline indicators include all date types", () => {
  assert.equal(canSetTaskStatus({}, "In Progress"),true);
  assert.equal(canSetTaskStatus({}, "Filed / completed"),false);
  assert.equal(canSetTaskStatus({filingAckDocument:{name:"ack.pdf",dataUrl:"data:application/pdf;base64,AA=="}}, "Filed / completed"),true);
  assert.deepEqual(
    getTaskDeadlineDates({statutoryDue:"2026-12-31",noticeDue:"2026-11-30",internalDue:"2026-11-30",due:"invalid"}),
    ["2026-11-30","2026-12-31"],
  );
});

test("meeting recurrence and overlap checks include future monthly occurrences", () => {
  assert.deepEqual(meetingOccurrenceDates("2026-01-31","Monthly",3),["2026-01-31","2026-02-28","2026-03-31"]);
  assert.equal(meetingTimesOverlap({date:"2026-02-28",start:"10:00",duration:60},{date:"2026-02-28",start:"11:00",duration:30}),false);
  assert.equal(hasMeetingConflict([{date:"2026-02-28",start:"10:30",duration:60}],{date:"2026-01-31",start:"10:00",duration:60,recurrence:"Monthly"},3),true);
});

test("matter round helpers preserve sequence, avoid duplicates and map reply status", () => {
  const rounds=[
    {id:"r1",matterId:"m1",roundType:"Assessment",sequenceNumber:1,replyStatus:"Not started",attachments:[],noticeNumber:"N-1",noticeDate:"2026-01-01"},
  ];
  assert.equal(nextRoundSequence(rounds,"Assessment"),2);
  assert.equal(duplicateRound(rounds,{roundType:"Assessment",noticeNumber:"N-1",noticeDate:"2026-01-01"}),true);
  assert.equal(duplicateRound(rounds,{roundType:"Assessment",noticeNumber:"N-2",noticeDate:"2026-01-01"}),false);
  assert.equal(roundStatusFromTaskStatus("Partially replied"),"Partially replied");
  assert.equal(roundStatusFromTaskStatus("Filed / completed"),"Fully replied");
});
