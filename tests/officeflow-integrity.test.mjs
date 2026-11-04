import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("task form normalizes create and edit paths and uses Act-specific WhatsApp year labels",()=>{
  const page=read("../app/page.tsx");
  assert.match(page,/const next=normalizeTaskActYearFields\(/);
  assert.doesNotMatch(page,/financialYear:t\.financialYear\|\|"2025-26"/);
  assert.match(page,/Tax year: /);
  assert.match(page,/Financial year \/ assessment year:/);
  assert.match(page,/combineNoticeChecklist\(checklistTemplateForTaskType\(taskType\),kind,text\)/);
});
test("earned comp-off date edits validate qualifying days and ask before reference holidays",()=>{
  const page=read("../app/page.tsx");
  assert.match(page,/The edited earning date must be a qualifying non-working day/);
  assert.match(page,/This is a central, restricted or provisional reference/);
});
test("journal cloud failures are visible and local recovery keys are account-scoped",()=>{
  const diary=read("../app/diary-notes.tsx");
  assert.match(diary,/:user:\$\{userId\}/);
  assert.match(diary,/const \{error\}=await supabase\.from\("officeflow_notes"\)\.upsert/);
  assert.match(diary,/Cloud save failed/);
  assert.match(diary,/saveError\|\|"All changes saved"/);
  assert.doesNotMatch(diary,/localStorage\.getItem\(storageKey\)/);
});
test("journal migration keeps duplicate-date legacy records without a destructive unique index",()=>{
  const migration=read("../supabase/migrations/202611040002_officeflow_daily_journal_pages.sql");
  assert.match(migration,/create index if not exists officeflow_notes_user_date_idx/);
  assert.doesNotMatch(migration,/create unique index officeflow_notes_one_journal_per_day_idx/);
});
test("workspace integrity migration checks all meaningful collections and protects filing acknowledgements",()=>{
  const sql=read("../supabase/migrations/20261104170000_officeflow_integrity_guards.sql");
  for(const field of ["tasks","clientDirectory","compOffEntries","meetings","clientGroups","matterRounds","juniorDirectory","auditLog","compOffHolidays"]) assert.ok(sql.includes("v_target_payload->'"+field+"'"),field);
  assert.ok(sql.includes("public.officeflow_notes"));
  assert.ok(sql.includes("filingAckDocument'->>'name'"));
  assert.ok(sql.includes("existing filing acknowledgement cannot be removed"));
});
test("local and cloud holiday hydration share inference when metadata is absent and obsolete staff key is removed only",()=>{
  const page=read("../app/page.tsx");
  assert.ok((page.match(/inferHolidayPresetVersion\(/g)||[]).length>=2);
  const backup=read("../lib/officeflow-backup.ts");
  assert.ok(backup.includes("inferHolidayPresetVersion(data.compOffHolidays)"));
  assert.ok(page.includes('localStorage.removeItem("officeflow-staff-credential-register")'));
  assert.doesNotMatch(page,/localStorage\.getItem\("officeflow-staff-credential-register"\)/);
});
