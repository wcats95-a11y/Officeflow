alter table public.officeflow_notes
  add column pages jsonb not null default '[]'::jsonb;

update public.officeflow_notes
set pages = jsonb_build_array(jsonb_build_object(
  'id', gen_random_uuid()::text,
  'typed_text', typed_text,
  'handwriting_text', handwriting_text,
  'strokes', strokes
))
where pages = '[]'::jsonb;

alter table public.officeflow_notes
  add constraint officeflow_notes_pages_array check (jsonb_typeof(pages) = 'array');

create unique index officeflow_notes_one_journal_per_day_idx
  on public.officeflow_notes (user_id, note_date);
