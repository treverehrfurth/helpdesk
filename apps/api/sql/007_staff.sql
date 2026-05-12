create table if not exists staff (
  id uuid primary key,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('tech', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_is_active on staff (is_active);
