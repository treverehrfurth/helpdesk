create table if not exists ticket_statuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

insert into ticket_statuses (name, sort_order) values
  ('New',         1),
  ('In Progress', 2),
  ('Resolved',    3),
  ('Closed',      4)
on conflict (name) do nothing;
