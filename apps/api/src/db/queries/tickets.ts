export const selectTicketColumns = `
  id,
  ticket_number,
  requester_email,
  requester_name,
  title,
  category,
  description,
  status,
  assigned_to_email,
  assigned_to_name,
  created_at,
  updated_at,
  deleted_at
`;

export const ticketAttachmentsSql = `
  select
    id,
    ticket_id,
    file_name,
    storage_url,
    created_at
  from ticket_attachments
  where ticket_id = $1
  order by created_at asc
`;

export const ticketActivitySql = `
  select
    id,
    ticket_id,
    action_type,
    actor_email,
    actor_name,
    old_value_json,
    new_value_json,
    created_at
  from ticket_activity
  where ticket_id = $1
  order by created_at desc
`;
