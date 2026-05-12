import { getDbPool } from "../../db/client";
import {
  selectTicketColumns,
  ticketActivitySql,
  ticketAttachmentsSql
} from "../../db/queries/tickets";
import { HttpError } from "../../middleware/http";
import {
  ticketStatuses,
  type CategoryRecord,
  type CreateStaffMemberInput,
  type CreateTicketInput,
  type CreateTicketMessageInput,
  type StaffMember,
  type Ticket,
  type TicketActivity,
  type TicketAttachment,
  type TicketFilters,
  type TicketMessage,
  type TicketStatusRecord,
  type TicketSummary,
  type UpdateStaffMemberInput,
  type UpdateTicketInput,
  type UserProfile
} from "@it-helpdesk/shared";
import { mockDirectory, seedCategories, seedTickets } from "./mockData";
import { createNotification } from "../notifications/notificationService";
import { sendTeamsActivityNotification } from "../auth/graph";

type TicketRow = {
  id: string;
  ticket_number: number;
  requester_email: string;
  requester_name: string;
  title: string;
  category: Ticket["category"];
  description: string;
  status: Ticket["status"];
  assigned_to_email: string | null;
  assigned_to_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type AttachmentRow = {
  id: string;
  ticket_id: string;
  file_name: string;
  storage_url: string | null;
  created_at: Date | string;
};

type ActivityRow = {
  id: string;
  ticket_id: string;
  action_type: string;
  actor_email: string;
  actor_name: string;
  old_value_json: Record<string, unknown> | null;
  new_value_json: Record<string, unknown> | null;
  created_at: Date | string;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  author_email: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: Date | string;
};

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface TicketRepository {
  listMyTickets(email: string): Promise<TicketSummary[]>;
  getTicketForUser(id: string, user: UserProfile): Promise<Ticket>;
  createTicket(input: CreateTicketInput, user: UserProfile): Promise<Ticket>;
  createAttachment(
    ticketId: string,
    attachment: { fileName: string; storageUrl: string | null },
    actor: UserProfile
  ): Promise<TicketAttachment>;
  listAdminTickets(filters: TicketFilters): Promise<TicketSummary[]>;
  getAdminTicketById(id: string): Promise<Ticket>;
  getAdminTicketByNumber(ticketNumber: number): Promise<Ticket>;
  updateAdminTicket(
    id: string,
    input: UpdateTicketInput,
    actor: UserProfile
  ): Promise<Ticket>;
  listCategories(): Promise<CategoryRecord[]>;
  createCategory(name: string): Promise<CategoryRecord>;
  updateCategory(id: string, name: string): Promise<CategoryRecord>;
  deleteCategory(id: string, migrateTo: string | null): Promise<void>;
  listTicketMessages(ticketId: string): Promise<TicketMessage[]>;
  createTicketMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    author: UserProfile
  ): Promise<TicketMessage>;
  getAttachmentById(ticketId: string, attachmentId: string): Promise<TicketAttachment>;
  listStatuses(): Promise<TicketStatusRecord[]>;
  createStatus(name: string, color: string): Promise<TicketStatusRecord>;
  updateStatus(id: string, name: string, color: string): Promise<TicketStatusRecord>;
  deleteStatus(id: string, migrateTo: string | null): Promise<void>;
  listStaff(activeOnly?: boolean): Promise<StaffMember[]>;
  upsertStaffOnLogin(email: string, displayName: string, role: "tech" | "admin"): Promise<StaffMember>;
  createStaffMember(input: CreateStaffMemberInput): Promise<StaffMember>;
  updateStaffMember(id: string, input: UpdateStaffMemberInput): Promise<StaffMember>;
  deleteStaffMember(id: string): Promise<void>;
  softDeleteTicket(id: string, actor: UserProfile): Promise<void>;
  listDeletedTickets(): Promise<TicketSummary[]>;
  restoreTicket(id: string, actor: UserProfile): Promise<void>;
  permanentlyDeleteTicket(id: string): Promise<void>;
  purgeExpiredTickets(): Promise<number>;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapAttachment(row: AttachmentRow): TicketAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    storageUrl: row.storage_url,
    createdAt: toIso(row.created_at)
  };
}

function mapActivity(row: ActivityRow): TicketActivity {
  return {
    id: row.id,
    actionType: row.action_type,
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    oldValueJson: row.old_value_json,
    newValueJson: row.new_value_json,
    createdAt: toIso(row.created_at)
  };
}

function mapMessage(row: MessageRow): TicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorEmail: row.author_email,
    authorName: row.author_name,
    authorRole: row.author_role as TicketMessage["authorRole"],
    body: row.body,
    createdAt: toIso(row.created_at)
  };
}

function mapStaff(row: StaffRow): StaffMember {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as StaffMember["role"],
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    requesterEmail: row.requester_email,
    requesterName: row.requester_name,
    title: row.title,
    category: row.category,
    description: row.description,
    status: row.status,
    assignedToEmail: row.assigned_to_email,
    assignedToName: row.assigned_to_name,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
    attachments: [],
    activity: []
  };
}

function summarize(ticket: Ticket): TicketSummary {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    category: ticket.category,
    status: ticket.status,
    requesterEmail: ticket.requesterEmail,
    requesterName: ticket.requesterName,
    assignedToEmail: ticket.assignedToEmail,
    assignedToName: ticket.assignedToName,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    deletedAt: ticket.deletedAt
  };
}

