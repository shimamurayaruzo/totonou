alter table public.tasks alter column status set default 'pending';

create index if not exists tasks_calendar_event_id_idx on public.tasks (calendar_event_id);
create index if not exists calendar_events_source_message_id_idx on public.calendar_events (source_message_id);
create index if not exists task_sessions_user_id_idx on public.task_sessions (user_id);
create index if not exists reply_drafts_user_id_idx on public.reply_drafts (user_id);
create index if not exists praise_posts_weekly_review_id_idx on public.praise_posts (weekly_review_id);
