-- Optional future unification: store Gmail rows in assignments too.
-- Not required for the current dashboard (it merges both tables via /api/assignments).

alter table public.assignments
  add column if not exists source text not null default 'manual',
  add column if not exists gmail_message_id text,
  add column if not exists sender text,
  add column if not exists description text;

-- Allow "Completed" in addition to legacy "Submitted".
alter table public.assignments
  drop constraint if exists assignments_status_check;

alter table public.assignments
  add constraint assignments_status_check
  check (status in ('Not Started', 'In Progress', 'Submitted', 'Completed'));

create unique index if not exists assignments_gmail_message_id_key
  on public.assignments (gmail_message_id)
  where gmail_message_id is not null;

create unique index if not exists gmail_assignments_gmail_message_id_key
  on public.gmail_assignments (gmail_message_id);
