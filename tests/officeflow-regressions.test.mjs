import test from "node:test";
import assert from "node:assert/strict";
import {
  compOffExpiryDate, normalizeCompOffEntries, getCompOffAvailableEntries,
  hasLinkedCompOffUsage, isValidCompOffUsageDate
} from "../lib/comp-off.ts";
import {
  starterTaskTypes, mergeStarterTaskTypes, mergeMatterTypeNames,
  taxYearOptions, normalizeTaxYear, validateActYears, isIncomeTaxTaskLike
} from "../lib/income-tax-matters.ts";
import {
  presetHolidays2026_2027, mergePresetHolidays
} from "../lib/officeflow-holidays.ts";
import { isValidOfficeFlowBackup } from "../lib/officeflow-backup.ts";
import { meetingOccurrenceDates, meetingTimesOverlap, hasMeetingConflict } from "../lib/officeflow-scheduling.ts";

test("comp-off expiry uses three calendar months with end-of-month clamping",()=>{
  assert.equal(compOffExpiryDate("2025-11-30"),"2026-02-28");
  assert.equal(compOffExpiryDate("2024-01-31"),"2024-04-30");
  assert.equal(compOffExpiryDate("2024-02-29"),"2024-05-29");
});

test("future earned days are not available before their earned date",()=>{
  const entries=[{id:"future",type:"earned",date:"2026-11-10",expiresAt:"2027-02-10"}];
  assert.deepEqual(getCompOffAvailableEntries(entries,"2026-11-03"),[]);
});

test("legacy usage is linked FIFO and deleting one usage restores only its earned day",()=>{
  const legacy=[
    {id:"e1",type:"earned",date:"2026-01-01",expiresAt:"2026-04-01"},
    {id:"e2",type:"earned",date:"2026-01-15",expiresAt:"2026-04-15"},
    {id:"u1",type:"used",date:"2026-02-01"},
    {id:"u2",type:"used",date:"2026-02-02"}
  ];
  const normalized=normalizeCompOffEntries(legacy);
  assert.equal(normalized.find(x=>x.id==="u1").earnedEntryId,"e1");
  assert.equal(normalized.find(x=>x.id==="u2").earnedEntryId,"e2");
  assert.equal(getCompOffAvailableEntries(normalized,"2026-03-01").length,0);
  const afterDelete=normalized.filter(x=>x.id!=="u1");
  assert.deepEqual(getCompOffAvailableEntries(afterDelete,"2026-03-01").map(x=>x.id),["e1"]);
  assert.equal(hasLinkedCompOffUsage(afterDelete,"e1"),false);
});

test("linked usage date cannot be moved outside its earned validity window",()=>{
  const entries=normalizeCompOffEntries([
    {id:"e",type:"earned",date:"2026-01-01",expiresAt:"2026-04-01"},
    {id:"u",type:"used",date:"2026-02-01",earnedEntryId:"e"}
  ]);
  assert.equal(isValidCompOffUsageDate(entries,"u","2026-01-01"),true);
  assert.equal(isValidCompOffUsageDate(entries,"u","2026-04-02"),false);
});

test("Act-specific catalogues remain separate and partial saved 2025 lists are completed",()=>{
  const defaults=starterTaskTypes();
  assert.ok(defaults.some(x=>x.act==="Income-tax Act, 1961"&&x.matterType==="Assessment"));
  assert.ok(defaults.some(x=>x.act==="Income-tax Act, 2025"&&x.matterType==="Assessment"));
  assert.ok(defaults.some(x=>x.act==="Income-tax Act, 1961"&&x.matterType==="Compliance"&&/TDS/.test(x.taskType)));
  assert.ok(defaults.some(x=>x.act==="Income-tax Act, 2025"&&x.matterType==="Compliance"&&/TCS/.test(x.taskType)));
  const saved=[{...defaults.find(x=>x.act==="Income-tax Act, 2025"),active:false,taskType:"User-edited assessment"}];
  const merged=mergeStarterTaskTypes(saved);
  assert.ok(merged.some(x=>x.act==="Income-tax Act, 2025"&&x.taskType==="User-edited assessment"&&!x.active));
  assert.ok(merged.some(x=>x.act==="Income-tax Act, 2025"&&x.matterType==="Appeal"));
  assert.ok(merged.some(x=>x.act==="Income-tax Act, 1961"&&x.matterType==="Assessment"));
  assert.ok(mergeMatterTypeNames(["Custom matter"]).includes("Custom matter"));
});

