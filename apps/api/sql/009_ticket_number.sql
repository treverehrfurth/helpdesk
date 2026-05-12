-- Add auto-incrementing ticket_number to tickets.
-- SERIAL is a 4-byte integer (max ~2.1 billion) — no ceiling concern in practice.
-- Display is zero-padded to 4 digits in application code; numbers above 9999 render as-is.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_number SERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets (ticket_number);