const seedStaff: StaffMember[] = mockDirectory
  .filter((u) => u.role === "tech" || u.role === "admin")
  .map((u, index) => ({
    id: `staff-seed-${index + 1}`,
    email: u.email,
    displayName: u.name,
    role: u.role as "tech" | "admin",
    isActive: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }));

class InMemoryTicketRepository implements TicketRepository {
  private tickets = [...seedTickets];
  private categories = [...seedCategories];
  private messages: TicketMessage[] = [];
  private staff: StaffMember[] = [...seedStaff];
  private ticketCounter = seedTickets.length;
  private statuses: TicketStatusRecord[] = ticketStatuses.map((name, index) => ({
    id: `status-${index + 1}`,
    name,
    color: (["amber", "blue", "green", "gray"] as const)[index] ?? "slate",
    sortOrder: index + 1
  }));

  async listMyTickets(email: string) {
    return this.tickets
      .filter((ticket) => ticket.requesterEmail === email && !ticket.deletedAt)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )
      .map(summarize);
  }

  async getTicketForUser(id: string, user: UserProfile) {
    const ticket = this.tickets.find((candidate) => candidate.id === id && !candidate.deletedAt);

    if (!ticket) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    if (user.role === "end_user" && ticket.requesterEmail !== user.email) {
      throw new HttpError(403, "You do not have access to this ticket.", "forbidden");
    }

    return ticket;
  }

  async createTicket(input: CreateTicketInput, user: UserProfile) {
    const now = new Date().toISOString();
    const isOnBehalf = Boolean(input.onBehalfOfEmail);
    const requesterEmail = input.onBehalfOfEmail ?? user.email;
    const requesterName = input.onBehalfOfName ?? user.name;

    const ticket: Ticket = {
      id: crypto.randomUUID(),
      ticketNumber: ++this.ticketCounter,
      requesterEmail,
      requesterName,
      title: input.title,
      category: input.category,
      description: input.description,
      status: "New",
      assignedToEmail: input.assignedToEmail ?? null,
      assignedToName: input.assignedToName ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      attachments: input.attachments.map((attachment) => ({
        id: crypto.randomUUID(),
        fileName: attachment.fileName,
        storageUrl: null,
        createdAt: now
      })),
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_created",
          actorEmail: user.email,
          actorName: user.name,
          oldValueJson: null,
          newValueJson: {
            status: "New",
            ...(isOnBehalf ? { onBehalfOf: requesterName } : {})
          },
          createdAt: now
        }
      ]
    };

    this.tickets = [ticket, ...this.tickets];
    return ticket;
  }

  async createAttachment(
    ticketId: string,
    attachment: { fileName: string; storageUrl: string | null },
    actor: UserProfile
  ) {
    const ticket = await this.getAdminTicketById(ticketId);
    const now = new Date().toISOString();
    const createdAttachment: TicketAttachment = {
      id: crypto.randomUUID(),
      fileName: attachment.fileName,
      storageUrl: attachment.storageUrl,
      createdAt: now
    };

    const updatedTicket: Ticket = {
      ...ticket,
      updatedAt: now,
      attachments: [...ticket.attachments, createdAttachment],
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "attachment_added",
          actorEmail: actor.email,
          actorName: actor.name,
          oldValueJson: null,
          newValueJson: {
            fileName: attachment.fileName
          },
          createdAt: now
        },
        ...ticket.activity
      ]
    };

    this.tickets = this.tickets.map((candidate) =>
      candidate.id === ticketId ? updatedTicket : candidate
    );

    return createdAttachment;
  }

  async listAdminTickets(filters: TicketFilters) {
    return this.tickets
      .filter((ticket) => {
        if (ticket.deletedAt) return false;
        if (filters.status) {
          const allowed = filters.status.split(",").map((s) => s.trim());
          if (!allowed.includes(ticket.status)) return false;
        }

        if (filters.category) {
          const allowed = filters.category.split(",").map((s) => s.trim());
          if (!allowed.includes(ticket.category)) return false;
        }

        if (filters.assignee) {
          const emails = filters.assignee.split(",").map((s) => s.trim());
          if (!emails.includes(ticket.assignedToEmail ?? "")) return false;
        }

        if (filters.requester) {
          const emails = filters.requester.split(",").map((s) => s.trim());
          if (!emails.includes(ticket.requesterEmail)) return false;
        }

        if (filters.search) {
          const haystack = [
            ticket.title,
            ticket.description,
            ticket.requesterEmail,
            ticket.requesterName
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(filters.search.toLowerCase())) {
            return false;
          }
        }

        return true;
      })
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )
      .map(summarize);
  }

  async getAdminTicketById(id: string) {
    const ticket = this.tickets.find((candidate) => candidate.id === id);

    if (!ticket) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    return ticket;
  }

  async getAdminTicketByNumber(ticketNumber: number) {
    const ticket = this.tickets.find((candidate) => candidate.ticketNumber === ticketNumber);

    if (!ticket) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    return ticket;
  }

  async updateAdminTicket(id: string, input: UpdateTicketInput, actor: UserProfile) {
    const existing = await this.getAdminTicketById(id);
    const now = new Date().toISOString();

    const nextStatus = input.status ?? existing.status;
    const nextCategory = input.category ?? existing.category;
    const nextAssignedToEmail =
      input.assignedToEmail === undefined ? existing.assignedToEmail : input.assignedToEmail;
    const nextAssignedToName =
      input.assignedToName === undefined ? existing.assignedToName : input.assignedToName;

    const updated: Ticket = {
      ...existing,
      status: nextStatus,
      category: nextCategory,
      assignedToEmail: nextAssignedToEmail,
      assignedToName: nextAssignedToName,
      updatedAt: now,
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_updated",
          actorEmail: actor.email,
          actorName: actor.name,
          oldValueJson: {
            status: existing.status,
            category: existing.category,
            assignedToEmail: existing.assignedToEmail,
            assignedToName: existing.assignedToName
          },
          newValueJson: {
            status: nextStatus,
            category: nextCategory,
            assignedToEmail: nextAssignedToEmail,
            assignedToName: nextAssignedToName
          },
          createdAt: now
        },
        ...existing.activity
      ]
    };

    this.tickets = this.tickets.map((ticket) => (ticket.id === id ? updated : ticket));
    return updated;
  }

  async listCategories() {
    return this.categories;
  }

  async createCategory(name: string) {
    if (this.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, `A category named "${name}" already exists.`, "conflict");
    }
    const newCategory: CategoryRecord = {
      id: crypto.randomUUID(),
      name,
      isActive: true
    };
    this.categories = [...this.categories, newCategory];
    return newCategory;
  }

  async updateCategory(id: string, name: string) {
    const existing = this.categories.find((c) => c.id === id);
    if (!existing) throw new HttpError(404, "Category not found.", "not_found");
    if (this.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, `A category named "${name}" already exists.`, "conflict");
    }
    const oldName = existing.name;
    const updated = { ...existing, name };
    this.categories = this.categories.map((c) => (c.id === id ? updated : c));
    const now = new Date().toISOString();
    this.tickets = this.tickets.map((t) =>
      t.category === oldName ? { ...t, category: name, updatedAt: now } : t
    );
    return updated;
  }

  async deleteCategory(id: string, migrateTo: string | null) {
    const category = this.categories.find((c) => c.id === id);
    if (!category) throw new HttpError(404, "Category not found.", "not_found");
    if (migrateTo) {
      const now = new Date().toISOString();
      this.tickets = this.tickets.map((t) =>
        t.category === category.name ? { ...t, category: migrateTo, updatedAt: now } : t
      );
    }
    this.categories = this.categories.filter((c) => c.id !== id);
  }

  async listTicketMessages(ticketId: string) {
    return this.messages
      .filter((message) => message.ticketId === ticketId)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
  }

  async createTicketMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    author: UserProfile
  ) {
    const message: TicketMessage = {
      id: crypto.randomUUID(),
      ticketId,
      authorEmail: author.email,
      authorName: author.name,
      authorRole: author.role,
      body: input.body,
      createdAt: new Date().toISOString()
    };

    this.messages = [...this.messages, message];
    return message;
  }

  async listStatuses() {
    return [...this.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createStatus(name: string, color: string) {
    if (this.statuses.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, `A status named "${name}" already exists.`, "conflict");
    }
    const newStatus: TicketStatusRecord = {
      id: crypto.randomUUID(),
      name,
      color,
      sortOrder: this.statuses.length + 1
    };
    this.statuses = [...this.statuses, newStatus];
    return newStatus;
  }

  async updateStatus(id: string, name: string, color: string) {
    const existing = this.statuses.find((s) => s.id === id);
    if (!existing) throw new HttpError(404, "Status not found.", "not_found");
    if (this.statuses.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, `A status named "${name}" already exists.`, "conflict");
    }
    const oldName = existing.name;
    const updated = { ...existing, name, color };
    this.statuses = this.statuses.map((s) => (s.id === id ? updated : s));
    // Rename status on existing tickets too
    const now = new Date().toISOString();
    this.tickets = this.tickets.map((t) =>
      t.status === oldName ? { ...t, status: name, updatedAt: now } : t
    );
    return updated;
  }

  async deleteStatus(id: string, migrateTo: string | null) {
    const status = this.statuses.find((s) => s.id === id);
    if (!status) throw new HttpError(404, "Status not found.", "not_found");
    if (migrateTo) {
      const now = new Date().toISOString();
      this.tickets = this.tickets.map((t) =>
        t.status === status.name ? { ...t, status: migrateTo, updatedAt: now } : t
      );
    }
    this.statuses = this.statuses.filter((s) => s.id !== id);
  }

  async getAttachmentById(ticketId: string, attachmentId: string) {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    const attachment = ticket?.attachments.find((a) => a.id === attachmentId);
    if (!attachment) throw new HttpError(404, "Attachment not found.", "not_found");
    return attachment;
  }

  async listStaff(activeOnly = true) {
    return this.staff
      .filter((s) => !activeOnly || s.isActive)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async upsertStaffOnLogin(email: string, displayName: string, role: "tech" | "admin") {
    const existing = this.staff.find((s) => s.email === email);
    const now = new Date().toISOString();
    if (existing) {
      const updated = { ...existing, displayName, role, updatedAt: now };
      this.staff = this.staff.map((s) => (s.email === email ? updated : s));
      return updated;
    }
    const member: StaffMember = {
      id: crypto.randomUUID(),
      email,
      displayName,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    this.staff = [...this.staff, member];
    return member;
  }

  async createStaffMember(input: CreateStaffMemberInput) {
    if (this.staff.some((s) => s.email === input.email)) {
      throw new HttpError(409, `A staff member with email "${input.email}" already exists.`, "conflict");
    }
    const now = new Date().toISOString();
    const member: StaffMember = {
      id: crypto.randomUUID(),
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    this.staff = [...this.staff, member];
    return member;
  }

  async updateStaffMember(id: string, input: UpdateStaffMemberInput) {
    const existing = this.staff.find((s) => s.id === id);
    if (!existing) throw new HttpError(404, "Staff member not found.", "not_found");
    const updated: StaffMember = {
      ...existing,
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date().toISOString()
    };
    this.staff = this.staff.map((s) => (s.id === id ? updated : s));
    return updated;
  }

  async deleteStaffMember(id: string) {
    const existing = this.staff.find((s) => s.id === id);
    if (!existing) throw new HttpError(404, "Staff member not found.", "not_found");
    this.staff = this.staff.filter((s) => s.id !== id);
  }

  async softDeleteTicket(id: string, actor: UserProfile) {
    const ticket = this.tickets.find((t) => t.id === id && !t.deletedAt);
    if (!ticket) throw new HttpError(404, "Ticket not found.", "not_found");
    const now = new Date().toISOString();
    const updated: Ticket = {
      ...ticket,
      deletedAt: now,
      updatedAt: now,
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_deleted",
          actorEmail: actor.email,
          actorName: actor.name,
          oldValueJson: { status: ticket.status, category: ticket.category },
          newValueJson: null,
          createdAt: now
        },
        ...ticket.activity
      ]
    };
    this.tickets = this.tickets.map((t) => (t.id === id ? updated : t));
  }

  async listDeletedTickets() {
    return this.tickets
      .filter((t) => t.deletedAt !== null)
      .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime())
      .map(summarize);
  }

  async restoreTicket(id: string, actor: UserProfile) {
    const ticket = this.tickets.find((t) => t.id === id && t.deletedAt !== null);
    if (!ticket) throw new HttpError(404, "Ticket not found.", "not_found");
    const now = new Date().toISOString();
    const updated: Ticket = {
      ...ticket,
      deletedAt: null,
      updatedAt: now,
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_restored",
          actorEmail: actor.email,
          actorName: actor.name,
          oldValueJson: null,
          newValueJson: { status: ticket.status, category: ticket.category },
          createdAt: now
        },
        ...ticket.activity
      ]
    };
    this.tickets = this.tickets.map((t) => (t.id === id ? updated : t));
  }

  async permanentlyDeleteTicket(id: string) {
    const exists = this.tickets.some((t) => t.id === id);
    if (!exists) throw new HttpError(404, "Ticket not found.", "not_found");
    this.tickets = this.tickets.filter((t) => t.id !== id);
  }

  async purgeExpiredTickets() {
    // No-op in memory — mock data is ephemeral and never truly expires
    return 0;
  }
}

