alter table ticket_statuses
  add column if not exists color text not null default 'slate';

update ticket_statuses set color = 'amber'  where name = 'New';
update ticket_statuses set color = 'blue'   where name = 'In Progress';
update ticket_statuses set color = 'green'  where name = 'Resolved';
update ticket_statuses set color = 'gray'   where name = 'Closed';
