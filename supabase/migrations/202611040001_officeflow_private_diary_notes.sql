create table if not exists public.officeflow_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null,
  title text not null default '' check (char_length(title) <= 160),
  typed_text text not null default '' check (char_length(typed_text) <= 20000),
  handwriting_text text not null default '' check (char_length(handwriting_text) <= 20000),
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists officeflow_notes_user_date_idx
  on public.officeflow_notes (user_id, note_date desc, updated_at desc);

alter table public.officeflow_notes enable row level security;
grant select, insert, update, delete on public.officeflow_notes to authenticated;

create policy "Users can read their own notes"
  on public.officeflow_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own notes"
  on public.officeflow_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own notes"
  on public.officeflow_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own notes"
  on public.officeflow_notes for delete to authenticated using ((select auth.uid()) = user_id);