class PostgresTicketRepository implements TicketRepository {
  async listMyTickets(email: string) {
    const pool = getDbPool();
    const result = await pool.query<TicketRow>(
      `
        select ${selectTicketColumns}
        from tickets
        where requester_email = $1
          and deleted_at is null
        order by updated_at desc
      `,
      [email]
    );

    return result.rows.map((row) => summarize(mapTicket(row)));
  }

  async getTicketForUser(id: string, user: UserProfile, includeDeleted = false) {
    const pool = getDbPool();
    const result = await pool.query<TicketRow>(
      `
        select ${selectTicketColumns}
        from tickets
        where id = $1
          ${includeDeleted ? "" : "and deleted_at is null"}
      `,
      [id]
    );

    const row = result.rows[0];

    if (!row) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    const ticket = mapTicket(row);

    if (user.role === "end_user" && ticket.requesterEmail !== user.email) {
      throw new HttpError(403, "You do not have access to this ticket.", "forbidden");
    }

    const [attachmentRows, activityRows] = await Promise.all([
      pool.query<AttachmentRow>(ticketAttachmentsSql, [id]),
      pool.query<ActivityRow>(ticketActivitySql, [id])
    ]);

    ticket.attachments = attachmentRows.rows.map(mapAttachment);
    ticket.activity = activityRows.rows.map(mapActivity);

    return ticket;
  }