test("direct-tax classification includes TDS and TCS but excludes GST",()=>{
  assert.equal(isIncomeTaxTaskLike({taskType:"TDS return – Form 24Q",matterType:"Compliance"}),true);
  assert.equal(isIncomeTaxTaskLike({taskType:"TCS return – Form 27EQ",matterType:"Compliance"}),true);
  assert.equal(isIncomeTaxTaskLike({title:"Tax collected at source default notice"}),true);
  assert.equal(isIncomeTaxTaskLike({title:"GST reconciliation"}),false);
});

test("tax-year and FY/AY validation enforces the correct Act format",()=>{
  assert.equal(normalizeTaxYear("2026"),"2026-27");
  assert.deepEqual(taxYearOptions(2026,1),["2026-27","2027-28"]);
  assert.equal(validateActYears("Income-tax Act, 2025","","","2026-27"),null);
  assert.equal(validateActYears("Income-tax Act, 2025","","","2025-26")!==null,true);
  assert.equal(validateActYears("Income-tax Act, 1961","2025-26","2026-27",""),null);
  assert.equal(validateActYears("Income-tax Act, 1961","2025-26","2025-26","")!==null,true);
});

test("holiday presets include revised 2026 date and 2027 central plus Karnataka reference dates",()=>{
  const dates=new Set(presetHolidays2026_2027().map(x=>x.date));
  assert.ok(dates.has("2026-03-30"));
  assert.ok(!dates.has("2026-03-31"));
  assert.ok(dates.has("2027-03-10"));
  assert.ok(dates.has("2027-06-16"));
  assert.ok(dates.has("2027-11-01"));
  assert.ok(dates.has("2027-11-16"));
});

test("holiday migration preserves a previously removed 2026 preset while adding new 2027 dates",()=>{
  const all=presetHolidays2026_2027();
  const oldDates=["2026-01-15","2026-01-26","2026-03-19","2026-03-21","2026-03-31","2026-04-03","2026-04-14","2026-04-20","2026-05-01","2026-05-28","2026-06-26","2026-08-15","2026-08-26","2026-09-14","2026-10-02","2026-10-20","2026-10-21","2026-11-10","2026-11-27","2026-12-25","2027-01-26","2027-05-01","2027-08-15","2027-10-02","2027-11-01","2027-12-25"];
  const saved=oldDates.filter(date=>date!=="2026-01-15").map(date=>({date,name:date}));
  const migrated=mergePresetHolidays(saved,2);
  assert.ok(!migrated.some(x=>x.date==="2026-01-15"));
  assert.equal(migrated.find(x=>x.date==="2026-01-26").status,"national");
  assert.ok(migrated.some(x=>x.date==="2027-03-10"));
  const current=mergePresetHolidays([{date:"2026-01-26",name:"Republic Day"}],3);
  assert.ok(current.some(x=>x.date==="2026-01-26"&&x.name==="Republic Day"));
  assert.ok(current.some(x=>x.date==="2026-01-01"&&x.status==="restricted-reference"));
  assert.ok(!current.some(x=>x.date==="2026-03-19"));
  assert.ok(all.length>30);
});

test("backup validation rejects null directories and malformed nested records",()=>{
  const valid={schemaVersion:2.7,tasks:[],juniorDirectory:{},clientDirectory:[],compOffEntries:[],compOffHolidays:[],meetings:[],auditLog:[]};
  assert.equal(isValidOfficeFlowBackup(valid),true);
  assert.equal(isValidOfficeFlowBackup({...valid,juniorDirectory:null}),false);
  assert.equal(isValidOfficeFlowBackup({...valid,meetings:[{id:"m",date:"2026-11-03",start:"25:99",duration:30,subject:"x",client:"y"}]}),false);
  assert.equal(isValidOfficeFlowBackup({...valid,tasks:[{id:"t",title:"Task",juniors:null}]}),false);
});

