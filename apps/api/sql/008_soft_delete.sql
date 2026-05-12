-- Add soft-delete support to tickets.
-- Deleted tickets are retained for 90 days before being purged by the
-- purgeDeletedTickets timer trigger.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets (deleted_at);