  async createTicket(input: CreateTicketInput, user: UserProfile) {
    const pool = getDbPool();
    const now = new Date();
    const id = crypto.randomUUID();
    const isOnBehalf = Boolean(input.onBehalfOfEmail);
    const requesterEmail = input.onBehalfOfEmail ?? user.email;
    const requesterName = input.onBehalfOfName ?? user.name;
    const assignedToEmail = input.assignedToEmail ?? null;
    const assignedToName = input.assignedToName ?? null;

    await pool.query(
      `
        insert into tickets (
          id,
          requester_email,
          requester_name,
          title,
          category,
          description,
          status,
          assigned_to_email,
          assigned_to_name,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, 'New', $7, $8, $9, $9)
      `,
      [id, requesterEmail, requesterName, input.title, input.category, input.description, assignedToEmail, assignedToName, now]
    );

    for (const attachment of input.attachments) {
      await pool.query(
        `
          insert into ticket_attachments (
            id,
            ticket_id,
            file_name,
            storage_url,
            created_at
          )
          values ($1, $2, $3, null, $4)
        `,
        [crypto.randomUUID(), id, attachment.fileName, now]
      );
    }

    const activityJson = {
      status: "New",
      ...(isOnBehalf ? { onBehalfOf: requesterName } : {})
    };

    await pool.query(
      `
        insert into ticket_activity (
          id,
          ticket_id,
          action_type,
          actor_email,
          actor_name,
          old_value_json,
          new_value_json,
          created_at
        )
        values ($1, $2, 'ticket_created', $3, $4, null, $5, $6)
      `,
      [crypto.randomUUID(), id, user.email, user.name, JSON.stringify(activityJson), now]
    );

    const ticket = await this.getAdminTicketById(id);

    // Notify assignee when ticket is created with an initial assignee (and they're not the creator)
    if (assignedToEmail && assignedToEmail !== user.email) {
      const assignTitle = `Ticket assigned to you: ${input.title}`;
      void createNotification(pool, {
        userEmail: assignedToEmail,
        ticketId: id,
        actionType: "ticket_assigned",
        actorEmail: user.email,
        actorName: user.name,
        title: assignTitle
      });
      await sendTeamsActivityNotification({
        recipientEmail: assignedToEmail,
        activityType: "ticket_assigned",
        topic: { title: assignTitle, ticketPath: `/tickets/${id}` },
        templateParams: { ticketTitle: input.title }
      });
    }

    return ticket;
  }