test("recurring meetings expand with month-end clamping and conflicts check every occurrence",()=>{
  assert.deepEqual(meetingOccurrenceDates("2027-01-31","Monthly",3),["2027-01-31","2027-02-28","2027-03-31"]);
  assert.equal(meetingTimesOverlap({date:"2027-01-01",start:"10:00",duration:60},{date:"2027-01-01",start:"11:00",duration:30}),false);
  assert.equal(meetingTimesOverlap({date:"2027-01-01",start:"10:00",duration:60},{date:"2027-01-01",start:"10:30",duration:30}),true);
  assert.equal(hasMeetingConflict([{date:"2027-01-08",start:"10:00",duration:60}],{date:"2027-01-01",start:"10:30",duration:30,recurrence:"Weekly"},2),true);
});

test("comp-off normalization recalculates mismatched expiry and never reassigns an invalid explicit usage link",()=>{
  const rows=normalizeCompOffEntries([
    {id:"e1",type:"earned",date:"2026-01-31",expiresAt:"2030-12-31"},
    {id:"e2",type:"earned",date:"2026-04-01",expiresAt:"2026-07-01"},
    {id:"u1",type:"used",date:"2026-05-01",earnedEntryId:"e1"},
  ]);
  assert.equal(rows.find(x=>x.id==="e1").expiresAt,"2026-04-30");
  assert.equal(rows.find(x=>x.id==="u1").earnedEntryId,"e1");
  assert.ok(getCompOffAvailableEntries(rows,"2026-05-01").some(x=>x.id==="e2"));
});
test("incidental GST text in a direct-tax description does not change task classification",()=>{
  assert.equal(isIncomeTaxTaskLike({taskType:"Assessment",matterType:"Assessment",category:"Direct-tax litigation",description:"Reconcile GST references mentioned in the income-tax notice"}),true);
  assert.equal(isIncomeTaxTaskLike({taskType:"GST return",category:"GST"}),false);
});
test("matter-round backup rejects zero/fractional sequence numbers, invalid dates and unknown statuses",()=>{
  const base={schemaVersion:2.7,tasks:[],matterRounds:[],juniorDirectory:{},clientDirectory:[],compOffEntries:[],compOffHolidays:[],meetings:[],auditLog:[]};
  const round={id:"r",matterId:"m",roundType:"Assessment",sequenceNumber:1,replyStatus:"Not started",attachments:[]};
  assert.equal(isValidOfficeFlowBackup({...base,matterRounds:[round]}),true);
  assert.equal(isValidOfficeFlowBackup({...base,matterRounds:[{...round,sequenceNumber:0}]}),false);
  assert.equal(isValidOfficeFlowBackup({...base,matterRounds:[{...round,sequenceNumber:1.5}]}),false);
  assert.equal(isValidOfficeFlowBackup({...base,matterRounds:[{...round,dueDate:"2026-02-30"}]}),false);
  assert.equal(isValidOfficeFlowBackup({...base,matterRounds:[{...round,replyStatus:"Unknown"}]}),false);
});
test("2027 central and Karnataka holiday references remain distinct and provisional dates are not fixed",()=>{
  const holidays=presetHolidays2026_2027();
  const byDate=(date)=>holidays.find(item=>item.date===date);
  assert.equal(byDate("2027-05-01")?.status,"provisional");
  assert.equal(byDate("2027-11-01")?.status,"provisional");
  assert.equal(byDate("2027-10-09")?.status,"central-reference");
  assert.equal(byDate("2027-10-10")?.status,"provisional");
  assert.equal(byDate("2027-10-29")?.status,"central-reference");
  assert.equal(byDate("2027-10-30")?.status,"provisional");
});
