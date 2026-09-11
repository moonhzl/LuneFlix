create table if not exists public.users (
    id bigint primary key,
    name text not null,
    email text not null unique,
    password_hash text not null,
    password_salt text not null,
    created_at timestamptz not null,
    role text not null default 'user',
    status text not null default 'active',
    last_login timestamptz,
    last_ip text,
    plan text not null default 'free',
    avatar text,
    subscription_status text not null default 'inactive',
    subscription_expires_at timestamptz,
    provider_customer_id text,
    provider_subscription_id text
);

create table if not exists public.payments (
    id bigint primary key,
    transaction_id text not null unique,
    user_id bigint not null references public.users(id) on delete restrict,
    plan text not null,
    amount numeric(12,2) not null,
    status text not null,
    created_at timestamptz not null
);

create table if not exists public.movies (
    id bigint primary key,
    title text not null,
    description text not null default '',
    genre text not null default 'Drama',
    category text not null default 'Filme',
    year integer,
    duration integer,
    rating text,
    poster_url text,
    banner_url text,
    video_url text,
    featured boolean not null default false,
    status text not null default 'active',
    created_at timestamptz not null
);

create table if not exists public.coupons (
    id bigint primary key,
    code text not null unique,
    discount_type text not null,
    discount_value numeric(12,2) not null,
    expires_at timestamptz,
    usage_limit integer,
    usage_count integer not null default 0,
    status text not null default 'active',
    created_at timestamptz not null
);

create table if not exists public.modules (
    key text primary key,
    name text not null,
    description text not null,
    status text not null default 'active',
    updated_at timestamptz not null
);

create table if not exists public.settings (
    key text primary key,
    value text not null
);

create table if not exists public.admin_logs (
    id bigint primary key,
    action text not null,
    admin_id bigint references public.users(id) on delete set null,
    affected_user_id bigint references public.users(id) on delete set null,
    description text not null,
    status text not null default 'success',
    ip text,
    created_at timestamptz not null
);

create table if not exists public.catalog_movies (
    id text primary key,
    title text not null,
    original_title text,
    imdb_id text unique,
    tmdb_id bigint unique,
    rating numeric(4,2),
    overview text,
    poster text,
    backdrop text,
    release_date date,
    genres jsonb not null default '[]'::jsonb,
    runtime integer,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table if not exists public.catalog_series (
    id text primary key,
    title text not null,
    original_title text,
    tmdb_id bigint unique,
    imdb_id text unique,
    rating numeric(4,2),
    overview text,
    poster text,
    backdrop text,
    first_air_date date,
    genres jsonb not null default '[]'::jsonb,
    seasons jsonb not null default '[]'::jsonb,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table if not exists public.system_logs (
    id text primary key,
    type text not null,
    user_id bigint references public.users(id) on delete set null,
    timestamp timestamptz not null,
    ip text,
    details text not null
);

create table if not exists public.security_logs (
    id bigint primary key,
    type text not null,
    user_id bigint references public.users(id) on delete set null,
    timestamp timestamptz not null,
    ip text,
    details text not null
);

create table if not exists public.password_reset_tokens (
    token_hash text primary key,
    user_id bigint not null references public.users(id) on delete cascade,
    expires_at timestamptz not null,
    used boolean not null default false
);

alter table public.users enable row level security;
alter table public.payments enable row level security;
alter table public.movies enable row level security;
alter table public.coupons enable row level security;
alter table public.modules enable row level security;
alter table public.settings enable row level security;
alter table public.admin_logs enable row level security;
alter table public.catalog_movies enable row level security;
alter table public.catalog_series enable row level security;
alter table public.system_logs enable row level security;
alter table public.security_logs enable row level security;
alter table public.password_reset_tokens enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
