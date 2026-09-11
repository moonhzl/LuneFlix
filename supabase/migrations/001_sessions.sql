create table if not exists public.sessions (
    token_hash text primary key,
    user_id bigint not null,
    user_data jsonb not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists sessions_expires_at_idx on public.sessions (expires_at);

alter table public.sessions enable row level security;

revoke all on public.sessions from anon, authenticated;
grant all on public.sessions to service_role;

create or replace function public.delete_expired_sessions()
returns void
language sql
security definer
set search_path = public
as $$
    delete from public.sessions where expires_at <= now();
$$;
