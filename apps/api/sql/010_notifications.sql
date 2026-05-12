CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   text        NOT NULL,
  ticket_id    uuid        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  action_type  text        NOT NULL,
  actor_email  text        NOT NULL,
  actor_name   text        NOT NULL,
  title        text        NOT NULL,
  message      text,
  is_read      boolean     NOT NULL DEFAULT false,
  read_at      timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications (user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications (user_email, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created   ON notifications (created_at DESC);
