-- Migrate any tickets in "Waiting on User" status to "In Progress".
-- Run this before deploying the build that removes "Waiting on User"
-- from the application's status list.

update tickets
set
  status     = 'In Progress',
  updated_at = now()
where status = 'Waiting on User';