  async createAttachment(
    ticketId: string,
    attachment: { fileName: string; storageUrl: string | null },
    actor: UserProfile
  ) {
    const pool = getDbPool();
    const now = new Date();
    const attachmentId = crypto.randomUUID();

    await pool.query(
      `
        insert into ticket_attachments (
          id,
          ticket_id,
          file_name,
          storage_url,
          created_at
        )
        values ($1, $2, $3, $4, $5)
      `,
      [attachmentId, ticketId, attachment.fileName, attachment.storageUrl, now]
    );

    await pool.query(
      `
        update tickets
        set updated_at = $2
        where id = $1
      `,
      [ticketId, now]
    );

    await pool.query(
      `
        insert into ticket_activity (
          id,
          ticket_id,
          action_type,
          actor_email,
          actor_name,
          old_value_json,
          new_value_json,
          created_at
        )
        values ($1, $2, 'attachment_added', $3, $4, null, $5, $6)
      `,
      [
        crypto.randomUUID(),
        ticketId,
        actor.email,
        actor.name,
        JSON.stringify({
          fileName: attachment.fileName
        }),
        now
      ]
    );

    return {
      id: attachmentId,
      fileName: attachment.fileName,
      storageUrl: attachment.storageUrl,
      createdAt: now.toISOString()
    };
  }

  async listAdminTickets(filters: TicketFilters) {
    const pool = getDbPool();
    const clauses: string[] = [];
    const params: Array<string | string[]> = [];

    if (filters.status) {
      const statusList = filters.status.split(",").map((s) => s.trim());
      params.push(statusList);
      clauses.push(`status = ANY($${params.length}::text[])`);
    }

    if (filters.category) {
      const catList = filters.category.split(",").map((s) => s.trim());
      params.push(catList);
      clauses.push(`category = ANY($${params.length}::text[])`);
    }

    if (filters.assignee) {
      const emailList = filters.assignee.split(",").map((s) => s.trim());
      params.push(emailList);
      clauses.push(`assigned_to_email = ANY($${params.length}::text[])`);
    }

    if (filters.requester) {
      const emailList = filters.requester.split(",").map((s) => s.trim());
      params.push(emailList);
      clauses.push(`requester_email = ANY($${params.length}::text[])`);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      clauses.push(
        `(title ilike $${params.length} or description ilike $${params.length} or requester_email ilike $${params.length} or requester_name ilike $${params.length})`
      );
    }

    clauses.push("deleted_at is null");
    const whereClause = `where ${clauses.join(" and ")}`;

    const result = await pool.query<TicketRow>(
      `
        select ${selectTicketColumns}
        from tickets
        ${whereClause}
        order by updated_at desc
      `,
      params
    );

    return result.rows.map((row) => summarize(mapTicket(row)));
  }

