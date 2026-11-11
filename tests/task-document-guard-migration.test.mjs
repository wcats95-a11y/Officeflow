import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("junior workspace saves cannot overwrite task attachments or document links", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202611050001_preserve_manager_owned_task_documents.sql", import.meta.url), "utf8");

  assert.equal((migration.match(/v_safe:=v_submitted-array\[/g) || []).length, 2, "both updates and new-task submissions are guarded");
  assert.equal((migration.match(/'uploadedDocuments'/g) || []).length, 2);
  assert.equal((migration.match(/'documentLinks'/g) || []).length, 2);
  assert.match(migration, /v_role='manager'/);
  assert.match(migration, /createdByUserId/);
});

