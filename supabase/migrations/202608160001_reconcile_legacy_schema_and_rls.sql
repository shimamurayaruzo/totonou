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

do $$
declare
  target_table text;
  current_type text;
  legacy_rows bigint;
  auth_user_count bigint;
  target_user_id uuid;
  has_unexpected_user boolean;
begin
  select
    (select count(*) from public.messages where user_id::text = 'default') +
    (select count(*) from public.tasks where user_id::text = 'default') +
    (select count(*) from public.calendar_events where user_id::text = 'default') +
    (select count(*) from public.daily_reviews where user_id::text = 'default') +
    (select count(*) from public.activity_logs where user_id::text = 'default') +
    (select count(*) from public.settings where user_id::text = 'default')
  into legacy_rows;

  if legacy_rows > 0 then
    select count(*) into auth_user_count from auth.users;
    if auth_user_count <> 1 then
      raise exception 'Expected exactly one Auth user before migrating legacy default-user rows';
    end if;
    select id into target_user_id from auth.users limit 1;
  end if;

  foreach target_table in array array[
    'messages', 'tasks', 'calendar_events', 'daily_reviews', 'activity_logs', 'settings'
  ] loop
    execute format('drop policy if exists phase1_default_user on public.%I', target_table);
    execute format('revoke all privileges on table public.%I from anon', target_table);
    execute format('alter table public.%I alter column user_id drop default', target_table);

    select data_type into current_type
    from information_schema.columns
    where table_schema = 'public' and table_name = target_table and column_name = 'user_id';

    if current_type = 'text' then
      execute format(
        'select exists(select 1 from public.%I where user_id <> ''default'')',
        target_table
      ) into has_unexpected_user;
      if has_unexpected_user then
        raise exception 'Unexpected non-default legacy user_id in table %', target_table;
      end if;

      if legacy_rows > 0 then
        execute format(
          'alter table public.%I alter column user_id type uuid using %L::uuid',
          target_table,
          target_user_id::text
        );
      else
        execute format(
          'alter table public.%I alter column user_id type uuid using nullif(user_id, '''')::uuid',
          target_table
        );
      end if;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = target_table
        and column_name = 'user_id' and data_type = 'uuid'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', target_table)::regclass
        and conname = target_table || '_user_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
        target_table,
        target_table || '_user_id_fkey'
      );
    end if;
  end loop;
end;
$$;

alter table public.messages add column if not exists id uuid;
alter table public.messages alter column id set default gen_random_uuid();
update public.messages set id = gen_random_uuid() where id is null;
alter table public.messages alter column id set not null;
create unique index if not exists messages_id_key on public.messages (id);

alter table public.messages add column if not exists external_id text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'message_id'
  ) then
    update public.messages set external_id = coalesce(external_id, message_id);
  end if;
end;
$$;
alter table public.messages alter column external_id set not null;
do $$
declare
  primary_key_column text;
begin
  select a.attname into primary_key_column
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.messages'::regclass
    and c.contype = 'p'
  limit 1;

  if primary_key_column = 'message_id' then
    alter table public.messages drop constraint messages_pkey;
    alter table public.messages alter column message_id drop not null;
    create unique index if not exists messages_legacy_message_id_idx
      on public.messages (message_id) where message_id is not null;
    alter table public.messages
      add constraint messages_pkey primary key using index messages_id_key;
  end if;
end;
$$;

alter table public.messages add column if not exists sender_name text;
alter table public.messages add column if not exists sender_address text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'from_name'
  ) then
    update public.messages set sender_name = coalesce(sender_name, from_name);
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'from_address'
  ) then
    update public.messages set sender_address = coalesce(sender_address, from_address);
  end if;
end;
$$;
update public.messages set sender_address = '' where sender_address is null;
alter table public.messages alter column sender_address set not null;

alter table public.messages add column if not exists recipient_addresses text[] not null default '{}';
alter table public.messages add column if not exists body_html text;
alter table public.messages add column if not exists provider_url text;
alter table public.messages add column if not exists updated_at timestamptz not null default now();
create unique index if not exists messages_user_channel_external_idx on public.messages (user_id, channel, external_id);

alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists estimated_minutes integer;
alter table public.tasks add column if not exists elapsed_minutes integer;
alter table public.tasks add column if not exists calendar_event_id uuid;
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'detail'
  ) then
    update public.tasks set description = coalesce(description, detail);
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'est_min'
  ) then
    update public.tasks set estimated_minutes = coalesce(estimated_minutes, est_min);
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'actual_min'
  ) then
    update public.tasks set elapsed_minutes = coalesce(elapsed_minutes, actual_min);
  end if;
end;
$$;
update public.tasks
set status = case status
  when 'todo' then 'pending'
  when 'doing' then 'in_progress'
  when 'done' then 'completed'
  else status
end;
alter table public.tasks alter column status set default 'pending';

alter table public.tasks add column if not exists message_record_id uuid;
do $$
declare
  current_type text;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks' and column_name = 'message_id';

  if current_type = 'text' and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'legacy_message_id'
  ) then
    update public.tasks t
    set message_record_id = m.id
    from public.messages m
    where t.message_id is not null
      and m.message_id = t.message_id
      and m.user_id = t.user_id;

    if exists (
      select 1
      from public.tasks
      where message_id is not null and message_record_id is null
    ) then
      raise exception 'Not all legacy task message references could be migrated';
    end if;

    alter table public.tasks drop constraint if exists tasks_message_id_fkey;
    drop index if exists public.tasks_message_id_idx;
    alter table public.tasks rename column message_id to legacy_message_id;
    alter table public.tasks rename column message_record_id to message_id;
  elsif current_type = 'uuid' then
    alter table public.tasks drop column if exists message_record_id;
  end if;
end;
$$;
create index if not exists tasks_message_id_idx on public.tasks (message_id);
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'legacy_message_id'
  ) then
    create index if not exists tasks_legacy_message_id_idx on public.tasks (legacy_message_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name = 'message_id' and data_type = 'uuid'
  ) and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_message_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_message_id_fkey
      foreign key (message_id) references public.messages(id) on delete set null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name = 'calendar_event_id' and data_type = 'uuid'
  ) and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_calendar_event_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_calendar_event_id_fkey
      foreign key (calendar_event_id) references public.calendar_events(id) on delete set null;
  end if;
end;
$$;
create unique index if not exists tasks_one_active_per_user_idx on public.tasks (user_id) where status = 'in_progress';
create index if not exists tasks_calendar_event_id_idx on public.tasks (calendar_event_id);

alter table public.calendar_events add column if not exists provider_event_id text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_events' and column_name = 'external_id'
  ) then
    update public.calendar_events set provider_event_id = coalesce(provider_event_id, external_id);
  end if;
end;
$$;
alter table public.calendar_events add column if not exists source_message_id uuid;
alter table public.calendar_events add column if not exists description text;
alter table public.calendar_events add column if not exists timezone text not null default 'Asia/Tokyo';
alter table public.calendar_events add column if not exists status text not null default 'confirmed';
alter table public.calendar_events add column if not exists html_link text;
alter table public.calendar_events add column if not exists conflict_warning boolean not null default false;
alter table public.calendar_events add column if not exists created_at timestamptz not null default now();
alter table public.calendar_events add column if not exists updated_at timestamptz not null default now();
create unique index if not exists calendar_events_user_provider_idx on public.calendar_events (user_id, provider_event_id);
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_events'
      and column_name = 'source_message_id' and data_type = 'uuid'
  ) and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calendar_events'::regclass and conname = 'calendar_events_source_message_id_fkey'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_source_message_id_fkey
      foreign key (source_message_id) references public.messages(id) on delete set null;
  end if;
end;
$$;
create index if not exists calendar_events_source_message_id_idx on public.calendar_events (source_message_id);

alter table public.daily_reviews add column if not exists review_date date;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'daily_reviews' and column_name = 'date'
  ) then
    update public.daily_reviews set review_date = coalesce(review_date, date);
  end if;
end;
$$;
alter table public.daily_reviews alter column review_date set not null;
alter table public.daily_reviews add column if not exists schedule_comparison jsonb not null default '[]'::jsonb;
alter table public.daily_reviews add column if not exists status text not null default 'draft';
create unique index if not exists daily_reviews_user_review_date_idx on public.daily_reviews (user_id, review_date);

alter table public.settings add column if not exists id uuid;
alter table public.settings alter column id set default gen_random_uuid();
update public.settings set id = gen_random_uuid() where id is null;
alter table public.settings alter column id set not null;
create unique index if not exists settings_id_key on public.settings (id);
alter table public.settings add column if not exists domain_allowlist text[] not null default '{}';
alter table public.settings add column if not exists domain_blocklist text[] not null default '{}';
alter table public.settings add column if not exists timezone text not null default 'Asia/Tokyo';
update public.settings
set fetch_range = case fetch_range
  when '100' then 'latest_100'
  when 'latest100' then 'latest_100'
  when '24h' then 'last_5_days'
  when 'days5' then 'last_5_days'
  when '3d' then 'last_5_days'
  when '7d' then 'last_5_days'
  else fetch_range
end,
coach_persona = case coach_persona
  when 'gentle' then 'gentle_secretary'
  when 'polite' then 'gentle_secretary'
  when 'passionate' then 'passionate_coach'
  else coach_persona
end;
alter table public.settings alter column fetch_range set default 'last_5_days';
alter table public.settings alter column coach_persona set default 'gentle_secretary';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_status_valid'
  ) then
    alter table public.tasks
      add constraint tasks_status_valid
      check (status in ('pending', 'in_progress', 'completed', 'carried_over', 'cancelled'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.settings'::regclass and conname = 'settings_fetch_range_valid'
  ) then
    alter table public.settings
      add constraint settings_fetch_range_valid
      check (fetch_range in ('latest_100', 'last_5_days'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.settings'::regclass and conname = 'settings_coach_persona_valid'
  ) then
    alter table public.settings
      add constraint settings_coach_persona_valid
      check (coach_persona in ('gentle_secretary', 'passionate_coach', 'butler'));
  end if;
end;
$$;

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
create index if not exists task_sessions_task_started_idx on public.task_sessions (task_id, started_at desc);
create index if not exists task_sessions_user_id_idx on public.task_sessions (user_id);
create unique index if not exists task_sessions_one_open_idx on public.task_sessions (task_id) where ended_at is null;

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
create index if not exists reply_drafts_message_idx on public.reply_drafts (message_id, created_at desc);
create index if not exists reply_drafts_user_id_idx on public.reply_drafts (user_id);

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
  completion_rate numeric(5, 4) not null default 0 check (completion_rate between 0 and 1),
  highlights jsonb not null default '[]'::jsonb,
  challenges jsonb not null default '[]'::jsonb,
  next_week_focus text not null default '',
  source_daily_review_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end >= week_start),
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

create index if not exists praise_posts_weekly_review_id_idx on public.praise_posts (weekly_review_id);

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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'messages', 'tasks', 'calendar_events', 'daily_reviews', 'activity_logs',
    'settings', 'task_sessions', 'reply_drafts', 'weekly_reviews',
    'praise_posts', 'mail_style_profiles'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists phase1_default_user on public.%I', table_name);
    execute format('drop policy if exists users_manage_own_rows on public.%I', table_name);
    execute format(
      'create policy users_manage_own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
    execute format('revoke all privileges on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
  end loop;
end;
$$;

create or replace trigger messages_set_updated_at before update on public.messages for each row execute function public.set_updated_at();
create or replace trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create or replace trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create or replace trigger daily_reviews_set_updated_at before update on public.daily_reviews for each row execute function public.set_updated_at();
create or replace trigger settings_set_updated_at before update on public.settings for each row execute function public.set_updated_at();
create or replace trigger reply_drafts_set_updated_at before update on public.reply_drafts for each row execute function public.set_updated_at();
create or replace trigger weekly_reviews_set_updated_at before update on public.weekly_reviews for each row execute function public.set_updated_at();
create or replace trigger praise_posts_set_updated_at before update on public.praise_posts for each row execute function public.set_updated_at();
create or replace trigger mail_style_profiles_set_updated_at before update on public.mail_style_profiles for each row execute function public.set_updated_at();
