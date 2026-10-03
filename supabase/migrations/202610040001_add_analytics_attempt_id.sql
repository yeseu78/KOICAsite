alter table public.weko_analytics_events
  add column if not exists attempt_id text;

create index if not exists weko_analytics_attempt_idx
  on public.weko_analytics_events (attempt_id, occurred_at desc)
  where attempt_id is not null;
