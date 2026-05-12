create table if not exists tickets (
  id uuid primary key,
  requester_email text not null,
  requester_name text not null,
  title text not null,
  category text not null,
  description text not null,
  status text not null,
  assigned_to_email text null,
  assigned_to_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_attachments (
  id uuid primary key,
  ticket_id uuid not null references tickets(id) on delete cascade,
  file_name text not null,
  storage_url text null,
  created_at timestamptz not null default now()
);

create table if not exists ticket_activity (
  id uuid primary key,
  ticket_id uuid not null references tickets(id) on delete cascade,
  action_type text not null,
  actor_email text not null,
  actor_name text not null,
  old_value_json jsonb null,
  new_value_json jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key,
  name text not null unique,
  is_active boolean not null default true
);

create index if not exists idx_tickets_requester_email on tickets (requester_email);
create index if not exists idx_tickets_status on tickets (status);
create index if not exists idx_tickets_category on tickets (category);
create index if not exists idx_tickets_assigned_to_email on tickets (assigned_to_email);
create index if not exists idx_tickets_updated_at on tickets (updated_at desc);
create index if not exists idx_ticket_attachments_ticket_id on ticket_attachments (ticket_id);
create index if not exists idx_ticket_activity_ticket_id on ticket_activity (ticket_id);
