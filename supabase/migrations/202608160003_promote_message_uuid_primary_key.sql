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
