import type { SupabaseClient } from "@supabase/supabase-js";

export type CloudTask = {
  id: string;
  title: string;
  description: string;
  notes: string;
  status: "To Do" | "In Progress" | "Waiting for client" | "Waiting for documents" | "Under Review" | "On hold" | "Done";
  priority: "Urgent" | "High" | "Medium" | "Low";
  category: string;
  due: string;
  project: string;
  client: string;
  juniors: string[];
  financialYear?: string;
  assessmentYear?: string;
  taskType?: string;
  preparer?: string;
  reviewer?: string;
};

type WorkspaceRow = { id: string; owner_id: string; name: string };
type TaskRow = {
  id: string;
  title: string;
  description: string;
  notes: string;
  status: CloudTask["status"];
  priority: CloudTask["priority"];
  category: string;
  due_date: string | null;
  financial_year: string | null;
  assessment_year: string | null;
  task_type: string | null;
  preparer: string | null;
  reviewer: string | null;
  project_id: string | null;
  client_id: string | null;
  officeflow_projects?: { name: string | null } | null;
  officeflow_clients?: { name: string | null } | null;
  officeflow_task_juniors?: { officeflow_juniors: { name: string } | null }[];
};

/**
 * Workspace access is deliberately limited to a verified Supabase Auth user.
 * This keeps the database safe while Google Sign-In is being deferred.
 */
export async function getOrCreateOwnerWorkspace(client: SupabaseClient): Promise<WorkspaceRow> {
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new Error("Sign in is required before OfficeFlow can sync cloud data.");

  const { data: existing, error: readError } = await client
    .from("officeflow_workspaces")
    .select("id, owner_id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing as WorkspaceRow;

  const { data: created, error: createError } = await client
    .from("officeflow_workspaces")
    .insert({ owner_id: user.id, name: "OfficeFlow" })
    .select("id, owner_id, name")
    .single();

  if (createError) throw createError;
  return created as WorkspaceRow;
}

export async function loadCloudTasks(client: SupabaseClient, workspaceId: string): Promise<CloudTask[]> {
  const { data, error } = await client
    .from("officeflow_tasks")
    .select(`
      id, title, description, notes, status, priority, category, due_date,
      financial_year, assessment_year, task_type, preparer, reviewer,
      project_id, client_id,
      officeflow_projects(name),
      officeflow_clients(name),
      officeflow_task_juniors(officeflow_juniors(name))
    `)
    .eq("workspace_id", workspaceId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return ((data || []) as unknown as TaskRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    notes: row.notes || "",
    status: row.status,
    priority: row.priority,
    category: row.category || "General",
    due: row.due_date || "",
    project: row.officeflow_projects?.name || "",
    client: row.officeflow_clients?.name || "",
    juniors: (row.officeflow_task_juniors || [])
      .map((assignment) => assignment.officeflow_juniors?.name)
      .filter((name): name is string => Boolean(name)),
    financialYear: row.financial_year || undefined,
    assessmentYear: row.assessment_year || undefined,
    taskType: row.task_type || undefined,
    preparer: row.preparer || undefined,
    reviewer: row.reviewer || undefined,
  }));
}

export async function saveCloudTask(client: SupabaseClient, workspaceId: string, task: CloudTask): Promise<CloudTask> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(task.id);
  const payload = {
    ...(isUuid ? { id: task.id } : {}),
    workspace_id: workspaceId,
    title: task.title.trim(),
    description: task.description || "",
    notes: task.notes || "",
    status: task.status,
    priority: task.priority,
    category: task.category || "General",
    due_date: task.due || null,
    financial_year: task.financialYear || null,
    assessment_year: task.assessmentYear || null,
    task_type: task.taskType || null,
    preparer: task.preparer || null,
    reviewer: task.reviewer || null,
  };

  const { data, error } = await client
    .from("officeflow_tasks")
    .upsert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return { ...task, id: data.id as string };
}
