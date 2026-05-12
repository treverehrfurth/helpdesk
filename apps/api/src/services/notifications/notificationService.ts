import type { Pool } from "pg";
import type { NotificationRecord, NotificationsResponse } from "@it-helpdesk/shared";

export type NotificationInput = {
  userEmail: string;
  ticketId: string;
  actionType: NotificationRecord["actionType"];
  actorEmail: string;
  actorName: string;
  title: string;
  message?: string;
};

type NotificationRow = {
  id: string;
  user_email: string;
  ticket_id: string;
  action_type: string;
  actor_email: string;
  actor_name: string;
  title: string;
  message: string | null;
  is_read: boolean;
  read_at: Date | string | null;
  created_at: Date | string;
};

function mapNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    actionType: row.action_type as NotificationRecord["actionType"],
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function createNotification(pool: Pool, input: NotificationInput): Promise<void> {
  try {
    await pool.query(
      `
        INSERT INTO notifications (
          id, user_email, ticket_id, action_type,
          actor_email, actor_name, title, message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        crypto.randomUUID(),
        input.userEmail,
        input.ticketId,
        input.actionType,
        input.actorEmail,
        input.actorName,
        input.title,
        input.message ?? null
      ]
    );
  } catch (err) {
    console.error("Failed to create notification (non-fatal):", err);
  }
}

export async function listNotifications(pool: Pool, userEmail: string): Promise<NotificationsResponse> {
  const result = await pool.query<NotificationRow>(
    `
      SELECT id, user_email, ticket_id, action_type,
             actor_email, actor_name, title, message,
             is_read, read_at, created_at
      FROM notifications
      WHERE user_email = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [userEmail]
  );

  const items = result.rows.map(mapNotification);
  const unreadCount = items.filter((n) => !n.isRead).length;

  return { items, unreadCount };
}

export async function markRead(pool: Pool, id: string, userEmail: string): Promise<void> {
  await pool.query(
    `
      UPDATE notifications
      SET is_read = true, read_at = now()
      WHERE id = $1 AND user_email = $2 AND is_read = false
    `,
    [id, userEmail]
  );
}

export async function markAllRead(pool: Pool, userEmail: string): Promise<void> {
  await pool.query(
    `
      UPDATE notifications
      SET is_read = true, read_at = now()
      WHERE user_email = $1 AND is_read = false
    `,
    [userEmail]
  );
}

export async function clearReadNotifications(pool: Pool, userEmail: string): Promise<void> {
  await pool.query(
    `DELETE FROM notifications WHERE user_email = $1 AND is_read = true`,
    [userEmail]
  );
}
