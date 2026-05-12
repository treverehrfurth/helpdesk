import type { UserRole } from "./users";

export type TicketStatus = string;
export type TicketCategory = string;

export type TicketStatusRecord = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type TicketAttachment = {
  id: string;
  fileName: string;
  storageUrl: string | null;
  createdAt: string;
};

export type TicketActivity = {
  id: string;
  actionType: string;
  actorEmail: string;
  actorName: string;
  oldValueJson: Record<string, unknown> | null;
  newValueJson: Record<string, unknown> | null;
  createdAt: string;
};

export type Ticket = {
  id: string;
  ticketNumber: number;
  requesterEmail: string;
  requesterName: string;
  title: string;
  category: TicketCategory;
  description: string;
  status: TicketStatus;
  assignedToEmail: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  attachments: TicketAttachment[];
  activity: TicketActivity[];
};

export type TicketSummary = Pick<
  Ticket,
  | "id"
  | "ticketNumber"
  | "title"
  | "category"
  | "status"
  | "requesterEmail"
  | "requesterName"
  | "assignedToEmail"
  | "assignedToName"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
>;

export type CategoryRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

export type CreateTicketInput = {
  title: string;
  category: TicketCategory;
  description: string;
  attachments: Array<Pick<TicketAttachment, "fileName">>;
  onBehalfOfEmail?: string;
  onBehalfOfName?: string;
  assignedToEmail?: string;
  assignedToName?: string;
};

export type CreateAttachmentUploadInput = {
  fileName: string;
  contentType?: string;
};

export type AttachmentUploadTarget = {
  uploadUrl: string;
  blobUrl: string;
  expiresOn: string;
};

export type UpdateTicketInput = {
  status?: TicketStatus;
  category?: TicketCategory;
  assignedToEmail?: string | null;
  assignedToName?: string | null;
};

export type TicketFilters = {
  status?: TicketStatus;
  category?: TicketCategory;
  assignee?: string;
  requester?: string;
  search?: string;
};

export type DashboardMetrics = {
  totalOpenTickets: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  recentTickets: TicketSummary[];
};

export type TicketMessage = {
  id: string;
  ticketId: string;
  authorEmail: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  createdAt: string;
};

export type CreateTicketMessageInput = {
  body: string;
};

export type NotificationRecord = {
  id: string;
  ticketId: string;
  actionType: "ticket_created" | "ticket_assigned" | "status_changed" | "new_message";
  actorEmail: string;
  actorName: string;
  title: string;
  message: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  items: NotificationRecord[];
  unreadCount: number;
};
