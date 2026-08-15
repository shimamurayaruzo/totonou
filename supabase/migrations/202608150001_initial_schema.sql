create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  thread_id text,
  channel text not null default 'gmail' check (channel in ('gmail', 'xserver')),
  account text not null default 'gmail' check (account in ('gmail', 'goodsystem')),
  sender_name text,
  sender_address text not null,
  recipient_addresses text[] not null default '{}',
  subject text not null,
  body_text text not null default '',
  body_html text,
  snippet text not null default '',
  received_at timestamptz not null,
  category text,
  triage_result jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  provider_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel, external_id)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_event_id text,
  source_message_id uuid references public.messages(id) on delete set null,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Asia/Tokyo',
  status text not null default 'confirmed',
  location text,
  html_link text,
  conflict_warning boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  unique (user_id, provider_event_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('email', 'manual', 'calendar')),
  message_id uuid references public.messages(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  title text not null,
  description text,
  priority text not null check (priority in ('urgent', 'today', 'anytime')),
  task_type text not null check (task_type in ('sukima', 'jikkuri')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'carried_over', 'cancelled')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  elapsed_minutes integer check (elapsed_minutes is null or elapsed_minutes >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  due_date date,
  carried_over_from uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  elapsed_minutes integer check (elapsed_minutes is null or elapsed_minutes >= 0),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null,
  goal text not null default '',
  result text not null default '',
  good_job text not null default '',
  bad_job text not null default '',
  rules text not null default '',
  improvements text not null default '',
  cheer text not null default '',
  schedule_comparison jsonb not null default '[]'::jsonb,
  exported_html text,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  level text not null check (level in ('INFO', 'WARN', 'ERROR')),
  operation text not null,
  message text not null,
  correlation_id text,
  context jsonb not null default '{}'::jsonb,
  human_note text,
  ai_todo text
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  dreams text not null default '',
  monthly_goals text not null default '',
  fetch_range text not null default 'last_5_days' check (fetch_range in ('latest_100', 'last_5_days')),
  coach_persona text not null default 'gentle_secretary' check (coach_persona in ('gentle_secretary', 'passionate_coach', 'butler')),
  mark_as_read boolean not null default true,
  domain_allowlist text[] not null default '{}',
  domain_blocklist text[] not null default '{}',
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  subject text not null,
  body_text text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  provider_message_id text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  summary text not null default '',
  completed_task_count integer not null default 0,
  total_task_count integer not null default 0,
  planned_minutes integer not null default 0,
  actual_minutes integer not null default 0,
  completion_rate numeric(5, 4) not null default 0,
  highlights jsonb not null default '[]'::jsonb,
  challenges jsonb not null default '[]'::jsonb,
  next_week_focus text not null default '',
  source_daily_review_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end >= week_start),
  check (completion_rate between 0 and 1),
  unique (user_id, week_start)
);

create table if not exists public.praise_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_review_id uuid not null references public.weekly_reviews(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'private', 'published')),
  body_text text not null,
  evidence jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekly_review_id)
);

create table if not exists public.mail_style_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  greeting text not null default '',
  closing text not null default '',
  formality text not null default 'balanced' check (formality in ('casual', 'balanced', 'formal')),
  average_length integer not null default 0 check (average_length >= 0),
  uses_emoji boolean not null default false,
  notes jsonb not null default '[]'::jsonb,
  sample_count integer not null default 0 check (sample_count >= 0),
  learned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_user_received_idx on public.messages (user_id, received_at desc);
create index if not exists messages_user_category_idx on public.messages (user_id, category);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date, status);
create index if not exists tasks_message_idx on public.tasks (message_id);
create unique index if not exists tasks_one_active_per_user_idx on public.tasks (user_id) where status = 'in_progress';
create index if not exists task_sessions_task_started_idx on public.task_sessions (task_id, started_at desc);
create unique index if not exists task_sessions_one_open_idx on public.task_sessions (task_id) where ended_at is null;
create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, start_at);
create index if not exists activity_logs_user_ts_idx on public.activity_logs (user_id, ts desc);
create index if not exists activity_logs_operation_idx on public.activity_logs (operation);
create index if not exists activity_logs_correlation_idx on public.activity_logs (correlation_id);
create index if not exists reply_drafts_message_idx on public.reply_drafts (message_id, created_at desc);

create or replace trigger messages_set_updated_at before update on public.messages for each row execute function public.set_updated_at();
create or replace trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create or replace trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create or replace trigger daily_reviews_set_updated_at before update on public.daily_reviews for each row execute function public.set_updated_at();
create or replace trigger settings_set_updated_at before update on public.settings for each row execute function public.set_updated_at();
create or replace trigger reply_drafts_set_updated_at before update on public.reply_drafts for each row execute function public.set_updated_at();
create or replace trigger weekly_reviews_set_updated_at before update on public.weekly_reviews for each row execute function public.set_updated_at();
create or replace trigger praise_posts_set_updated_at before update on public.praise_posts for each row execute function public.set_updated_at();
create or replace trigger mail_style_profiles_set_updated_at before update on public.mail_style_profiles for each row execute function public.set_updated_at();

alter table public.messages enable row level security;
alter table public.calendar_events enable row level security;
alter table public.tasks enable row level security;
alter table public.task_sessions enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.activity_logs enable row level security;
alter table public.settings enable row level security;
alter table public.reply_drafts enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.praise_posts enable row level security;
alter table public.mail_style_profiles enable row level security;

create policy "users_manage_own_messages" on public.messages for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_calendar_events" on public.calendar_events for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_tasks" on public.tasks for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_task_sessions" on public.task_sessions for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_daily_reviews" on public.daily_reviews for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_activity_logs" on public.activity_logs for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_settings" on public.settings for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_reply_drafts" on public.reply_drafts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_weekly_reviews" on public.weekly_reviews for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_praise_posts" on public.praise_posts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users_manage_own_mail_style_profiles" on public.mail_style_profiles for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