  async getAdminTicketById(id: string) {
    const pool = getDbPool();
    // Intentionally omits deleted_at filter so admins can view deleted tickets from the recycle bin
    const result = await pool.query<TicketRow>(
      `select ${selectTicketColumns} from tickets where id = $1`,
      [id]
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    const ticket = mapTicket(row);

    const [attachmentRows, activityRows] = await Promise.all([
      pool.query<AttachmentRow>(ticketAttachmentsSql, [id]),
      pool.query<ActivityRow>(ticketActivitySql, [id])
    ]);

    ticket.attachments = attachmentRows.rows.map(mapAttachment);
    ticket.activity = activityRows.rows.map(mapActivity);

    return ticket;
  }

  async getAdminTicketByNumber(ticketNumber: number) {
    const pool = getDbPool();
    const result = await pool.query<TicketRow>(
      `select ${selectTicketColumns} from tickets where ticket_number = $1`,
      [ticketNumber]
    );

    const row = result.rows[0];
    if (!row) throw new HttpError(404, "Ticket not found.", "not_found");

    const ticket = mapTicket(row);
    const [attachmentRows, activityRows] = await Promise.all([
      pool.query<AttachmentRow>(ticketAttachmentsSql, [ticket.id]),
      pool.query<ActivityRow>(ticketActivitySql, [ticket.id])
    ]);

    ticket.attachments = attachmentRows.rows.map(mapAttachment);
    ticket.activity = activityRows.rows.map(mapActivity);

    return ticket;
  }

  async updateAdminTicket(id: string, input: UpdateTicketInput, actor: UserProfile) {
    const pool = getDbPool();
    const current = await this.getAdminTicketById(id);
    const nextStatus = input.status ?? current.status;
    const nextCategory = input.category ?? current.category;
    const nextAssignedToEmail =
      input.assignedToEmail === undefined ? current.assignedToEmail : input.assignedToEmail;
    const nextAssignedToName =
      input.assignedToName === undefined ? current.assignedToName : input.assignedToName;
    const now = new Date();

    await pool.query(
      `
        update tickets
        set
          status = $2,
          category = $3,
          assigned_to_email = $4,
          assigned_to_name = $5,
          updated_at = $6
        where id = $1
      `,
      [id, nextStatus, nextCategory, nextAssignedToEmail, nextAssignedToName, now]
    );

    await pool.query(
      `
        insert into ticket_activity (
          id, ticket_id, action_type, actor_email, actor_name,
          old_value_json, new_value_json, created_at
        )
        values ($1, $2, 'ticket_updated', $3, $4, $5, $6, $7)
      `,
      [
        crypto.randomUUID(),
        id,
        actor.email,
        actor.name,
        JSON.stringify({
          status: current.status,
          category: current.category,
          assignedToEmail: current.assignedToEmail,
          assignedToName: current.assignedToName
        }),
        JSON.stringify({
          status: nextStatus,
          category: nextCategory,
          assignedToEmail: nextAssignedToEmail,
          assignedToName: nextAssignedToName
        }),
        now
      ]
    );

    // Notify on assignment change (to a real person)
    if (nextAssignedToEmail && nextAssignedToEmail !== current.assignedToEmail) {
      const assignTitle = `Ticket assigned to you: ${current.title}`;
      void createNotification(pool, {
        userEmail: nextAssignedToEmail,
        ticketId: id,
        actionType: "ticket_assigned",
        actorEmail: actor.email,
        actorName: actor.name,
        title: assignTitle
      });
      await sendTeamsActivityNotification({
        recipientEmail: nextAssignedToEmail,
        activityType: "ticket_assigned",
        topic: { title: assignTitle, ticketPath: `/tickets/${id}` },
        templateParams: { ticketTitle: current.title }
      });
    }

    // Notify requester on status change
    if (nextStatus !== current.status) {
      const statusTitle = `Your ticket status changed to ${nextStatus}: ${current.title}`;
      void createNotification(pool, {
        userEmail: current.requesterEmail,
        ticketId: id,
        actionType: "status_changed",
        actorEmail: actor.email,
        actorName: actor.name,
        title: statusTitle
      });
      await sendTeamsActivityNotification({
        recipientEmail: current.requesterEmail,
        activityType: "status_changed",
        topic: { title: statusTitle, ticketPath: `/tickets/${id}` },
        templateParams: { ticketTitle: current.title }
      });
    }

    return this.getAdminTicketById(id);
  }

  async listCategories() {
    const pool = getDbPool();
    const result = await pool.query<CategoryRecord>(
      `
        select id, name, is_active as "isActive"
        from categories
        where is_active = true
        order by name asc
      `
    );

    return result.rows;
  }

  async createCategory(name: string) {
    const pool = getDbPool();
    const id = crypto.randomUUID();
    await pool.query(
      `insert into categories (id, name, is_active) values ($1, $2, true)`,
      [id, name]
    );
    return { id, name, isActive: true };
  }

  async updateCategory(id: string, name: string) {
    const pool = getDbPool();
    const existing = await pool.query<{ name: string }>(
      `select name from categories where id = $1`,
      [id]
    );
    if (!existing.rows[0]) throw new HttpError(404, "Category not found.", "not_found");

    const oldName = existing.rows[0].name;

    await pool.query(`update categories set name = $2 where id = $1`, [id, name]);
    await pool.query(
      `update tickets set category = $2, updated_at = now() where category = $1`,
      [oldName, name]
    );

    return { id, name, isActive: true };
  }

  async deleteCategory(id: string, migrateTo: string | null) {
    const pool = getDbPool();
    const existing = await pool.query<{ name: string }>(
      `select name from categories where id = $1`,
      [id]
    );
    if (!existing.rows[0]) throw new HttpError(404, "Category not found.", "not_found");

    const categoryName = existing.rows[0].name;

    if (migrateTo) {
      await pool.query(
        `update tickets set category = $2, updated_at = now() where category = $1`,
        [categoryName, migrateTo]
      );
    }

    await pool.query(`delete from categories where id = $1`, [id]);
  }

  async listTicketMessages(ticketId: string) {
    const pool = getDbPool();
    const result = await pool.query<MessageRow>(
      `
        select id, ticket_id, author_email, author_name, author_role, body, created_at
        from ticket_messages
        where ticket_id = $1
        order by created_at asc
      `,
      [ticketId]
    );

    return result.rows.map(mapMessage);
  }

  async createTicketMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    author: UserProfile
  ) {
    const pool = getDbPool();
    const id = crypto.randomUUID();
    const now = new Date();

    await pool.query(
      `
        insert into ticket_messages (id, ticket_id, author_email, author_name, author_role, body, created_at)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [id, ticketId, author.email, author.name, author.role, input.body, now]
    );

    // Notify the other party on the ticket
    void (async () => {
      try {
        const ticketRow = await pool.query<{ requester_email: string; title: string; assigned_to_email: string | null }>(
          `SELECT requester_email, title, assigned_to_email FROM tickets WHERE id = $1`,
          [ticketId]
        );
        const t = ticketRow.rows[0];
        if (!t) return;

        if (author.role === "end_user") {
          // User replied — notify assignee or all active staff if unassigned
          const notifTitle = `New reply from ${author.name}: ${t.title}`;
          if (t.assigned_to_email) {
            await createNotification(pool, {
              userEmail: t.assigned_to_email,
              ticketId,
              actionType: "new_message",
              actorEmail: author.email,
              actorName: author.name,
              title: notifTitle
            });
            await sendTeamsActivityNotification({
              recipientEmail: t.assigned_to_email,
              activityType: "new_message",
              topic: { title: notifTitle, ticketPath: `/tickets/${ticketId}` },
              templateParams: { ticketTitle: t.title }
            });
          } else {
            const staffRows = await pool.query<{ email: string }>(
              `SELECT email FROM staff WHERE is_active = true`
            );
            void Promise.all(
              staffRows.rows.map(async (staff) => {
                await createNotification(pool, {
                  userEmail: staff.email,
                  ticketId,
                  actionType: "new_message",
                  actorEmail: author.email,
                  actorName: author.name,
                  title: notifTitle
                });
                await sendTeamsActivityNotification({
                  recipientEmail: staff.email,
                  activityType: "new_message",
                  topic: { title: notifTitle, ticketPath: `/tickets/${ticketId}` },
                  templateParams: { ticketTitle: t.title }
                });
              })
            );
          }
        } else {
          // Staff replied — notify requester
          const notifTitle = `Staff replied on your ticket: ${t.title}`;
          await createNotification(pool, {
            userEmail: t.requester_email,
            ticketId,
            actionType: "new_message",
            actorEmail: author.email,
            actorName: author.name,
            title: notifTitle
          });
          await sendTeamsActivityNotification({
            recipientEmail: t.requester_email,
            activityType: "new_message",
            topic: { title: notifTitle, ticketPath: `/tickets/${ticketId}` },
            templateParams: { ticketTitle: t.title }
          });
        }
      } catch (err) {
        console.error("Failed to send message notification (non-fatal):", err);
      }
    })();

    return {
      id,
      ticketId,
      authorEmail: author.email,
      authorName: author.name,
      authorRole: author.role,
      body: input.body,
      createdAt: now.toISOString()
    };
  }

  async listStatuses() {
    const pool = getDbPool();
    const result = await pool.query<{ id: string; name: string; color: string; sort_order: number }>(
      `select id, name, color, sort_order from ticket_statuses order by sort_order asc, name asc`
    );
    return result.rows.map((r) => ({ id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order }));
  }

  async createStatus(name: string, color: string) {
    const pool = getDbPool();
    const sortResult = await pool.query<{ max: number }>(
      `select coalesce(max(sort_order), 0) as max from ticket_statuses`
    );
    const sortOrder = (sortResult.rows[0]?.max ?? 0) + 1;
    const id = crypto.randomUUID();

    await pool.query(
      `insert into ticket_statuses (id, name, color, sort_order) values ($1, $2, $3, $4)`,
      [id, name, color, sortOrder]
    );

    return { id, name, color, sortOrder };
  }

  async updateStatus(id: string, name: string, color: string) {
    const pool = getDbPool();
    const existing = await pool.query<{ name: string; sort_order: number }>(
      `select name, sort_order from ticket_statuses where id = $1`,
      [id]
    );
    if (!existing.rows[0]) throw new HttpError(404, "Status not found.", "not_found");

    const oldName = existing.rows[0].name;

    await pool.query(`update ticket_statuses set name = $2, color = $3 where id = $1`, [id, name, color]);
    // Rename in tickets table too
    await pool.query(
      `update tickets set status = $2, updated_at = now() where status = $1`,
      [oldName, name]
    );

    return { id, name, color, sortOrder: existing.rows[0].sort_order };
  }

  async deleteStatus(id: string, migrateTo: string | null) {
    const pool = getDbPool();
    const existing = await pool.query<{ name: string }>(
      `select name from ticket_statuses where id = $1`,
      [id]
    );
    if (!existing.rows[0]) throw new HttpError(404, "Status not found.", "not_found");

    const statusName = existing.rows[0].name;

    if (migrateTo) {
      await pool.query(
        `update tickets set status = $2, updated_at = now() where status = $1`,
        [statusName, migrateTo]
      );
    }

    await pool.query(`delete from ticket_statuses where id = $1`, [id]);
  }

  async getAttachmentById(ticketId: string, attachmentId: string) {
    const pool = getDbPool();
    const result = await pool.query<AttachmentRow>(
      `select id, ticket_id, file_name, storage_url, created_at
       from ticket_attachments
       where id = $1 and ticket_id = $2`,
      [attachmentId, ticketId]
    );
    if (!result.rows[0]) throw new HttpError(404, "Attachment not found.", "not_found");
    return mapAttachment(result.rows[0]);
  }

  async listStaff(activeOnly = true) {
    const pool = getDbPool();
    const result = await pool.query<StaffRow>(
      `select id, email, display_name, role, is_active, created_at, updated_at
       from staff
       where ($1 = false or is_active = true)
       order by display_name asc`,
      [activeOnly]
    );
    return result.rows.map(mapStaff);
  }

  async upsertStaffOnLogin(email: string, displayName: string, role: "tech" | "admin") {
    const pool = getDbPool();
    const id = crypto.randomUUID();
    const result = await pool.query<StaffRow>(
      `insert into staff (id, email, display_name, role, is_active, created_at, updated_at)
       values ($1, $2, $3, $4, true, now(), now())
       on conflict (email) do update
         set display_name = excluded.display_name,
             role = excluded.role,
             updated_at = now()
       returning id, email, display_name, role, is_active, created_at, updated_at`,
      [id, email, displayName, role]
    );
    return mapStaff(result.rows[0]!);
  }

  async createStaffMember(input: CreateStaffMemberInput) {
    const pool = getDbPool();
    const id = crypto.randomUUID();
    try {
      const result = await pool.query<StaffRow>(
        `insert into staff (id, email, display_name, role, is_active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, now(), now())
         returning id, email, display_name, role, is_active, created_at, updated_at`,
        [id, input.email, input.displayName, input.role, input.isActive ?? true]
      );
      return mapStaff(result.rows[0]!);
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
        throw new HttpError(409, `A staff member with email "${input.email}" already exists.`, "conflict");
      }
      throw err;
    }
  }

  async updateStaffMember(id: string, input: UpdateStaffMemberInput) {
    const pool = getDbPool();
    const sets: string[] = [];
    const params: unknown[] = [id];

    if (input.role !== undefined) {
      params.push(input.role);
      sets.push(`role = $${params.length}`);
    }
    if (input.isActive !== undefined) {
      params.push(input.isActive);
      sets.push(`is_active = $${params.length}`);
    }

    sets.push("updated_at = now()");

    const result = await pool.query<StaffRow>(
      `update staff set ${sets.join(", ")} where id = $1
       returning id, email, display_name, role, is_active, created_at, updated_at`,
      params
    );

    if (!result.rows[0]) throw new HttpError(404, "Staff member not found.", "not_found");
    return mapStaff(result.rows[0]);
  }

  async deleteStaffMember(id: string) {
    const pool = getDbPool();
    const result = await pool.query(`delete from staff where id = $1`, [id]);
    if ((result.rowCount ?? 0) === 0) {
      throw new HttpError(404, "Staff member not found.", "not_found");
    }
  }

  async softDeleteTicket(id: string, actor: UserProfile) {
    const pool = getDbPool();
    const now = new Date();

    const result = await pool.query<{ status: string; category: string }>(
      `update tickets
       set deleted_at = $2, updated_at = $2
       where id = $1 and deleted_at is null
       returning status, category`,
      [id, now]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    const { status, category } = result.rows[0]!;

    await pool.query(
      `insert into ticket_activity
         (id, ticket_id, action_type, actor_email, actor_name, old_value_json, new_value_json, created_at)
       values ($1, $2, 'ticket_deleted', $3, $4, $5, null, $6)`,
      [
        crypto.randomUUID(),
        id,
        actor.email,
        actor.name,
        JSON.stringify({ status, category }),
        now
      ]
    );
  }

  async listDeletedTickets() {
    const pool = getDbPool();
    const result = await pool.query<TicketRow>(
      `select ${selectTicketColumns}
       from tickets
       where deleted_at is not null
       order by deleted_at desc`
    );
    return result.rows.map((row) => summarize(mapTicket(row)));
  }

  async restoreTicket(id: string, actor: UserProfile) {
    const pool = getDbPool();
    const now = new Date();

    const result = await pool.query<{ status: string; category: string }>(
      `update tickets
       set deleted_at = null, updated_at = $2
       where id = $1 and deleted_at is not null
       returning status, category`,
      [id, now]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }

    const { status, category } = result.rows[0]!;

    await pool.query(
      `insert into ticket_activity
         (id, ticket_id, action_type, actor_email, actor_name, old_value_json, new_value_json, created_at)
       values ($1, $2, 'ticket_restored', $3, $4, null, $5, $6)`,
      [
        crypto.randomUUID(),
        id,
        actor.email,
        actor.name,
        JSON.stringify({ status, category }),
        now
      ]
    );
  }

  async permanentlyDeleteTicket(id: string) {
    const pool = getDbPool();
    const result = await pool.query(`delete from tickets where id = $1`, [id]);
    if ((result.rowCount ?? 0) === 0) {
      throw new HttpError(404, "Ticket not found.", "not_found");
    }
  }

  async purgeExpiredTickets() {
    const pool = getDbPool();
    const result = await pool.query(
      `delete from tickets where deleted_at < now() - interval '90 days'`
    );
    return result.rowCount ?? 0;
  }
}

let repository: TicketRepository | null = null;

export function getTicketRepository() {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new PostgresTicketRepository()
      : new InMemoryTicketRepository();
  }

  return repository;
}
