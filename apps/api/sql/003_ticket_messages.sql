create table if not exists ticket_messages (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets(id) on delete cascade,
  author_email text not null,
  author_name  text not null,
  author_role  text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_id_idx on ticket_messages(ticket_id);
